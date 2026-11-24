// Runs the reviewed legacy copy statement (scripts/sql/copy-legacy.sql, plan 3.3) inside the
// caller's transaction and checks its result. Reads the legacy tables; writes only to entities.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { slugBase } from '../../src/lib/data/slug'
import { LEGACY_TABLES } from './legacy'
import type { TxSql } from './script-db'

export const COPY_SQL_FILE = path.join(process.cwd(), 'scripts', 'sql', 'copy-legacy.sql')

export interface CopiedRow {
  id: number
  legacy_table: string
  legacy_id: number
  type: string
  name: string
  slug: string
}

export interface CopyOutcome {
  inserted: CopiedRow[]
  /** Inserted rows per legacy table. */
  insertedPerTable: Record<string, number>
  /** Rows now in entities per legacy table (equal to the legacy row counts). */
  totalPerTable: Record<string, number>
}

const isAscii = (s: string) => /^[\x00-\x7f]*$/.test(s)

/** Executes the copy and the three assertions of plan 3.3. Throws on any failure (the caller rolls back). */
export async function runLegacyCopy(tx: TxSql): Promise<CopyOutcome> {
  const statement = readFileSync(COPY_SQL_FILE, 'utf8')
  const result = await tx.unsafe(statement)
  const inserted: CopiedRow[] = result.map((r) => ({
    id: Number(r.id),
    legacy_table: String(r.legacy_table),
    legacy_id: Number(r.legacy_id),
    type: String(r.type),
    name: String(r.name),
    slug: String(r.slug),
  }))

  // 1. Every legacy row has a copy: counts per table are equal.
  const totalPerTable: Record<string, number> = {}
  const insertedPerTable: Record<string, number> = {}
  for (const table of LEGACY_TABLES) {
    const legacyCount = Number((await tx.unsafe(`SELECT count(*)::int AS n FROM public.${table.name}`))[0]?.n)
    const copied = Number((await tx`SELECT count(*)::int AS n FROM public.entities WHERE legacy_table = ${table.name}`)[0]?.n)
    if (legacyCount !== copied) {
      throw new Error(`Copy assertion failed: ${table.name} has ${legacyCount} rows but entities holds ${copied} copies`)
    }
    totalPerTable[table.name] = copied
    insertedPerTable[table.name] = inserted.filter((r) => r.legacy_table === table.name).length
  }

  // 2. No (legacy_table, legacy_id) appears twice.
  const duplicates = await tx`
    SELECT legacy_table, legacy_id FROM public.entities WHERE legacy_table IS NOT NULL
    GROUP BY legacy_table, legacy_id HAVING count(*) > 1`
  if (duplicates.length > 0) {
    throw new Error(`Copy assertion failed: ${duplicates.length} legacy rows were copied more than once`)
  }

  // 3. The SQL slug rule and slugBase() in TypeScript agree (ASCII names only).
  for (const row of inserted) {
    if (!isAscii(row.name)) continue
    const base = slugBase(row.name)
    const ok = base === ''
      ? row.slug === `${row.type.replace(/_/g, '-')}-${row.legacy_id}`
      : row.slug === base || row.slug === `${base}-${row.legacy_id}`
    if (!ok) {
      throw new Error(`Copy assertion failed: slug "${row.slug}" of ${row.legacy_table} ${row.legacy_id} does not follow slugBase() = "${base}"`)
    }
  }
  return { inserted, insertedPerTable, totalPerTable }
}

export function printCopyOutcome(outcome: CopyOutcome): void {
  const parts = LEGACY_TABLES.map((t) => `${t.name} ${outcome.insertedPerTable[t.name] ?? 0}`)
  console.log(`${outcome.inserted.length} inserted (${parts.join(', ')})`)
  const totals = LEGACY_TABLES.map((t) => `${t.name} ${outcome.totalPerTable[t.name] ?? 0}`)
  console.log(`copies now in entities: ${totals.join(', ')}`)
}
