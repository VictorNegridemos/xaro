// Legacy rows that are deliberately NOT in entities (owner decision O1, plan 3.3 option A):
// test and duplicate records whose copies were deleted from the new table. The legacy rows
// themselves stay untouched. db:copy-legacy never inserts them again, and db:verify-legacy
// --coverage / --drift treat them as expected-absent. Change this list only with the owner.
import { LEGACY_KEYS, type LegacyTable } from './legacy-keys'

export const LEGACY_EXCLUSIONS: Readonly<Partial<Record<LegacyTable, readonly number[]>>> = {
  [LEGACY_KEYS.record]: [2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 26, 27, 29, 34, 35],
}

/** The excluded legacy ids of one legacy table (empty when none). */
export function excludedLegacyIds(table: string): readonly number[] {
  return LEGACY_EXCLUSIONS[table as LegacyTable] ?? []
}

export function isExcludedLegacyRow(table: string, id: number): boolean {
  return excludedLegacyIds(table).includes(id)
}
