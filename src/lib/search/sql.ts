// The search statements (plan 4.2). The text below is the review-tested statement of the plan,
// VERBATIM (sql.test.ts compares it with scripts/sql/search-smoke.sql). Do not reformat it.
// Only the five numeric weights of the score expression may be tuned (plan 4.4).
//
// $1 is not the raw input: query.ts binds the de-duplicated words capped at MAX_QUERY_TERMS
// (searchTerms, fix round 1 F1), which keeps the ts_headline tsquery small; the text is unchanged.
//
// Values never enter the text: bindSql() turns every $n placeholder into a bound Drizzle parameter.
import { sql, type SQL } from 'drizzle-orm'

/** CTEs q, ids and cand: shared by the ranked query and the facet query. Parameters $1 to $3. */
export const CANDIDATE_CTES = `WITH q AS (
  SELECT
    $1::text AS raw,
    $2::text AS folded,
    (   websearch_to_tsquery('english'::regconfig, $1::text)
     || websearch_to_tsquery('simple'::regconfig,  $1::text)
     || websearch_to_tsquery('english'::regconfig, $2::text)
     || websearch_to_tsquery('simple'::regconfig,  $2::text) ) AS tsq,
    CASE WHEN $3::text <> '' THEN to_tsquery('simple'::regconfig, $3::text) END AS prefix_tsq
),
ids AS (
  SELECT e.id FROM public.entities e WHERE e.search_vector @@ (SELECT tsq FROM q)
  UNION
  SELECT e.id FROM public.entities e WHERE e.search_vector @@ (SELECT prefix_tsq FROM q)
  UNION
  SELECT e.id FROM public.entities e WHERE e.name % (SELECT raw FROM q)
  UNION
  SELECT e.id FROM public.entities e WHERE (SELECT raw FROM q) <% e.name
  UNION
  SELECT e.id FROM public.entities e WHERE (SELECT raw FROM q) <% public.xaro_array_to_text(e.aliases)
  UNION
  SELECT e.id FROM public.entities e WHERE char_length(e.name) >= 4 AND e.name <% (SELECT raw FROM q)
  UNION
  SELECT e.id FROM public.entities e WHERE starts_with(lower(e.name), lower((SELECT raw FROM q)))
),
cand AS (
  SELECT
    e.id, e.type, e.name, e.slug, e.summary, e.body,
    ts_rank_cd('{0.05, 0.2, 0.5, 1.0}'::float4[], e.search_vector, q.tsq, 32) AS fts,
    CASE WHEN q.prefix_tsq IS NULL THEN 0
         ELSE ts_rank_cd('{0.05, 0.2, 0.5, 1.0}'::float4[], e.search_vector, q.prefix_tsq, 32) END AS pfx,
    GREATEST(
      similarity(e.name, q.raw),
      word_similarity(q.raw, e.name),
      word_similarity(q.raw, public.xaro_array_to_text(e.aliases)),
      CASE WHEN char_length(e.name) >= 4 THEN word_similarity(e.name, q.raw) ELSE 0 END
    ) AS trgm,
    (   lower(e.name) = lower(q.raw)
     OR translate(lower(e.name), '''\`' || chr(8217), '') = lower(q.folded)
     OR EXISTS (SELECT 1 FROM unnest(e.aliases) AS a WHERE lower(a) = lower(q.raw)) ) AS exact,
    starts_with(lower(e.name), lower(q.raw)) AS name_prefix
  FROM ids
  JOIN public.entities e ON e.id = ids.id
  CROSS JOIN q
),
`

/** Rest of the ranked query. Parameters $4 type or NULL, $5 limit, $6 offset, $7 headline options. */
export const RANKED_TAIL = `scored AS (
  SELECT c.*,
         (  1.00 * c.fts
          + 0.50 * c.pfx
          + 0.90 * c.trgm
          + CASE WHEN c.exact THEN 1.50 ELSE 0 END
          + CASE WHEN c.name_prefix THEN 0.40 ELSE 0 END )::float8 AS score
  FROM cand c
),
filtered AS (
  SELECT s.*, count(*) OVER () AS total
  FROM scored s
  WHERE ($4::text IS NULL OR s.type = $4::public.entity_type)
),
page AS (
  SELECT * FROM filtered
  ORDER BY score DESC, name ASC, id ASC
  LIMIT $5 OFFSET $6
)
SELECT p.id, p.type, p.name, p.slug, p.summary, p.score, p.total::int AS total,
       ts_headline(
         'english'::regconfig,
         translate(CASE WHEN p.body <> '' THEN p.body ELSE p.summary END, chr(1) || chr(2), ''),
         CASE WHEN q.prefix_tsq IS NULL THEN q.tsq ELSE q.tsq || q.prefix_tsq END,
         $7::text
       ) AS snippet
FROM page p
CROSS JOIN q
ORDER BY p.score DESC, p.name ASC, p.id ASC;
`

/** $1 q, $2 folded, $3 prefix, $4 type or NULL, $5 limit, $6 offset, $7 hlOptions. */
export const SEARCH_SQL = CANDIDATE_CTES + RANKED_TAIL

/** Same candidates, counted per type (the last CTE loses its trailing comma). $1 q, $2 folded, $3 prefix. */
export const FACETS_SQL =
  CANDIDATE_CTES.replace(/,\s*$/, '\n') + 'SELECT type, count(*)::int AS n FROM cand GROUP BY type'

/** "Did you mean" (only when nothing matched). $1 q. */
export const SUGGEST_SQL =
  'SELECT name, slug FROM public.entities WHERE similarity(name, $1) > 0.15 ORDER BY similarity(name, $1) DESC, name LIMIT 3'

/**
 * Builds a Drizzle SQL object from a statement text with $1..$n placeholders. The text is passed
 * through unchanged and every placeholder becomes a bound parameter (a placeholder that occurs
 * twice is bound twice; the driver numbers them itself). No value is ever interpolated into the text.
 */
export function bindSql(text: string, params: readonly unknown[]): SQL {
  const chunks: SQL[] = []
  let last = 0
  for (const match of text.matchAll(/\$(\d+)/g)) {
    const index = Number(match[1]) - 1
    if (index < 0 || index >= params.length) {
      throw new Error(`Statement uses placeholder ${match[0]} but ${params.length} parameter(s) were given`)
    }
    chunks.push(sql.raw(text.slice(last, match.index)))
    chunks.push(sql`${params[index] ?? null}`)
    last = match.index + match[0].length
  }
  chunks.push(sql.raw(text.slice(last)))
  return sql.join(chunks)
}

export interface RankedParams {
  q: string
  folded: string
  prefix: string
  type: string | null
  limit: number
  offset: number
  hlOptions: string
}

export function rankedQuery(p: RankedParams): SQL {
  return bindSql(SEARCH_SQL, [p.q, p.folded, p.prefix, p.type, p.limit, p.offset, p.hlOptions])
}

export function facetsQuery(p: Pick<RankedParams, 'q' | 'folded' | 'prefix'>): SQL {
  return bindSql(FACETS_SQL, [p.q, p.folded, p.prefix])
}

export function suggestQuery(q: string): SQL {
  return bindSql(SUGGEST_SQL, [q])
}
