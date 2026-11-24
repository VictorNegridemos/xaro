// Data for the persistent shell: crew list, ship systems and the six bar tiles (plan 3.8).
import { and, asc, eq, or, sql } from 'drizzle-orm'
import { getDb, type DbOrTx } from '../db/client'
import { entities } from '../db/schema'
import { LEGACY_KEYS } from './legacy-keys'
import type { CrewCard, ShellData, ShipSystemCard } from './types'

/** At most this many tiles in the ship bar. */
export const BAR_TILE_LIMIT = 6

/** The first system of each category, in list order (K12: no ids in code). */
export function pickBarSystems(systems: readonly ShipSystemCard[]): ShipSystemCard[] {
  const seen = new Set<string>()
  const tiles: ShipSystemCard[] = []
  for (const system of systems) {
    if (seen.has(system.category)) continue
    seen.add(system.category)
    tiles.push(system)
    if (tiles.length === BAR_TILE_LIMIT) break
  }
  return tiles
}

export async function listCrew(db: DbOrTx = getDb()): Promise<CrewCard[]> {
  const rows = await db
    .select({ id: entities.id, slug: entities.slug, name: entities.name, attributes: entities.attributes })
    .from(entities)
    .where(and(
      eq(entities.type, 'character'),
      // Copied crew rows, or a crew member added later through the form (has a crew_rank attribute).
      or(eq(entities.legacyTable, LEGACY_KEYS.crew), sql`${entities.attributes} ? 'crew_rank'`),
    ))
    .orderBy(asc(entities.createdAt), asc(entities.id))
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    rank: r.attributes.crew_rank ?? '',
    race: r.attributes.race ?? '',
    composition: r.attributes.composition ?? '',
    status: r.attributes.current_status ?? '',
    expertise: r.attributes.expertise ?? '',
  }))
}

export async function listShipSystems(db: DbOrTx = getDb()): Promise<ShipSystemCard[]> {
  const rows = await db
    .select({
      id: entities.id, slug: entities.slug, name: entities.name, body: entities.body, attributes: entities.attributes,
    })
    .from(entities)
    .where(eq(entities.type, 'ship_system'))
    .orderBy(asc(entities.createdAt), asc(entities.id))
  return rows.map((r) => {
    const status = r.attributes.status ?? ''
    return {
      id: r.id,
      slug: r.slug,
      name: r.name,
      category: r.attributes.type ?? '',
      status,
      isOnline: status === 'Online', // exact string (K11)
      current: r.attributes.current ?? r.name,
      value: r.attributes.value ?? '',
      details: r.body,
    }
  })
}

/** Never throws: with the database unreachable it returns { ok: false } and empty lists. */
export async function getShellData(db?: DbOrTx): Promise<ShellData> {
  try {
    const conn = db ?? getDb()
    const [crew, systems] = await Promise.all([listCrew(conn), listShipSystems(conn)])
    return { crew, systems, barSystems: pickBarSystems(systems), ok: true }
  } catch (error) {
    console.error('[shell] archive unreachable:', error instanceof Error ? error.name : 'unknown error')
    return { crew: [], systems: [], barSystems: [], ok: false }
  }
}
