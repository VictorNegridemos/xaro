// tsx scripts/db-status.ts — read-only overview of the new tables and the migration bookkeeping.
import { runScript } from './lib/env'
import { openScriptDb } from './lib/script-db'

async function main(): Promise<void> {
  const { sql, close } = openScriptDb()
  try {
    const byType = await sql`SELECT type::text AS type, count(*)::int AS n FROM public.entities GROUP BY type ORDER BY type`
    console.log(`entities by type: ${byType.map((r) => `${r.type} ${r.n}`).join(', ') || 'none'}`)
    const byLegacy = await sql`
      SELECT coalesce(legacy_table, '(none)') AS t, count(*)::int AS n FROM public.entities GROUP BY 1 ORDER BY 1`
    console.log(`entities by legacy_table: ${byLegacy.map((r) => `${r.t} ${r.n}`).join(', ') || 'none'}`)
    for (const table of ['import_sources', 'entity_relations', 'auth_throttle']) {
      const n = (await sql.unsafe(`SELECT count(*)::int AS n FROM public.${table}`))[0]?.n
      console.log(`${table}: ${n} rows`)
    }
    const migrations = await sql`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`
    const objects = await sql`
      SELECT (SELECT count(*)::int FROM pg_extension WHERE extname = 'pg_trgm') AS trgm,
             (SELECT count(*)::int FROM pg_proc WHERE proname LIKE 'xaro%') AS functions,
             (SELECT count(*)::int FROM pg_trigger WHERE tgname = 'entities_set_updated_at') AS triggers,
             (SELECT count(*)::int FROM pg_indexes WHERE schemaname = 'public'
                AND tablename IN ('entities', 'entity_relations', 'import_sources', 'auth_throttle')) AS indexes`
    const o = objects[0]
    console.log(`migrations applied: ${migrations[0]?.n}; pg_trgm: ${o?.trgm}; xaro functions: ${o?.functions}; trigger: ${o?.triggers}; indexes on new tables: ${o?.indexes}`)
  } finally {
    await close()
  }
}

runScript(main)
