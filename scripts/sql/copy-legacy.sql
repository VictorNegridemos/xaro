WITH crew AS (
  SELECT c.id,
         nullif(nullif(btrim(c.first_name), ''), '??')     AS fn,
         nullif(nullif(btrim(c.last_name), ''), '??')      AS ln,
         nullif(nullif(btrim(c.crew_rank), ''), '??')      AS rnk,
         nullif(nullif(btrim(c.race), ''), '??')           AS race,
         nullif(nullif(btrim(c.composition), ''), '??')    AS comp,
         nullif(nullif(btrim(c.expertise), ''), '??')      AS expertise,
         jsonb_strip_nulls(jsonb_build_object(
           'first_name', c.first_name, 'last_name', c.last_name, 'crew_rank', c.crew_rank,
           'race', c.race, 'composition', c.composition,
           'current_status', c.current_status, 'expertise', c.expertise)) AS attributes
  FROM public.crew_members c
),
sub AS (
  SELECT s.id, s.details,
         nullif(btrim(s.current), '') AS cur,
         CASE WHEN nullif(btrim(s.type), '') IS NULL THEN NULL
              WHEN char_length(btrim(s.type)) <= 3 THEN upper(btrim(s.type))
              ELSE initcap(lower(btrim(s.type))) END AS cat,
         nullif(btrim(s.status), '') AS st,
         nullif(btrim(s.value), '')  AS val,
         jsonb_strip_nulls(jsonb_build_object(
           'type', s.type, 'status', s.status, 'current', s.current, 'value', s.value)) AS attributes
  FROM public.ship_subsystems s
),
sub_named AS (
  SELECT sub.*,
         coalesce(
           CASE WHEN sub.cur IS NULL OR lower(sub.cur) IN ('unknown', '??') THEN sub.cat ELSE sub.cur END,
           'Subsystem ' || sub.id) AS name
  FROM sub
),
src AS (
  -- crew_members -> character
  SELECT 'crew_members'::text AS legacy_table, crew.id AS legacy_id, 1 AS tbl_ord,
         'character'::public.entity_type AS type,
         coalesce(nullif(concat_ws(' ', crew.fn, crew.ln), ''), 'Crew member ' || crew.id) AS name,
         CASE WHEN crew.fn IS NOT NULL AND crew.ln IS NOT NULL
              THEN ARRAY[crew.fn, crew.ln] ELSE '{}'::text[] END AS aliases,
         concat_ws(' ',
           crew.rnk || '.',
           nullif(concat_ws(', ', crew.race, crew.comp), '') || '.',
           'Expertise: ' || crew.expertise || '.') AS summary,
         ''::text AS body,
         crew.attributes
  FROM crew
  UNION ALL
  -- ship_subsystems -> ship_system
  SELECT 'ship_subsystems', n.id, 2,
         'ship_system'::public.entity_type,
         n.name,
         CASE WHEN n.cat IS NULL OR lower(n.cat) = lower(n.name)
              THEN '{}'::text[] ELSE ARRAY[n.cat] END,
         concat_ws(' ',
           n.cat || ' system, ' || coalesce(n.st, 'status unknown') || '.',
           'Current capability: ' || CASE WHEN lower(n.val) IN ('unknown', '??') THEN NULL ELSE n.val END || '.'),
         coalesce(n.details, ''),
         n.attributes
  FROM sub_named n
  UNION ALL
  -- ship_records -> record                                    [O1] all rows
  SELECT 'ship_records', r.id, 3,
         'record'::public.entity_type,
         coalesce(nullif(btrim(r.title), ''), 'Record ' || r.id),
         '{}'::text[],
         ''::text,
         coalesce(r.text, ''),
         CASE WHEN r.title IS NOT DISTINCT FROM coalesce(nullif(btrim(r.title), ''), 'Record ' || r.id)
              THEN '{}'::jsonb
              ELSE jsonb_strip_nulls(jsonb_build_object('title', r.title)) END
  FROM public.ship_records r
),
slugged AS (
  SELECT s.*,
         coalesce(
           nullif(btrim(left(btrim(lower(regexp_replace(s.name, '[^A-Za-z0-9]+', '-', 'g')), '-'), 80), '-'), ''),
           replace(s.type::text, '_', '-') || '-' || s.legacy_id) AS base
  FROM src s
),
todo AS (
  SELECT g.* FROM slugged g
  WHERE NOT EXISTS (SELECT 1 FROM public.entities e
                    WHERE e.legacy_table = g.legacy_table AND e.legacy_id = g.legacy_id)
),
ranked AS (
  SELECT t.*,
         row_number() OVER (PARTITION BY t.base ORDER BY t.tbl_ord, t.legacy_id) AS rn,
         EXISTS (SELECT 1 FROM public.entities e WHERE e.slug = t.base) AS base_taken
  FROM todo t
),
final AS (
  SELECT r.*,
         CASE WHEN r.rn = 1 AND NOT r.base_taken AND r.base <> 'new'
              THEN r.base
              ELSE r.base || '-' || r.legacy_id END AS slug
  FROM ranked r
)
INSERT INTO public.entities
  (type, name, slug, aliases, summary, body, attributes, legacy_table, legacy_id, created_at, updated_at)
SELECT f.type, f.name, f.slug, f.aliases, f.summary, f.body, f.attributes, f.legacy_table, f.legacy_id,
       now() - interval '5 seconds' + (f.tbl_ord * 1000000 + f.legacy_id) * interval '1 microsecond',
       now() - interval '5 seconds' + (f.tbl_ord * 1000000 + f.legacy_id) * interval '1 microsecond'
FROM final f
ORDER BY f.tbl_ord, f.legacy_id
ON CONFLICT (legacy_table, legacy_id) WHERE legacy_table IS NOT NULL DO NOTHING
RETURNING id, legacy_table, legacy_id, type, name, slug;
