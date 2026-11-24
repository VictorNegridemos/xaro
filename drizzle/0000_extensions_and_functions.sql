CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.xaro_array_to_text(text[])
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT coalesce(array_to_string($1, ' '), '')
$$;
--> statement-breakpoint
-- Returns the words of src that contain an inner apostrophe, with the
-- apostrophes removed, separated by spaces.  "X'aro and Kal O'Dun" -> "Xaro ODun"
-- chr(8217) is the typographic apostrophe; the file stays pure ASCII.
CREATE OR REPLACE FUNCTION public.xaro_fold_apostrophes(src text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT coalesce(
    (SELECT string_agg(translate(m.parts[1], '''`' || chr(8217), ''), ' ' ORDER BY m.ord)
       FROM regexp_matches(
              coalesce(src, ''),
              '([[:alnum:]]+(?:[''`' || chr(8217) || '][[:alnum:]]+)+)',
              'g'
            ) WITH ORDINALITY AS m(parts, ord)),
    '')
$$;
--> statement-breakpoint
-- Weights: A = name + aliases, B = summary, C = body, D = attribute string values.
-- Name and aliases: 'simple' (exact invented names) + 'english' (plurals) + apostrophe-folded.
CREATE OR REPLACE FUNCTION public.xaro_entity_search_vector(
  p_name text, p_aliases text[], p_summary text, p_body text, p_attributes jsonb
)
RETURNS tsvector
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT
       setweight(to_tsvector('simple'::regconfig,  coalesce(p_name, '')), 'A')
    || setweight(to_tsvector('english'::regconfig, coalesce(p_name, '')), 'A')
    || setweight(to_tsvector('simple'::regconfig,  public.xaro_fold_apostrophes(p_name)), 'A')
    || setweight(to_tsvector('simple'::regconfig,  public.xaro_array_to_text(p_aliases)), 'A')
    || setweight(to_tsvector('english'::regconfig, public.xaro_array_to_text(p_aliases)), 'A')
    || setweight(to_tsvector('simple'::regconfig,  public.xaro_fold_apostrophes(public.xaro_array_to_text(p_aliases))), 'A')
    || setweight(to_tsvector('english'::regconfig, coalesce(p_summary, '')), 'B')
    || setweight(to_tsvector('english'::regconfig, public.xaro_fold_apostrophes(p_summary)), 'B')
    || setweight(to_tsvector('english'::regconfig, coalesce(p_body, '')), 'C')
    || setweight(to_tsvector('english'::regconfig, public.xaro_fold_apostrophes(p_body)), 'C')
    || setweight(jsonb_to_tsvector('english'::regconfig, coalesce(p_attributes, '{}'::jsonb), '["string"]'::jsonb), 'D')
$$;
