// npm run verify:cleanup [-- --snapshot | --compare | --throttle] — verification data in the NEW tables (plan 10.1).
//   --snapshot : store count + md5 of entities and entity_relations in backups/verify-<ts>.json
//   (default)  : remove marked verification rows (one transaction, new tables only), print counts
//   --compare  : recompute and compare with the latest snapshot
//   --throttle : only DELETE FROM auth_throttle
// Never touches the legacy tables.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { runScript } from './lib/env'
import { BACKUPS_DIR, utcStamp } from './lib/legacy'
import { openScriptDb, type Sql } from './lib/script-db'

interface TableState { n: number; md5: string }
interface Snapshot { takenAt: string; entities: TableState; entity_relations: TableState }

// Explicit column lists: updated_at and search_vector are left out on purpose.
const ENTITIES_STATE = `
  SELECT count(*)::int AS n,
         md5(coalesce(string_agg(ROW(e.id, e.type, e.name, e.slug, e.aliases, e.summary, e.body, e.attributes,
                                     e.source_id, e.legacy_table, e.legacy_id, e.created_at)::text, E'\\n' ORDER BY e.id), '')) AS md5
  FROM public.entities e`
const RELATIONS_STATE = `
  SELECT count(*)::int AS n,
         md5(coalesce(string_agg(ROW(r.id, r.from_entity_id, r.to_entity_id, r.kind, r.note, r.source_id, r.created_at)::text,
                                 E'\\n' ORDER BY r.id), '')) AS md5
  FROM public.entity_relations r`

async function currentState(sql: Sql): Promise<Omit<Snapshot, 'takenAt'>> {
  const read = async (statement: string): Promise<TableState> => {
    const row = (await sql.unsafe(statement))[0]
    return { n: Number(row?.n), md5: String(row?.md5) }
  }
  return { entities: await read(ENTITIES_STATE), entity_relations: await read(RELATIONS_STATE) }
}

function latestSnapshotFile(): string {
  const files = readdirSync(BACKUPS_DIR).filter((name) => /^verify-\d{8}T\d{6}Z\.json$/.test(name)).sort()
  const last = files.at(-1)
  if (!last) throw new Error('No snapshot found. Run "npm run verify:cleanup -- --snapshot" first.')
  return path.join(BACKUPS_DIR, last)
}

async function snapshot(sql: Sql): Promise<void> {
  const stamp = utcStamp()
  const state: Snapshot = { takenAt: stamp, ...(await currentState(sql)) }
  mkdirSync(BACKUPS_DIR, { recursive: true })
  writeFileSync(path.join(BACKUPS_DIR, `verify-${stamp}.json`), `${JSON.stringify(state, null, 2)}\n`)
  console.log(`Snapshot backups/verify-${stamp}.json: entities ${state.entities.n} (${state.entities.md5}), entity_relations ${state.entity_relations.n} (${state.entity_relations.md5})`)
}

async function compare(sql: Sql): Promise<boolean> {
  const file = latestSnapshotFile()
  const before = JSON.parse(readFileSync(file, 'utf8')) as Snapshot
  const now = await currentState(sql)
  let equal = true
  for (const table of ['entities', 'entity_relations'] as const) {
    const same = before[table].n === now[table].n && before[table].md5 === now[table].md5
    equal &&= same
    console.log(`${table}: snapshot ${before[table].n} (${before[table].md5}) / now ${now[table].n} (${now[table].md5}) — ${same ? 'equal' : 'DIFFERENT'}`)
  }
  console.log(equal ? `OK — equal to ${path.basename(file)}.` : `DIFFERENT from ${path.basename(file)}.`)
  return equal
}

async function clearThrottle(sql: Sql): Promise<void> {
  const rows = await sql`DELETE FROM public.auth_throttle RETURNING bucket`
  console.log(`auth_throttle: ${rows.length} rows deleted`)
}

async function removeVerificationRows(sql: Sql): Promise<void> {
  const counts = await sql.begin(async (tx) => {
    const relations = await tx`DELETE FROM public.entity_relations WHERE source_id IN (SELECT id FROM public.import_sources WHERE filename LIKE 'zz-verify-%') RETURNING id`
    const imported = await tx`DELETE FROM public.entities WHERE source_id IN (SELECT id FROM public.import_sources WHERE filename LIKE 'zz-verify-%') RETURNING id`
    const marked = await tx`DELETE FROM public.entities WHERE name LIKE 'ZZ-VERIFY %' OR attributes ? 'zz_verify' RETURNING id`
    const sources = await tx`DELETE FROM public.import_sources WHERE filename LIKE 'zz-verify-%' RETURNING id`
    const throttle = await tx`DELETE FROM public.auth_throttle RETURNING bucket`
    return { relations: relations.length, imported: imported.length, marked: marked.length, sources: sources.length, throttle: throttle.length }
  })
  console.log(`Removed: entity_relations ${counts.relations}, imported entities ${counts.imported}, marked entities ${counts.marked}, import_sources ${counts.sources}, auth_throttle ${counts.throttle}`)
}

async function main(): Promise<void> {
  const { sql, close } = openScriptDb()
  try {
    if (process.argv.includes('--snapshot')) await snapshot(sql)
    else if (process.argv.includes('--compare')) {
      if (!(await compare(sql))) process.exitCode = 1
    } else if (process.argv.includes('--throttle')) await clearThrottle(sql)
    else await removeVerificationRows(sql)
  } finally {
    await close()
  }
}

runScript(main)
