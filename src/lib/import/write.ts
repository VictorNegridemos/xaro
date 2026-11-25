// Database side of the import (plan 6.7): queue reads, claim, the one write transaction per source.
// Everything goes through the ImportStore interface so the state machine (pipeline.ts) can be tested
// without a database. The reads and the writes are separate groups: a dry run only ever calls the reads.
import { and, asc, eq, inArray, lt, or, sql } from 'drizzle-orm'
import type { Db, DbOrTx } from '../db/client'
import { entities, entityRelations, importSources } from '../db/schema'
import { createEntity, getEntityById, listEntityIndex, updateEntity } from '../data/entities'
import { enqueueImportSource } from '../data/imports'
import { RESERVED_SLUGS, slugBase, typeSlug } from '../data/slug'
import type { Entity, EntityIndexRow, EntityInput, ImportResult, ImportStatus } from '../data/types'
import type { MergedFile } from './merge'
import { candidateIds, planImport, planResult } from './plan'
import type { ImportPlan } from './plan'

/** A crashed run is taken over after this long: one chunk may take 3 x 10 minutes plus waits. */
export const STALE_PROCESSING_MINUTES = 60

export interface SourceInfo { id: number; filename: string; status: ImportStatus; attempts: number }
export interface QueueSource extends SourceInfo { content: string }

export interface ExtractedSource {
  merged: MergedFile
  /** ids of the index rows that were sent to the model. */
  sentIds: ReadonlySet<number>
}

export interface ImportStore {
  // ---- reads (the only calls of a dry run) ----
  findSourceByHash(hash: string): Promise<SourceInfo | null>
  /** Oldest first: pending rows, stale processing rows and, when asked, failed rows. */
  listQueue(options: { retryFailed: boolean }): Promise<QueueSource[]>
  listIndex(): Promise<EntityIndexRow[]>
  /** The plan the write transaction would execute, plus the slugs the creates would probably get. */
  previewPlan(filename: string, extracted: ExtractedSource): Promise<{ plan: ImportPlan; result: ImportResult }>

  // ---- writes (real runs only) ----
  insertPending(filename: string, content: string): Promise<SourceInfo>
  /** processing + attempts + 1, committed on its own. null = another run has the row. */
  claim(id: number, from: readonly ImportStatus[]): Promise<QueueSource | null>
  /** CLI missing or not logged in: back to pending with an explanation. */
  releaseToPending(id: number, error: string): Promise<void>
  markFailed(id: number, error: string): Promise<void>
  /** One transaction: entity inserts and updates, relation inserts and status = done. */
  applyImport(source: { id: number; filename: string }, extracted: ExtractedSource, stub: boolean):
    Promise<{ plan: ImportPlan; result: ImportResult }>
}

const infoColumns = {
  id: importSources.id,
  filename: importSources.filename,
  status: importSources.status,
  attempts: importSources.attempts,
} as const
const queueColumns = { ...infoColumns, content: importSources.content } as const

const staleProcessing = () => and(
  eq(importSources.status, 'processing'),
  lt(importSources.startedAt, sql`now() - make_interval(mins => ${STALE_PROCESSING_MINUTES})`),
)

/** Loads what planImport needs and plans. Reads only. */
async function buildPlan(db: DbOrTx, filename: string, extracted: ExtractedSource): Promise<ImportPlan> {
  const index = await listEntityIndex(db)
  const byId = new Map<number, Entity>()
  for (const id of candidateIds(index, extracted.merged)) {
    const entity = await getEntityById(id, db)
    if (entity) byId.set(id, entity)
  }
  return planImport(index, byId, extracted.merged, filename, { sentIds: extracted.sentIds })
}

/** The slugs createEntity would pick, computed with reads only (dry run). */
async function predictSlugs(db: DbOrTx, inputs: readonly EntityInput[]): Promise<string[]> {
  const roots = [...new Set(inputs.map((input) => slugBase(input.name) || typeSlug(input.type)))]
  const taken = new Set<string>(RESERVED_SLUGS)
  for (const root of roots) {
    const rows = await db.select({ slug: entities.slug }).from(entities)
      .where(or(eq(entities.slug, root), sql`${entities.slug} ~ ${`^${root}-[0-9]+$`}`))
    for (const row of rows) taken.add(row.slug)
  }
  return inputs.map((input) => {
    const root = slugBase(input.name) || typeSlug(input.type)
    for (let n = 1; ; n += 1) {
      const candidate = n === 1 ? root : `${root}-${n}`
      if (taken.has(candidate)) continue
      taken.add(candidate)
      return candidate
    }
  })
}

export function createImportStore(db: Db): ImportStore {
  return {
    async findSourceByHash(hash) {
      const rows = await db.select(infoColumns).from(importSources).where(eq(importSources.contentHash, hash)).limit(1)
      return rows[0] ?? null
    },

    async listQueue({ retryFailed }) {
      const statuses: ImportStatus[] = retryFailed ? ['pending', 'failed'] : ['pending']
      return db.select(queueColumns).from(importSources)
        .where(or(inArray(importSources.status, statuses), staleProcessing()))
        .orderBy(asc(importSources.createdAt), asc(importSources.id))
    },

    listIndex: () => listEntityIndex(db),

    async previewPlan(filename, extracted) {
      const plan = await buildPlan(db, filename, extracted)
      const slugs = await predictSlugs(db, plan.creates.map((create) => create.input))
      return { plan, result: planResult(plan, slugs) }
    },

    async insertPending(filename, content) {
      const { source } = await enqueueImportSource({ filename, content, origin: 'cli' }, db)
      return { id: source.id, filename: source.filename, status: source.status, attempts: source.attempts }
    },

    async claim(id, from) {
      const allowed = from.length > 0 ? or(inArray(importSources.status, [...from]), staleProcessing()) : staleProcessing()
      const rows = await db.update(importSources)
        .set({
          status: 'processing', startedAt: sql`now()`, attempts: sql`${importSources.attempts} + 1`, error: null,
        })
        .where(and(eq(importSources.id, id), allowed))
        .returning(queueColumns)
      return rows[0] ?? null
    },

    async releaseToPending(id, error) {
      await db.update(importSources).set({ status: 'pending', error })
        .where(and(eq(importSources.id, id), eq(importSources.status, 'processing')))
    },

    async markFailed(id, error) {
      await db.update(importSources).set({ status: 'failed', error, processedAt: sql`now()` })
        .where(eq(importSources.id, id))
    },

    async applyImport(source, extracted, stub) {
      return db.transaction(async (tx) => {
        const plan = await buildPlan(tx, source.filename, extracted)

        const createdIds: number[] = []
        const createdSlugs: string[] = []
        for (const create of plan.creates) {
          const row = await createEntity(create.input, { sourceId: source.id }, tx)
          createdIds.push(row.id)
          createdSlugs.push(row.slug)
        }
        for (const update of plan.updates) {
          // updateEntity writes type, name, aliases, summary, body and attributes; type and name are the
          // existing values (merge.ts). slug, legacy keys, source_id and created_at are never touched.
          const row = await updateEntity(update.id, update.input, tx)
          if (!row) throw new Error(`Entity ${update.id} disappeared during the import`)
        }

        const endpointId = (endpoint: ImportPlan['relations'][number]['from']): number => {
          if (endpoint.kind === 'existing') return endpoint.id
          const id = createdIds[endpoint.index]
          if (id === undefined) throw new Error('Relation points to an entity that was not created')
          return id
        }
        let relationsWritten = 0
        if (plan.relations.length > 0) {
          const inserted = await tx.insert(entityRelations)
            .values(plan.relations.map((relation) => ({
              fromEntityId: endpointId(relation.from),
              toEntityId: endpointId(relation.to),
              kind: relation.kind,
              note: relation.note,
              sourceId: source.id,
            })))
            .onConflictDoNothing({
              target: [entityRelations.fromEntityId, entityRelations.toEntityId, entityRelations.kind],
            })
            .returning({ id: entityRelations.id })
          relationsWritten = inserted.length
        }

        const result: ImportResult = { ...planResult(plan, createdSlugs, relationsWritten), ...(stub ? { stub: true } : {}) }
        const done = await tx.update(importSources)
          .set({ status: 'done', processedAt: sql`now()`, result, error: null })
          .where(and(eq(importSources.id, source.id), eq(importSources.status, 'processing')))
          .returning({ id: importSources.id })
        if (done.length === 0) throw new Error('The source is no longer claimed by this run')
        return { plan, result }
      })
    },
  }
}
