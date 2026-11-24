SELECT 'crew_members' AS tbl, count(*)::int AS n, md5(coalesce(string_agg(x::text, E'\n' ORDER BY x.id), '')) AS md5 FROM public.crew_members x
UNION ALL
SELECT 'ship_subsystems', count(*)::int, md5(coalesce(string_agg(x::text, E'\n' ORDER BY x.id), '')) FROM public.ship_subsystems x
UNION ALL
SELECT 'ship_records', count(*)::int, md5(coalesce(string_agg(x::text, E'\n' ORDER BY x.id), '')) FROM public.ship_records x;
