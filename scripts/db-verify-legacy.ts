// npm run db:verify-legacy [-- --coverage | --drift] — read-only checks on the legacy tables (plan 3.4).
//   (default)  : current checksums equal backups/LATEST/checksums.json
//   --coverage : every legacy row has exactly one copy in entities; rows excluded under O1
//                (src/lib/data/legacy-exclusions.ts) must have none
//   --drift    : what changed in the legacy tables since each row was copied (backups/copy-log.json);
//                excluded rows are listed separately and never count as drift
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { excludedLegacyIds } from '../src/lib/data/legacy-exclusions'
import { runScript } from './lib/env'
import {
  BACKUPS_DIR, LEGACY_TABLES, computeLegacyChecksums, diffChecksums, latestBackupDir, readBackupChecksums,
} from './lib/legacy'
import { classifyDrift, coverageProblems, type CoverageRow } from './lib/legacy-checks'
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
    GROUP BY t.tbl, t.id
    ORDER BY t.tbl, t.id`)
  const problems = coverageProblems(rows.map((r): CoverageRow => ({ tbl: String(r.tbl), id: Number(r.id), copies: Number(r.copies) })))
  for (const line of problems) console.log(`  ${line}`)
  const perTable = await sql`
    SELECT legacy_table, count(*)::int AS n FROM public.entities WHERE legacy_table IS NOT NULL GROUP BY legacy_table ORDER BY legacy_table`
  console.log(`Copies in entities: ${perTable.map((r) => `${r.legacy_table} ${r.n}`).join(', ') || 'none'}`)
  const excluded = LEGACY_TABLES.map((t) => `${t.name} ${excludedLegacyIds(t.name).length}`).join(', ')
  console.log(`Excluded under O1 (expected without a copy): ${excluded}`)
  console.log(`${problems.length} rows without the expected number of copies${problems.length === 0 ? ' — OK.' : '.'}`)
  return problems.length === 0
}

interface CopyLogEntry { legacy_table: string; legacy_id: number; row_md5: string; entity_id: number; slug: string }

async function reportDrift(sql: Sql): Promise<boolean> {
  const logFile = path.join(BACKUPS_DIR, 'copy-log.json')
  if (!existsSync(logFile)) throw new Error('backups/copy-log.json not found: nothing has been copied from this PC.')
  const log = JSON.parse(readFileSync(logFile, 'utf8')) as CopyLogEntry[]
  const current = await computeLegacyChecksums(sql)
  let clean = true
  for (const table of LEGACY_TABLES) {
    const entries = log.filter((e) => e.legacy_table === table.name)
    const slugOf = new Map(entries.map((e) => [e.legacy_id, e.slug]))
    const live = new Map((current.rows[table.name] ?? []).map((r) => [r.id, r.md5]))
    const { notCopied, changed, gone, excludedIgnored } = classifyDrift(table.name, entries, live)
    console.log(`${table.name}: ${live.size} rows now, ${entries.length} in the copy log`)
    if (notCopied.length > 0) console.log(`  (a) no copy yet — run "npm run db:copy-legacy": ids [${notCopied.join(', ')}]`)
    for (const id of changed) console.log(`  (b) changed since it was copied — edit /entry/${slugOf.get(id)} by hand: id ${id}`)
    for (const id of gone) console.log(`  (c) legacy row is gone, the copy remains at /entry/${slugOf.get(id)}: id ${id}`)
    if (excludedIgnored.length > 0) console.log(`  (info) excluded under O1, changed or gone, ignored: ids [${excludedIgnored.join(', ')}]`)
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
