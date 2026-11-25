import type { ENTITY_TYPES, IMPORT_STATUSES } from '../db/schema'

export type EntityType = (typeof ENTITY_TYPES)[number]
export type ImportStatus = (typeof IMPORT_STATUSES)[number]
export type { LegacyTable } from './legacy-keys'

/** Always strings; the import schema coerces numbers and booleans (plan 6.4). */
export type EntityAttributes = Record<string, string>

/** One body limit for the entry form and for import merges (plan 6.6, 9.3). */
export const MAX_BODY_CHARS = 100_000

export interface Entity {
  id: number
  type: EntityType
  name: string
  slug: string
  aliases: string[]
  summary: string
  body: string
  attributes: EntityAttributes
  sourceId: number | null
  legacyTable: string | null
  legacyId: number | null
  createdAt: Date
  updatedAt: Date
}
export interface EntityRef { id: number; type: EntityType; name: string; slug: string }
export interface RelatedEntity extends EntityRef { kind: string; note: string | null; direction: 'out' | 'in' }
export interface EntityDetail extends Entity {
  relations: RelatedEntity[]
  source: { id: number; filename: string } | null
}
export interface EntityIndexRow { id: number; type: EntityType; name: string; aliases: string[] }
export interface EntityInput {
  type: EntityType
  name: string
  aliases: string[]
  summary: string
  body: string
  attributes: EntityAttributes
}

export interface CrewCard {
  id: number
  slug: string
  name: string
  rank: string
  race: string
  composition: string
  status: string
  expertise: string
}
export interface ShipSystemCard {
  id: number
  slug: string
  name: string
  category: string
  status: string
  isOnline: boolean
  current: string
  value: string
  details: string
}
export interface ShellData { crew: CrewCard[]; systems: ShipSystemCard[]; barSystems: ShipSystemCard[]; ok: boolean }

/** Stored in import_sources.result by the import script (plan 6.7). */
export interface ImportResult {
  created: number
  updated: number
  relations: number
  skipped: number
  conflicts: number
  /** "possible duplicate of <slug>", "existingId rejected", "body full, addendum skipped", ... */
  notes?: string[]
  /** One printable line per entity, e.g. "+ character  Halvard Quist  /entry/halvard-quist". */
  lines?: string[]
  /** true when IMPORT_STUB_FILE was used and Claude was not called. */
  stub?: boolean
}
export type ImportOrigin = 'upload' | 'cli'
/** A row of import_sources without its content. */
export interface ImportSourceSummary {
  id: number
  filename: string
  contentHash: string
  byteSize: number
  origin: ImportOrigin
  status: ImportStatus
  error: string | null
  result: ImportResult | null
  attempts: number
  createdAt: Date
  startedAt: Date | null
  processedAt: Date | null
}
