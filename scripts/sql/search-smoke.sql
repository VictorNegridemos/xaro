WITH q AS (
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
     OR translate(lower(e.name), '''`' || chr(8217), '') = lower(q.folded)
     OR EXISTS (SELECT 1 FROM unnest(e.aliases) AS a WHERE lower(a) = lower(q.raw)) ) AS exact,
    starts_with(lower(e.name), lower(q.raw)) AS name_prefix
  FROM ids
  JOIN public.entities e ON e.id = ids.id
  CROSS JOIN q
),
scored AS (
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
