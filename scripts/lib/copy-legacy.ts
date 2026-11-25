// Runs the reviewed legacy copy statement (scripts/sql/copy-legacy.sql, plan 3.3) inside the
// caller's transaction and checks its result. Reads the legacy tables; writes only to entities.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { LEGACY_EXCLUSIONS } from '../../src/lib/data/legacy-exclusions'
import { slugBase } from '../../src/lib/data/slug'
import { LEGACY_TABLES } from './legacy'
import type { TxSql } from './script-db'

export const COPY_SQL_FILE = path.join(process.cwd(), 'scripts', 'sql', 'copy-legacy.sql')

type Exclusions = Readonly<Partial<Record<string, readonly number[]>>>

/**
 * The reviewed statement with the O1 exclusions applied (fix round 1, F2): for every legacy table
 * with excluded ids, `WHERE NOT (<alias>.id = ANY('{…}'::int[]))` is added after its single
 * `FROM public.<table> <alias>` line, the same place plan 3.3 option C names. The file on disk stays
 * the verbatim plan statement; excluded rows never reach the slug ranking or the INSERT.
 */
export function applyExclusions(statement: string, exclusions: Exclusions = LEGACY_EXCLUSIONS): string {
  let out = statement
  for (const table of LEGACY_TABLES) {
    const ids = exclusions[table.name] ?? []
    if (ids.length === 0) continue
    if (!ids.every((id) => Number.isSafeInteger(id) && id > 0)) {
      throw new Error(`Exclusions of ${table.name} must be positive integers`)
    }
    const pattern = new RegExp(String.raw`^([ \t]*FROM public\.${table.name} (\w+))[ \t]*(\r?)$`, 'gm')
    const matches = [...out.matchAll(pattern)]
    if (matches.length !== 1) {
      throw new Error(`Expected exactly one "FROM public.${table.name} <alias>" line in the copy statement, found ${matches.length}`)
    }
    out = out.replace(pattern, (_line, from: string, alias: string, cr: string) =>
      `${from}${cr}\n  WHERE NOT (${alias}.id = ANY('{${ids.join(',')}}'::int[]))${cr}`)
  }
  return out
}

/** Excluded ids of a table as an int[] parameter value. */
function excludedOf(table: string, exclusions: Exclusions): number[] {
  return [...(exclusions[table] ?? [])]
}

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
  /** Rows now in entities per legacy table (equal to the legacy row counts minus the exclusions). */
  totalPerTable: Record<string, number>
  /** Excluded legacy rows (O1) that still have a copy in entities: the O1 delete has not run yet. */
  excludedStillCopied: Record<string, number>
}

const isAscii = (s: string) => /^[\x00-\x7f]*$/.test(s)

/** Executes the copy and the three assertions of plan 3.3. Throws on any failure (the caller rolls back). */
export async function runLegacyCopy(tx: TxSql, exclusions: Exclusions = LEGACY_EXCLUSIONS): Promise<CopyOutcome> {
  const statement = applyExclusions(readFileSync(COPY_SQL_FILE, 'utf8'), exclusions)
  const result = await tx.unsafe(statement)
  const inserted: CopiedRow[] = result.map((r) => ({
    id: Number(r.id),
    legacy_table: String(r.legacy_table),
    legacy_id: Number(r.legacy_id),
    type: String(r.type),
    name: String(r.name),
    slug: String(r.slug),
  }))

  // 0. No excluded row was inserted (they are filtered out of the statement; checked anyway).
  const insertedExcluded = inserted.filter((r) => excludedOf(r.legacy_table, exclusions).includes(r.legacy_id))
  if (insertedExcluded.length > 0) {
    throw new Error(`Copy assertion failed: ${insertedExcluded.length} excluded (O1) rows were inserted`)
  }

  // 1. Every legacy row that is not excluded has a copy: counts per table are equal.
  const totalPerTable: Record<string, number> = {}
  const insertedPerTable: Record<string, number> = {}
  const excludedStillCopied: Record<string, number> = {}
  for (const table of LEGACY_TABLES) {
    const excluded = excludedOf(table.name, exclusions)
    const legacyCount = Number((await tx.unsafe(
      `SELECT count(*)::int AS n FROM public.${table.name} WHERE NOT (id = ANY($1::int[]))`, [excluded]))[0]?.n)
    const copied = Number((await tx`
      SELECT count(*)::int AS n FROM public.entities
      WHERE legacy_table = ${table.name} AND NOT (legacy_id = ANY(${excluded}::int[]))`)[0]?.n)
    if (legacyCount !== copied) {
      throw new Error(`Copy assertion failed: ${table.name} has ${legacyCount} rows (exclusions left out) but entities holds ${copied} copies`)
    }
    totalPerTable[table.name] = copied
    insertedPerTable[table.name] = inserted.filter((r) => r.legacy_table === table.name).length
    excludedStillCopied[table.name] = Number((await tx`
      SELECT count(*)::int AS n FROM public.entities
      WHERE legacy_table = ${table.name} AND legacy_id = ANY(${excluded}::int[])`)[0]?.n)
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
  return { inserted, insertedPerTable, totalPerTable, excludedStillCopied }
}

export function printCopyOutcome(outcome: CopyOutcome): void {
  const parts = LEGACY_TABLES.map((t) => `${t.name} ${outcome.insertedPerTable[t.name] ?? 0}`)
  console.log(`${outcome.inserted.length} inserted (${parts.join(', ')})`)
  const totals = LEGACY_TABLES.map((t) => `${t.name} ${outcome.totalPerTable[t.name] ?? 0}`)
  console.log(`copies now in entities: ${totals.join(', ')}`)
  for (const t of LEGACY_TABLES) {
    const n = excludedOf(t.name, LEGACY_EXCLUSIONS).length
    if (n === 0) continue
    const still = outcome.excludedStillCopied[t.name] ?? 0
    console.log(`excluded under O1 (never copied): ${t.name} ${n} ids${still > 0 ? ` — ${still} of them still have a copy (O1 delete not done yet)` : ''}`)
  }
}
