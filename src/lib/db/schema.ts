// Drizzle schema of the NEW tables only (plan 3.1). The three legacy tables never appear here (K2).
// Generated-column and check expressions are plain SQL text with no column interpolation,
// so the generated DDL matches plan section 3.2.
import { sql } from 'drizzle-orm'
import {
  check, customType, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex,
} from 'drizzle-orm/pg-core'
import type { EntityAttributes, ImportResult } from '../data/types'

export const ENTITY_TYPES = [
  'character', 'location', 'technology', 'faction', 'item', 'creature', 'event', 'ship_system', 'record', 'other',
] as const
export const IMPORT_STATUSES = ['pending', 'processing', 'done', 'failed'] as const

export const entityType = pgEnum('entity_type', ENTITY_TYPES)
export const importStatus = pgEnum('import_status', IMPORT_STATUSES)

const tsvector = customType<{ data: string }>({ dataType: () => 'tsvector' })

export const importSources = pgTable('import_sources', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  filename: text().notNull(),
  content: text().notNull(),
  contentHash: text('content_hash').notNull().unique(),
  byteSize: integer('byte_size').notNull(),
  origin: text().notNull().default('upload'), // 'upload' | 'cli'
  status: importStatus().notNull().default('pending'),
  error: text(),
  result: jsonb().$type<ImportResult>(),
  attempts: integer().notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  processedAt: timestamp('processed_at', { withTimezone: true }),
}, (t) => [
  index('import_sources_status_idx').on(t.status, t.createdAt),
  check('import_sources_hash_format', sql`content_hash ~ '^[0-9a-f]{64}$'`),
  check('import_sources_size', sql`byte_size > 0 AND byte_size <= 2097152`),
  check('import_sources_origin', sql`origin IN ('upload', 'cli')`),
])

export const entities = pgTable('entities', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  type: entityType().notNull(),
  name: text().notNull(),
  slug: text().notNull(),
  aliases: text().array().notNull().default(sql`'{}'::text[]`),
  summary: text().notNull().default(''),
  body: text().notNull().default(''),
  attributes: jsonb().$type<EntityAttributes>().notNull().default({}),
  sourceId: integer('source_id').references(() => importSources.id, { onDelete: 'set null' }),
  legacyTable: text('legacy_table'),
  legacyId: integer('legacy_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(), // maintained by a DB trigger
  // Generated; never inserted, updated or selected by application code (K7).
  searchVector: tsvector('search_vector').generatedAlwaysAs(
    sql`public.xaro_entity_search_vector(name, aliases, summary, body, attributes)`),
}, (t) => [
  uniqueIndex('entities_slug_uq').on(t.slug),
  uniqueIndex('entities_legacy_uq').on(t.legacyTable, t.legacyId).where(sql`legacy_table IS NOT NULL`),
  index('entities_search_vector_idx').using('gin', t.searchVector),
  index('entities_name_trgm_idx').using('gin', t.name.op('gin_trgm_ops')),
  index('entities_aliases_trgm_idx').using('gin', sql`public.xaro_array_to_text(aliases) gin_trgm_ops`),
  index('entities_type_idx').on(t.type),
  index('entities_source_id_idx').on(t.sourceId),
  check('entities_name_valid', sql`btrim(name) <> '' AND char_length(name) <= 255`),
  check('entities_slug_format', sql`slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 100`),
  check('entities_legacy_pair', sql`(legacy_table IS NULL) = (legacy_id IS NULL)`),
  check('entities_legacy_table_format', sql`legacy_table IS NULL OR legacy_table ~ '^[a-z_]{1,63}$'`),
  check('entities_attributes_object', sql`jsonb_typeof(attributes) = 'object'`),
])

export const entityRelations = pgTable('entity_relations', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  fromEntityId: integer('from_entity_id').notNull().references(() => entities.id, { onDelete: 'cascade' }),
  toEntityId: integer('to_entity_id').notNull().references(() => entities.id, { onDelete: 'cascade' }),
  kind: text().notNull(),
  note: text(),
  sourceId: integer('source_id').references(() => importSources.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('entity_relations_edge_uq').on(t.fromEntityId, t.toEntityId, t.kind),
  index('entity_relations_to_idx').on(t.toEntityId),
  check('entity_relations_no_self', sql`from_entity_id <> to_entity_id`),
  check('entity_relations_kind_format', sql`kind = lower(btrim(kind)) AND kind <> '' AND char_length(kind) <= 60`),
])

export const authThrottle = pgTable('auth_throttle', {
  bucket: text().primaryKey(),
  failures: integer().notNull().default(0),
  windowStart: timestamp('window_start', { withTimezone: true }).notNull().defaultNow(),
})
