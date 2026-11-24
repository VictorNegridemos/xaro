// npm run db:verify-legacy [-- --coverage | --drift] — read-only checks on the legacy tables (plan 3.4).
//   (default)  : current checksums equal backups/LATEST/checksums.json
//   --coverage : every legacy row has exactly one copy in entities
//   --drift    : what changed in the legacy tables since each row was copied (backups/copy-log.json)
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { runScript } from './lib/env'
import {
  BACKUPS_DIR, LEGACY_TABLES, computeLegacyChecksums, diffChecksums, latestBackupDir, readBackupChecksums,
} from './lib/legacy'
import { openScriptDb, type Sql } from './lib/script-db'

async function verifyChecksums(sql: Sql): Promise<boolean> {
  const dir = latestBackupDir()
  if (!dir) throw new Error('No backup found (backups/LATEST). Run "npm run db:backup" first.')
  const diff = diffChecksums(readBackupChecksums(dir), await computeLegacyChecksums(sql))
  console.log(`Legacy tables vs backup ${path.basename(dir)}:`)
  for (const line of diff.lines) console.log(`  ${line}`)
  console.log(diff.equal ? 'OK — no differences.' : 'DIFFERENT — see above.')
  return diff.equal
}

async function verifyCoverage(sql: Sql): Promise<boolean> {
  const rows = await sql.unsafe(`
    SELECT t.tbl, t.id, count(e.id)::int AS copies FROM (
      SELECT 'crew_members' AS tbl, id FROM public.crew_members
      UNION ALL SELECT 'ship_subsystems', id FROM public.ship_subsystems
      UNION ALL SELECT 'ship_records', id FROM public.ship_records) t
    LEFT JOIN public.entities e ON e.legacy_table = t.tbl AND e.legacy_id = t.id
    GROUP BY t.tbl, t.id HAVING count(e.id) <> 1
    ORDER BY t.tbl, t.id`)
  for (const row of rows) console.log(`  ${row.tbl} ${row.id}: ${row.copies} copies`)
  const perTable = await sql`
    SELECT legacy_table, count(*)::int AS n FROM public.entities WHERE legacy_table IS NOT NULL GROUP BY legacy_table ORDER BY legacy_table`
  console.log(`Copies in entities: ${perTable.map((r) => `${r.legacy_table} ${r.n}`).join(', ') || 'none'}`)
  console.log(`${rows.length} rows without exactly one copy${rows.length === 0 ? ' — OK.' : '.'}`)
  return rows.length === 0
}

interface CopyLogEntry { legacy_table: string; legacy_id: number; row_md5: string; entity_id: number; slug: string }

async function reportDrift(sql: Sql): Promise<boolean> {
  const logFile = path.join(BACKUPS_DIR, 'copy-log.json')
  if (!existsSync(logFile)) throw new Error('backups/copy-log.json not found: nothing has been copied from this PC.')
  const log = JSON.parse(readFileSync(logFile, 'utf8')) as CopyLogEntry[]
  const current = await computeLegacyChecksums(sql)
  let clean = true
  for (const table of LEGACY_TABLES) {
    const copied = new Map(log.filter((e) => e.legacy_table === table.name).map((e) => [e.legacy_id, e]))
    const live = new Map((current.rows[table.name] ?? []).map((r) => [r.id, r.md5]))
    const notCopied = [...live.keys()].filter((id) => !copied.has(id))
    const changed = [...live.keys()].filter((id) => copied.has(id) && copied.get(id)?.row_md5 !== live.get(id))
    const gone = [...copied.keys()].filter((id) => !live.has(id))
    console.log(`${table.name}: ${live.size} rows now, ${copied.size} in the copy log`)
    if (notCopied.length > 0) console.log(`  (a) no copy yet — run "npm run db:copy-legacy": ids [${notCopied.join(', ')}]`)
    for (const id of changed) console.log(`  (b) changed since it was copied — edit /entry/${copied.get(id)?.slug} by hand: id ${id}`)
    for (const id of gone) console.log(`  (c) legacy row is gone, the copy remains at /entry/${copied.get(id)?.slug}: id ${id}`)
    if (notCopied.length + changed.length + gone.length > 0) clean = false
  }
  console.log(clean ? 'No drift.' : 'Drift found — see above. Nothing was changed.')
  return clean
}

async function main(): Promise<void> {
  const { sql, close } = openScriptDb()
  try {
    const ok = process.argv.includes('--coverage') ? await verifyCoverage(sql)
      : process.argv.includes('--drift') ? await reportDrift(sql)
        : await verifyChecksums(sql)
    if (!ok) process.exitCode = 1
  } finally {
    await close()
  }
}

runScript(main)
