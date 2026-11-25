// Old URLs (plan 2.2): /ship_record/[id], /crew_member/[id], /subsystem/[id], /edit_ship_record/[id].
// The legacy table name is only ever a bound parameter of getSlugByLegacy (plan 3.8).
import { getSlugByLegacy } from '../data/entities'
import type { LegacyTable } from '../data/types'
import type { DbOrTx } from '../db/client'
import { entryHref } from './href'

/** The legacy id of a route segment: 1 to 9 digits, or null. */
export function parseLegacyId(value: string | undefined): number | null {
  return value !== undefined && /^\d{1,9}$/.test(value) ? Number(value) : null
}

/** `/entry/<slug>` of the entity copied from the legacy row, or null (the page then answers 404). */
export async function legacyEntryPath(
  table: LegacyTable, rawId: string | undefined, db?: DbOrTx,
): Promise<string | null> {
  const id = parseLegacyId(rawId)
  if (id === null) return null
  const slug = await getSlugByLegacy(table, id, db)
  return slug === null ? null : entryHref(slug)
}
