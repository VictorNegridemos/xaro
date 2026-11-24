// Step 1 only (deleted in Step 3): turns rows of the NEW tables into the row shapes the parked
// legacy components expect. No legacy table is read; ids shown here are the old legacy ids.
import { ilike, or } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import { entities } from '@/lib/db/schema'
import { getEntityBySlug, getSlugByLegacy } from '@/lib/data/entities'
import { LEGACY_KEYS } from '@/lib/data/legacy-keys'
import type { CrewCard, Entity, LegacyTable, ShipSystemCard } from '@/lib/data/types'

export interface LegacyCrewRow {
  id: number
  first_name: string
  last_name: string
  crew_rank: string
  race: string
  composition: string
  current_status: string
  expertise: string
}
export interface LegacySubsystemRow {
  id: number
  type: string
  status: string
  current: string
  value: string
  details: string
}
export interface LegacyRecordRow {
  id: number
  title: string
  text: string
}
export type LegacyRow = LegacyCrewRow | LegacySubsystemRow | LegacyRecordRow

export function crewCardToLegacy(card: CrewCard): LegacyCrewRow {
  return {
    id: card.id,
    first_name: card.name,
    last_name: '',
    crew_rank: card.rank,
    race: card.race,
    composition: card.composition,
    current_status: card.status,
    expertise: card.expertise,
  }
}

export function systemCardToLegacy(card: ShipSystemCard): LegacySubsystemRow {
  return { id: card.id, type: card.category, status: card.status, current: card.current, value: card.value, details: card.details }
}

type EntityCore = Pick<Entity, 'id' | 'name' | 'body' | 'attributes' | 'legacyTable' | 'legacyId'>

export function entityToLegacyRow(entity: EntityCore): LegacyRow {
  const id = entity.legacyId ?? entity.id
  const a = entity.attributes
  if (entity.legacyTable === LEGACY_KEYS.crew) {
    return {
      id,
      first_name: a.first_name ?? entity.name,
      last_name: a.last_name ?? '',
      crew_rank: a.crew_rank ?? '',
      race: a.race ?? '',
      composition: a.composition ?? '',
      current_status: a.current_status ?? '',
      expertise: a.expertise ?? '',
    }
  }
  if (entity.legacyTable === LEGACY_KEYS.subsystem) {
    return { id, type: a.type ?? '', status: a.status ?? '', current: a.current ?? entity.name, value: a.value ?? '', details: entity.body }
  }
  return { id, title: entity.name, text: entity.body }
}

/** The copy of one legacy row, in the old row shape; null for a bad id or an unknown row. */
export async function getLegacyRow(table: LegacyTable, rawId: string): Promise<LegacyRow | null> {
  if (!/^\d{1,9}$/.test(rawId)) return null
  const slug = await getSlugByLegacy(table, Number(rawId))
  if (!slug) return null
  const entity = await getEntityBySlug(slug)
  return entity ? entityToLegacyRow(entity) : null
}

export interface LegacySearchGroup {
  source: 'crew_member' | 'subsystem' | 'ship_record'
  displayProperty: string
  data: LegacyRow[]
}

/** Temporary search for the old POST /api/search: name or body ILIKE, grouped like the old response. */
export async function legacySearch(keyword: string): Promise<LegacySearchGroup[]> {
  const pattern = `%${keyword}%`
  const rows = await getDb()
    .select({
      id: entities.id, name: entities.name, body: entities.body, attributes: entities.attributes,
      legacyTable: entities.legacyTable, legacyId: entities.legacyId,
    })
    .from(entities)
    .where(or(ilike(entities.name, pattern), ilike(entities.body, pattern)))
    .orderBy(entities.createdAt, entities.id)
    .limit(60)
  const group = (table: LegacyTable): LegacyRow[] =>
    rows.filter((r) => r.legacyTable === table).slice(0, 10).map(entityToLegacyRow)
  return [
    { source: 'crew_member', displayProperty: 'first_name', data: group(LEGACY_KEYS.crew) },
    { source: 'subsystem', displayProperty: 'current', data: group(LEGACY_KEYS.subsystem) },
    { source: 'ship_record', displayProperty: 'title', data: group(LEGACY_KEYS.record) },
  ]
}
