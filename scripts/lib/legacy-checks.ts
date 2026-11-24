// Pure classification behind db:verify-legacy --coverage and --drift, aware of the O1 exclusions
// (src/lib/data/legacy-exclusions.ts, fix round 1 F2). No database access here.
import { LEGACY_EXCLUSIONS } from '../../src/lib/data/legacy-exclusions'

type Exclusions = Readonly<Partial<Record<string, readonly number[]>>>

const isExcluded = (exclusions: Exclusions, table: string, id: number) => (exclusions[table] ?? []).includes(id)

export interface CoverageRow { tbl: string; id: number; copies: number }

/**
 * Every legacy row that is not excluded needs exactly one copy; an excluded row needs none.
 * Returns one line per problem (empty = OK).
 */
export function coverageProblems(rows: readonly CoverageRow[], exclusions: Exclusions = LEGACY_EXCLUSIONS): string[] {
  const problems: string[] = []
  for (const row of rows) {
    if (isExcluded(exclusions, row.tbl, row.id)) {
      if (row.copies !== 0) problems.push(`${row.tbl} ${row.id}: excluded under O1 but ${row.copies} copies remain`)
    } else if (row.copies !== 1) {
      problems.push(`${row.tbl} ${row.id}: ${row.copies} copies`)
    }
  }
  return problems
}

export interface CopyLogRef { legacy_id: number; row_md5: string; slug: string }

export interface DriftResult {
  /** (a) live, not excluded, never copied. */
  notCopied: number[]
  /** (b) copied, changed since. */
  changed: number[]
  /** (c) copied, legacy row gone. */
  gone: number[]
  /** Excluded rows (O1) that changed or disappeared: reported for information only, never drift. */
  excludedIgnored: number[]
}

export function classifyDrift(
  table: string,
  log: readonly CopyLogRef[],
  live: ReadonlyMap<number, string>,
  exclusions: Exclusions = LEGACY_EXCLUSIONS,
): DriftResult {
  const copied = new Map(log.map((e) => [e.legacy_id, e]))
  const excluded = (id: number) => isExcluded(exclusions, table, id)
  const notCopied = [...live.keys()].filter((id) => !copied.has(id) && !excluded(id))
  const changedAll = [...live.keys()].filter((id) => copied.has(id) && copied.get(id)?.row_md5 !== live.get(id))
  const goneAll = [...copied.keys()].filter((id) => !live.has(id))
  return {
    notCopied,
    changed: changedAll.filter((id) => !excluded(id)),
    gone: goneAll.filter((id) => !excluded(id)),
    excludedIgnored: [...changedAll, ...goneAll].filter(excluded).sort((a, b) => a - b),
  }
}
