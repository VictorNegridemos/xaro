// Shared search types (plan 4.2 "Response shape") and the validation of the query string (plan 4.1).
import { z } from 'zod'
import type { EntityType } from '../data/types'
import { ENTITY_TYPES } from '../db/schema'

/** One piece of a snippet; h = highlighted (rendered as <mark>). Never HTML. */
export interface SnippetSegment {
  t: string
  h: boolean
}

export interface SearchResult {
  id: number
  type: EntityType
  name: string
  slug: string
  summary: string
  score: number
  snippet: SnippetSegment[]
}

export interface SearchSuggestion {
  name: string
  slug: string
}

export interface SearchResponse {
  q: string
  type: EntityType | null
  page: number
  pageSize: number
  total: number
  facets: Partial<Record<EntityType, number>>
  results: SearchResult[]
  suggestions: SearchSuggestion[]
}

export const PAGE_SIZE = 20
export const MAX_PAGE = 50
export const MAX_QUERY_CHARS = 200
/** Raw input longer than this is refused before any normalisation work is done. */
export const MAX_RAW_QUERY_CHARS = 2_000

/** What a caller may pass: the raw values of the query string (or of Next's searchParams). */
export interface SearchInput {
  q?: unknown
  type?: unknown
  page?: unknown
}

/** Validated values. `q` is not normalised yet (see normalizeQuery in query.ts). */
export interface SearchParams {
  q: string
  type: EntityType | null
  page: number
}

export type SearchInputErrorCode = 'query_too_long' | 'invalid_type' | 'invalid_page'

/** Thrown by search() for input that the API answers with 400. */
export class SearchInputError extends Error {
  readonly code: SearchInputErrorCode
  constructor(code: SearchInputErrorCode) {
    super(code)
    this.name = 'SearchInputError'
    this.code = code
  }
}

// A repeated parameter (?q=a&q=b) arrives as an array: the first value counts.
const first = (value: unknown): unknown => (Array.isArray(value) ? value[0] : value)
// An absent or empty parameter is "not given".
const optional = (value: unknown): unknown => {
  const v = first(value)
  return v === undefined || v === null || v === '' ? undefined : v
}

const qSchema = z.preprocess(optional, z.string().max(MAX_RAW_QUERY_CHARS).optional())
const typeSchema = z.preprocess(optional, z.enum(ENTITY_TYPES).optional())
const pageSchema = z.preprocess(
  optional,
  z.string().regex(/^\d{1,2}$/).transform(Number).pipe(z.number().int().min(1).max(MAX_PAGE)).optional(),
)

export type ParsedSearchInput =
  | { ok: true; value: SearchParams }
  | { ok: false; error: SearchInputErrorCode }

/** Shape and range checks only; the length limit of the normalised query is applied in query.ts. */
export function parseSearchInput(input: SearchInput): ParsedSearchInput {
  const q = qSchema.safeParse(input.q)
  if (!q.success) return { ok: false, error: 'query_too_long' }
  const type = typeSchema.safeParse(input.type)
  if (!type.success) return { ok: false, error: 'invalid_type' }
  const page = pageSchema.safeParse(input.page)
  if (!page.success) return { ok: false, error: 'invalid_page' }
  return { ok: true, value: { q: q.data ?? '', type: type.data ?? null, page: page.data ?? 1 } }
}
