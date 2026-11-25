// Typed data access for the knowledge base (plan 3.8). Replaces the old src/db.js.
// Rules: columns are listed explicitly; search_vector is never selected and never written (K7).
import { and, asc, desc, eq } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { getDb, type DbOrTx } from '../db/client'
import { entities, entityRelations, importSources } from '../db/schema'
import { slugBase, typeSlug, uniqueSlug } from './slug'
import type {
  Entity, EntityDetail, EntityIndexRow, EntityInput, EntityRef, EntityType, LegacyTable, RelatedEntity,
} from './types'

const entityColumns = {
  id: entities.id,
  type: entities.type,
  name: entities.name,
  slug: entities.slug,
  aliases: entities.aliases,
  summary: entities.summary,
  body: entities.body,
  attributes: entities.attributes,
  sourceId: entities.sourceId,
  legacyTable: entities.legacyTable,
  legacyId: entities.legacyId,
  createdAt: entities.createdAt,
  updatedAt: entities.updatedAt,
} as const

function isUniqueViolation(error: unknown, constraint: string): boolean {
  let current: unknown = error
  for (let depth = 0; depth < 4 && current && typeof current === 'object'; depth += 1) {
    const e = current as { code?: unknown; constraint_name?: unknown; cause?: unknown }
    if (e.code === '23505' && e.constraint_name === constraint) return true
    current = e.cause
  }
  return false
}

export async function getEntityById(id: number, db: DbOrTx = getDb()): Promise<Entity | null> {
  const rows = await db.select(entityColumns).from(entities).where(eq(entities.id, id)).limit(1)
  return rows[0] ?? null
}

export async function getEntityBySlug(slug: string, db: DbOrTx = getDb()): Promise<EntityDetail | null> {
  const rows = await db.select(entityColumns).from(entities).where(eq(entities.slug, slug)).limit(1)
  const entity = rows[0]
  if (!entity) return null

  const other = alias(entities, 'other')
  const refColumns = {
    id: other.id, type: other.type, name: other.name, slug: other.slug,
    kind: entityRelations.kind, note: entityRelations.note,
  }
  const [outgoing, incoming, sources] = await Promise.all([
    db.select(refColumns).from(entityRelations)
      .innerJoin(other, eq(other.id, entityRelations.toEntityId))
      .where(eq(entityRelations.fromEntityId, entity.id))
      .orderBy(asc(entityRelations.kind), asc(other.name), asc(other.id)),
    db.select(refColumns).from(entityRelations)
      .innerJoin(other, eq(other.id, entityRelations.fromEntityId))
      .where(eq(entityRelations.toEntityId, entity.id))
      .orderBy(asc(entityRelations.kind), asc(other.name), asc(other.id)),
    entity.sourceId === null
      ? Promise.resolve([])
      : db.select({ id: importSources.id, filename: importSources.filename })
        .from(importSources).where(eq(importSources.id, entity.sourceId)).limit(1),
  ])
  const relations: RelatedEntity[] = [
    ...outgoing.map((r) => ({ ...r, direction: 'out' as const })),
    ...incoming.map((r) => ({ ...r, direction: 'in' as const })),
  ]
  return { ...entity, relations, source: sources[0] ?? null }
}

/** Slug of the entity copied from a legacy row; the table name is a bound parameter. */
export async function getSlugByLegacy(
  table: LegacyTable, legacyId: number, db: DbOrTx = getDb(),
): Promise<string | null> {
  const rows = await db.select({ slug: entities.slug }).from(entities)
    .where(and(eq(entities.legacyTable, table), eq(entities.legacyId, legacyId))).limit(1)
  return rows[0]?.slug ?? null
}

/** id, type, name and aliases of every entity (the import prompt's index). */
export async function listEntityIndex(db: DbOrTx = getDb()): Promise<EntityIndexRow[]> {
  return db.select({ id: entities.id, type: entities.type, name: entities.name, aliases: entities.aliases })
    .from(entities).orderBy(asc(entities.id))
}

/** Newest first. */
export async function listRecentEntities(
  type: EntityType, limit: number, db: DbOrTx = getDb(),
): Promise<EntityRef[]> {
  return db.select({ id: entities.id, type: entities.type, name: entities.name, slug: entities.slug })
    .from(entities).where(eq(entities.type, type))
    .orderBy(desc(entities.createdAt), desc(entities.id)).limit(limit)
}

export async function createEntity(
  input: EntityInput, opts: { sourceId?: number } = {}, db: DbOrTx = getDb(),
): Promise<{ id: number; slug: string }> {
  const base = slugBase(input.name)
  const fallback = typeSlug(input.type)
  // Retry only outside a caller's transaction: a failed insert aborts a surrounding transaction anyway.
  const attempts = 'rollback' in db ? 1 : 3
  for (let attempt = 1; ; attempt += 1) {
    const slug = await uniqueSlug(base, fallback, db)
    try {
      const rows = await db.insert(entities).values({
        type: input.type,
        name: input.name,
        slug,
        aliases: input.aliases,
        summary: input.summary,
        body: input.body,
        attributes: input.attributes,
        sourceId: opts.sourceId ?? null,
      }).returning({ id: entities.id, slug: entities.slug })
      const row = rows[0]
      if (!row) throw new Error('Insert returned no row')
      return row
    } catch (error) {
      // Two concurrent creates picked the same free slug: pick again.
      if (attempt < attempts && isUniqueViolation(error, 'entities_slug_uq')) continue
      throw error
    }
  }
}

/** Never changes slug, legacy_table, legacy_id, source_id or created_at. updated_at is set by a DB trigger. */
export async function updateEntity(
  id: number, input: EntityInput, db: DbOrTx = getDb(),
): Promise<{ id: number; slug: string } | null> {
  const rows = await db.update(entities).set({
    type: input.type,
    name: input.name,
    aliases: input.aliases,
    summary: input.summary,
    body: input.body,
    attributes: input.attributes,
  }).where(eq(entities.id, id)).returning({ id: entities.id, slug: entities.slug })
  return rows[0] ?? null
}

/** Relations from or to the entity are removed by ON DELETE CASCADE. */
export async function deleteEntity(id: number, db: DbOrTx = getDb()): Promise<boolean> {
  const rows = await db.delete(entities).where(eq(entities.id, id)).returning({ id: entities.id })
  return rows.length > 0
}
