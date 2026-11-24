// Search request handling (plan 4.1). search() is used by GET /api/search, by the /search page
// (the page calls the function, not the API) and by scripts/search-eval.ts.
import { asc, eq, sql } from 'drizzle-orm'
import type { EntityType } from '../data/types'
import { getDb, type DbOrTx } from '../db/client'
import { entities } from '../db/schema'
import { HEADLINE_OPTIONS, parseHeadline, plainSnippet } from './highlight'
import {
  MAX_QUERY_CHARS, PAGE_SIZE, SearchInputError, parseSearchInput,
  type SearchInput, type SearchParams, type SearchResponse, type SearchResult, type SearchSuggestion,
} from './schema'
import { facetsQuery, rankedQuery, suggestQuery } from './sql'

const MAX_PREFIX_TOKENS = 8
/**
 * At most this many distinct words (letter/digit runs) of a query reach the database (fix round 1,
 * F1). A repeated word made ts_headline allocate memory combinatorially (`warp`×40 dropped the
 * database connection); distinct words are cheap. 8 equals the prefix-token cap of plan 4.1.
 */
export const MAX_QUERY_TERMS = 8
const MAX_PREFIX_TOKEN_CHARS = 40
const MIN_SUGGEST_CHARS = 3

/**
 * NFKC, control characters removed, whitespace collapsed, trimmed, leading minus signs dropped.
 * `websearch_to_tsquery` turns `-foo` into `!'foo'`, which would match every row that lacks the
 * word (the whole archive); inner hyphens such as `semi-organic` are untouched.
 */
export function normalizeQuery(raw: string): string {
  return raw
    .normalize('NFKC')
    .replace(/\s+/gu, ' ')         // tabs and line breaks count as spaces
    .replace(/\p{Cc}/gu, '')       // every other control character is removed
    .trim()
    .replace(/(^|\s)-+(?=\S)/g, '$1')    // plan 4.1: `-warp` -> `warp`, `a -b` -> `a b`
    .replace(/(^|\s)-+(?=\s|$)/g, '$1')  // a token of minus signs only (`--`) carries nothing
    .replace(/\s+/gu, ' ')
    .trim()
}

/** Removes ', ’ and ` where they sit between two letters or digits: "O'Dun" -> "ODun". */
export function foldApostrophes(q: string): string {
  return q.replace(/(?<=[\p{L}\p{N}])['’`](?=[\p{L}\p{N}])/gu, '')
}

// A word: letter/digit runs, optionally joined by inner apostrophes or hyphens ("O'Dun", "semi-organic").
const WORD = /[\p{L}\p{M}\p{N}]+(?:['’`-][\p{L}\p{M}\p{N}]+)*/gu
const RUN_SEPARATOR = /['’`-]/u

/**
 * The words of an already normalised query that are bound as `$1` (plan 4.2), de-duplicated and
 * capped (fix round 1, F1/F3):
 * - only words survive; tokens without a letter or digit (emoji, `&`, `|`, quotes) carry nothing for
 *   the full-text or trigram arms and are dropped, so `🚀 warp` binds `warp` and keeps the exact-name
 *   bonus (F3). Side effect: websearch quotes no longer form a phrase (`"queen of lies"` = queen of lies);
 * - a word whose apostrophe-folded, lower-cased form was already seen is dropped (`Warp warp`, `O'Dun ODun`);
 * - within the query every letter/digit run counts once: a word that repeats a run (`warp-warp`,
 *   `x'x'x`) keeps only its new runs, joined by spaces;
 * - at most MAX_QUERY_TERMS runs in total.
 */
export function searchTerms(q: string): string {
  const seenWords = new Set<string>()
  const seenRuns = new Set<string>()
  const out: string[] = []
  let runs = 0
  for (const word of q.match(WORD) ?? []) {
    if (runs >= MAX_QUERY_TERMS) break
    const wordKey = foldApostrophes(word).toLowerCase()
    if (seenWords.has(wordKey)) continue
    seenWords.add(wordKey)
    const parts = word.split(RUN_SEPARATOR)
    const fresh: string[] = []
    for (const part of parts) {
      const key = part.toLowerCase()
      if (seenRuns.has(key) || runs >= MAX_QUERY_TERMS) continue
      seenRuns.add(key)
      fresh.push(part)
      runs += 1
    }
    if (fresh.length === 0) continue
    out.push(fresh.length === parts.length ? word : fresh.join(' '))
  }
  return out.join(' ')
}

function prefixTokens(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
    .slice(0, MAX_PREFIX_TOKENS)
    .map((token) => Array.from(token).slice(0, MAX_PREFIX_TOKEN_CHARS).join(''))
}

/**
 * The to_tsquery string for prefix matching: every token suffixed `:*`, joined with ` & `;
 * `(<q>) | (<folded>)` when the two forms differ; '' when there is no token.
 * Only letters, digits and the characters `:*&|() ` can reach to_tsquery.
 */
export function buildPrefixQuery(q: string, folded: string): string {
  const build = (text: string) => prefixTokens(text).map((token) => `${token}:*`).join(' & ')
  const a = build(q)
  const b = build(folded)
  if (a === '' || b === '' || a === b) return a || b
  return `(${a}) | (${b})`
}

export interface PreparedSearch extends SearchParams {
  /** De-duplicated, capped words of `q` (searchTerms); bound as `$1`. '' when `q` has no word. */
  terms: string
  /** `terms` with apostrophes folded; bound as `$2`. */
  folded: string
  prefix: string
}

/** Validates and normalises raw input. Throws SearchInputError for input the API answers with 400. */
export function prepareSearch(input: SearchInput): PreparedSearch {
  const parsed = parseSearchInput(input)
  if (!parsed.ok) throw new SearchInputError(parsed.error)
  const q = normalizeQuery(parsed.value.q)
  if (Array.from(q).length > MAX_QUERY_CHARS) throw new SearchInputError('query_too_long')
  const terms = searchTerms(q)
  const folded = foldApostrophes(terms)
  return {
    q, type: parsed.value.type, page: parsed.value.page, terms, folded, prefix: buildPrefixQuery(terms, folded),
  }
}

export interface FacetRow { type: EntityType; n: number }

/** Row of the ranked statement. `total` is part of the tested text but is not used (see totalFromFacets). */
export interface RankedRow {
  id: number
  type: EntityType
  name: string
  slug: string
  summary: string
  score: number | string
  total?: number
  snippet: string | null
}

export function facetsFromRows(rows: readonly FacetRow[]): Partial<Record<EntityType, number>> {
  const facets: Partial<Record<EntityType, number>> = {}
  for (const row of rows) {
    const n = Number(row.n)
    if (n > 0) facets[row.type] = n
  }
  return facets
}

/**
 * The total comes from the facet counts, never from `count(*) OVER ()` of the page query, which
 * returns no row (and so no total) when the page is past the end.
 */
export function totalFromFacets(facets: Partial<Record<EntityType, number>>, type: EntityType | null): number {
  if (type) return facets[type] ?? 0
  return Object.values(facets).reduce((sum, n) => sum + n, 0)
}

export function toResults(rows: readonly RankedRow[]): SearchResult[] {
  return rows.map((row) => ({
    id: Number(row.id),
    type: row.type,
    name: row.name,
    slug: row.slug,
    summary: row.summary,
    score: Math.round(Number(row.score) * 10_000) / 10_000,
    snippet: parseHeadline(row.snippet ?? ''),
  }))
}

export function buildResponse(
  params: SearchParams,
  rows: readonly RankedRow[],
  facetRows: readonly FacetRow[],
  suggestions: readonly SearchSuggestion[] = [],
): SearchResponse {
  const facets = facetsFromRows(facetRows)
  return {
    q: params.q,
    type: params.type,
    page: params.page,
    pageSize: PAGE_SIZE,
    total: totalFromFacets(facets, params.type),
    facets,
    results: toResults(rows),
    suggestions: [...suggestions],
  }
}

async function browse(params: SearchParams & { type: EntityType }, db: DbOrTx): Promise<SearchResponse> {
  const [rows, facetRows] = await Promise.all([
    db.select({
      id: entities.id, type: entities.type, name: entities.name, slug: entities.slug, summary: entities.summary,
    }).from(entities).where(eq(entities.type, params.type))
      .orderBy(asc(entities.name), asc(entities.id))
      .limit(PAGE_SIZE).offset((params.page - 1) * PAGE_SIZE),
    db.select({ type: entities.type, n: sql<number>`count(*)::int` }).from(entities).groupBy(entities.type),
  ])
  const facets = facetsFromRows(facetRows)
  return {
    q: '',
    type: params.type,
    page: params.page,
    pageSize: PAGE_SIZE,
    total: totalFromFacets(facets, params.type),
    facets,
    results: rows.map((row) => ({ ...row, score: 0, snippet: plainSnippet(row.summary) })),
    suggestions: [],
  }
}

/**
 * Modes: empty q and no type -> empty result, no query; empty q with a type -> browse list
 * ordered by name, snippet = summary; otherwise the ranked statement of plan 4.2.
 */
export async function search(input: SearchInput, db: DbOrTx = getDb()): Promise<SearchResponse> {
  const prepared = prepareSearch(input)
  const params: SearchParams = { q: prepared.q, type: prepared.type, page: prepared.page }

  if (prepared.q === '') {
    if (prepared.type === null) return buildResponse(params, [], [])
    return browse({ ...params, type: prepared.type }, db)
  }
  // Only punctuation or symbols (`%`, `!!!`, an emoji): nothing can match, no query is sent.
  if (prepared.terms === '') return buildResponse(params, [], [])

  const bound = { q: prepared.terms, folded: prepared.folded, prefix: prepared.prefix }
  const [rows, facetRows] = await Promise.all([
    db.execute(rankedQuery({
      ...bound,
      type: prepared.type,
      limit: PAGE_SIZE,
      offset: (prepared.page - 1) * PAGE_SIZE,
      hlOptions: HEADLINE_OPTIONS,
    })),
    db.execute(facetsQuery(bound)),
  ])
  const response = buildResponse(
    params, rows as unknown as RankedRow[], facetRows as unknown as FacetRow[],
  )

  if (response.total === 0 && Array.from(prepared.terms).length >= MIN_SUGGEST_CHARS) {
    const suggested = await db.execute(suggestQuery(prepared.terms))
    response.suggestions = (suggested as unknown as SearchSuggestion[])
      .map((row) => ({ name: row.name, slug: row.slug }))
  }
  return response
}
