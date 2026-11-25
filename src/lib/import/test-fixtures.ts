// Test fixtures shared by the import unit tests. Imported only from *.test.ts files.
import { LEGACY_KEYS } from '../data/legacy-keys'
import type { Entity, EntityIndexRow } from '../data/types'
import type { MergedEntity } from './merge'
import type { Extraction } from './schema'

export function entityRow(over: Partial<Entity> & Pick<Entity, 'id' | 'type' | 'name'>): Entity {
  return {
    slug: over.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    aliases: [],
    summary: '',
    body: '',
    attributes: {},
    sourceId: null,
    legacyTable: null,
    legacyId: null,
    createdAt: new Date('2026-11-24T00:00:00Z'),
    updatedAt: new Date('2026-11-24T00:00:00Z'),
    ...over,
  }
}

export const indexRow = (e: Entity): EntityIndexRow => ({ id: e.id, type: e.type, name: e.name, aliases: e.aliases })

export function merged(over: Partial<MergedEntity> & Pick<MergedEntity, 'type' | 'name'>): MergedEntity {
  return { existingId: null, aliases: [], summary: '', body: '', attributes: {}, ...over }
}

/** Existing entities shaped like the legacy copies (values abbreviated). */
export const SHIELDS = entityRow({
  id: 6, type: 'ship_system', name: 'Shield array', slug: 'shield-array', aliases: ['Shields'],
  summary: 'Deflector shields.', body: 'The shield array protects the hull.',
  attributes: { status: 'Offline', type: 'SHIELDS', current: '0', value: '100' },
  legacyTable: LEGACY_KEYS.subsystem, legacyId: 6,
})
export const KIK = entityRow({
  id: 3, type: 'character', name: 'Kik', slug: 'kik', aliases: ['Blink'],
  summary: 'Pilot.', body: 'Kik flies the ship.', attributes: { crew_rank: 'Pilot', status: 'Alive' },
  legacyTable: LEGACY_KEYS.crew, legacyId: 3,
})
export const EXISTING = [SHIELDS, KIK]

export function extraction(entities: Array<Partial<Extraction['entities'][number]> & { type: Extraction['entities'][number]['type']; name: string }>, relations: Extraction['relations'] = []): Extraction {
  return {
    entities: entities.map((e) => ({ existingId: null, aliases: [], summary: '', body: '', attributes: {}, ...e })),
    relations,
  }
}
