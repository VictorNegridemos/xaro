// The three legacy tables, as read-only sources for the backup, copy and verify scripts (K13).
// Nothing in this project ever writes to them.
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { Sql, TxSql } from './script-db'

export interface LegacyTableSpec {
  name: string
  /** Column order of the live table; id first. */
  columns: readonly string[]
  /** crew_members.id is GENERATED ALWAYS AS IDENTITY. */
  overridingSystemValue: boolean
  sequence: string
}

export const LEGACY_TABLES: readonly LegacyTableSpec[] = [
  {
    name: 'crew_members',
    columns: ['id', 'first_name', 'last_name', 'crew_rank', 'race', 'composition', 'current_status', 'expertise'],
    overridingSystemValue: true,
    sequence: 'crew_members_id_seq',
  },
  {
    name: 'ship_subsystems',
    columns: ['id', 'type', 'status', 'current', 'value', 'details'],
    overridingSystemValue: false,
    sequence: 'ship_subsystems_id_seq',
  },
  {
    name: 'ship_records',
    columns: ['id', 'title', 'text'],
    overridingSystemValue: false,
    sequence: 'records_id_seq',
  },
]

export const BACKUPS_DIR = path.join(process.cwd(), 'backups')
export const CHECKSUMS_SQL_FILE = path.join(process.cwd(), 'scripts', 'sql', 'checksums.sql')

export interface TableChecksum { tbl: string; n: number; md5: string }
export interface RowChecksum { id: number; md5: string }
export interface LegacyChecksums {
  tables: TableChecksum[]
  rows: Record<string, RowChecksum[]>
}

/** Table-level checksums ([B] §3.7, verbatim SQL file) plus one md5 per row. Read-only. */
export async function computeLegacyChecksums(sql: Sql | TxSql): Promise<LegacyChecksums> {
  const statement = readFileSync(CHECKSUMS_SQL_FILE, 'utf8')
  const tables = (await sql.unsafe(statement)).map((r) => ({ tbl: String(r.tbl), n: Number(r.n), md5: String(r.md5) }))
  const rows: Record<string, RowChecksum[]> = {}
  for (const table of LEGACY_TABLES) {
    const result = await sql.unsafe(`SELECT id, md5(x::text) AS md5 FROM public.${table.name} x ORDER BY id`)
    rows[table.name] = result.map((r) => ({ id: Number(r.id), md5: String(r.md5) }))
  }
  return { tables, rows }
}

export interface ChecksumDiff {
  equal: boolean
  lines: string[]
}

/** Compares two checksum sets and explains a difference by row id. */
export function diffChecksums(expected: LegacyChecksums, actual: LegacyChecksums): ChecksumDiff {
  const lines: string[] = []
  let equal = true
  for (const table of LEGACY_TABLES) {
    const before = expected.tables.find((t) => t.tbl === table.name)
    const after = actual.tables.find((t) => t.tbl === table.name)
    if (!before || !after) {
      equal = false
      lines.push(`${table.name}: missing from ${before ? 'the current result' : 'the reference'}`)
      continue
    }
    if (before.n === after.n && before.md5 === after.md5) {
      lines.push(`${table.name}: ${after.n} rows, md5 ${after.md5} — unchanged`)
      continue
    }
    equal = false
    const beforeRows = new Map((expected.rows[table.name] ?? []).map((r) => [r.id, r.md5]))
    const afterRows = new Map((actual.rows[table.name] ?? []).map((r) => [r.id, r.md5]))
    const added = [...afterRows.keys()].filter((id) => !beforeRows.has(id))
    const deleted = [...beforeRows.keys()].filter((id) => !afterRows.has(id))
    const changed = [...afterRows.keys()].filter((id) => beforeRows.has(id) && beforeRows.get(id) !== afterRows.get(id))
    lines.push(
      `${table.name}: DIFFERENT — reference ${before.n} rows md5 ${before.md5}, now ${after.n} rows md5 ${after.md5}`,
      `  added ids: [${added.join(', ')}]  changed ids: [${changed.join(', ')}]  deleted ids: [${deleted.join(', ')}]`,
    )
  }
  return { equal, lines }
}

export function latestBackupDir(): string | null {
  const pointer = path.join(BACKUPS_DIR, 'LATEST')
  if (!existsSync(pointer)) return null
  const name = readFileSync(pointer, 'utf8').trim()
  const dir = path.join(BACKUPS_DIR, name)
  return name !== '' && existsSync(path.join(dir, 'checksums.json')) ? dir : null
}

export function readBackupChecksums(dir: string): LegacyChecksums {
  return JSON.parse(readFileSync(path.join(dir, 'checksums.json'), 'utf8')) as LegacyChecksums
}

/**
 * The gate in front of every writing script: a backup must exist and the legacy
 * tables must still be exactly what that backup holds.
 */
export async function assertLegacyMatchesLatestBackup(sql: Sql | TxSql, label: string): Promise<LegacyChecksums> {
  const dir = latestBackupDir()
  if (!dir) throw new Error('No backup found (backups/LATEST). Run "npm run db:backup" first.')
  const actual = await computeLegacyChecksums(sql)
  const diff = diffChecksums(readBackupChecksums(dir), actual)
  console.log(`Legacy checksums vs backup ${path.basename(dir)} (${label}):`)
  for (const line of diff.lines) console.log(`  ${line}`)
  if (!diff.equal) {
    throw new Error('The legacy tables differ from the latest backup. Run "npm run db:backup" again, then retry.')
  }
  return actual
}

/** UTC timestamp for folder names: 20261124T101500Z. */
export function utcStamp(date: Date = new Date()): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}
