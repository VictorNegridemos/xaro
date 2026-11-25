// Turns the merged extraction of one file into a write plan (plan 6.6, steps 2, 4 and 5). Pure.
import type { Entity, EntityIndexRow, EntityInput, EntityType, ImportResult } from '../data/types'
import {
  MAX_ALIASES, NOTE_BODY_CUT, cutAtParagraph, entityKeys, mergeIntoExisting, normKey, unionAliases,
} from './merge'
import type { MergedEntity, MergedFile } from './merge'

export const NOTE_EXISTING_ID_REJECTED = 'existingId rejected'
export const notePossibleDuplicate = (slug: string) => `possible duplicate of ${slug}`

export interface PlanCreate { input: EntityInput }
export interface PlanUpdate {
  id: number
  slug: string
  type: EntityType
  name: string
  input: EntityInput
  changes: string[]
}
export type PlanEndpoint = { kind: 'create'; index: number } | { kind: 'existing'; id: number }
export interface PlanRelation {
  from: PlanEndpoint
  to: PlanEndpoint
  fromName: string
  toName: string
  kind: string
  note: string | null
}
export interface PlanSkip { what: string; reason: string }
export interface ImportPlan {
  creates: PlanCreate[]
  updates: PlanUpdate[]
  relations: PlanRelation[]
  skipped: PlanSkip[]
  conflicts: string[]
  notes: string[]
}

export interface PlanOptions {
  /** ids of the index rows that were actually sent to the model; default: every row of existingIndex. */
  sentIds?: ReadonlySet<number>
}

interface IndexMaps { byId: Map<number, EntityIndexRow>; byName: Map<string, EntityIndexRow[]>; byAlias: Map<string, EntityIndexRow[]> }

function buildMaps(index: readonly EntityIndexRow[]): IndexMaps {
  const byId = new Map<number, EntityIndexRow>()
  const byName = new Map<string, EntityIndexRow[]>()
  const byAlias = new Map<string, EntityIndexRow[]>()
  const add = (map: Map<string, EntityIndexRow[]>, key: string, row: EntityIndexRow) => {
    if (key === '') return
    const list = map.get(key)
    if (list) {
      if (!list.includes(row)) list.push(row)
    } else {
      map.set(key, [row])
    }
  }
  for (const row of index) {
    byId.set(row.id, row)
    add(byName, normKey(row.name), row)
    for (const alias of row.aliases) add(byAlias, normKey(alias), row)
  }
  return { byId, byName, byAlias }
}

const lowestId = (rows: readonly EntityIndexRow[]) => rows.reduce<EntityIndexRow | undefined>(
  (best, row) => (best === undefined || row.id < best.id ? row : best), undefined)

/** Every existing row that shares an alias key with the incoming entity (name = alias, alias = name, alias = alias). */
function aliasCandidates(maps: IndexMaps, incoming: MergedEntity): EntityIndexRow[] {
  const found = new Map<number, EntityIndexRow>()
  const nameKey = normKey(incoming.name)
  for (const row of maps.byAlias.get(nameKey) ?? []) found.set(row.id, row)
  for (const alias of incoming.aliases) {
    const key = normKey(alias)
    for (const row of maps.byName.get(key) ?? []) found.set(row.id, row)
    for (const row of maps.byAlias.get(key) ?? []) found.set(row.id, row)
  }
  return [...found.values()].sort((a, b) => a.id - b.id)
}

type Match =
  | { kind: 'update'; row: EntityIndexRow; rejectedId: boolean }
  | { kind: 'create'; duplicates: EntityIndexRow[]; rejectedId: boolean }

/** Step 2 — match one incoming entity against the existing entities. */
export function matchExisting(
  maps: IndexMaps, incoming: MergedEntity, sentIds: ReadonlySet<number> | undefined,
): Match {
  let rejectedId = false
  if (incoming.existingId !== null) {
    // Rule 1: the id must have been offered to the model AND a name or alias key must agree.
    const row = maps.byId.get(incoming.existingId)
    const offered = row !== undefined && (sentIds === undefined || sentIds.has(row.id))
    if (row && offered) {
      const existingKeys = new Set(entityKeys(row))
      if (entityKeys(incoming).some((key) => existingKeys.has(key))) return { kind: 'update', row, rejectedId }
    }
    rejectedId = true
  }
  // Rule 2a: name key = name key, any type.
  const byName = lowestId(maps.byName.get(normKey(incoming.name)) ?? [])
  if (byName) return { kind: 'update', row: byName, rejectedId }
  // Rule 2b: an alias key is involved and the type is equal.
  const candidates = aliasCandidates(maps, incoming)
  const sameType = lowestId(candidates.filter((row) => row.type === incoming.type))
  if (sameType) return { kind: 'update', row: sameType, rejectedId }
  // Rule 3: an alias-only match with a different type is not a match.
  return { kind: 'create', duplicates: candidates, rejectedId }
}

/** ids of the existing entities whose full rows planImport needs (anything sharing a key, or named by existingId). */
export function candidateIds(existingIndex: readonly EntityIndexRow[], merged: MergedFile): number[] {
  const keys = new Set(merged.entities.flatMap((entity) => entityKeys(entity)))
  const named = new Set(merged.entities.map((entity) => entity.existingId))
  return existingIndex
    .filter((row) => named.has(row.id) || entityKeys(row).some((key) => keys.has(key)))
    .map((row) => row.id)
}

const label = (entity: { type: EntityType; name: string }) => `${entity.type} ${entity.name}`

export function planImport(
  existingIndex: readonly EntityIndexRow[],
  existingById: ReadonlyMap<number, Entity>,
  merged: MergedFile,
  filename: string,
  options: PlanOptions = {},
): ImportPlan {
  const maps = buildMaps(existingIndex)
  const plan: ImportPlan = { creates: [], updates: [], relations: [], skipped: [], conflicts: [], notes: [] }
  // Two incoming entities may match the same existing one; the second sees the result of the first.
  const current = new Map<number, Entity>()
  const updates = new Map<number, PlanUpdate>()
  const fileEndpoints = new Map<string, PlanEndpoint>()

  for (const incoming of merged.entities) {
    const match = matchExisting(maps, incoming, options.sentIds)
    if (match.rejectedId) {
      plan.skipped.push({ what: `${label(incoming)} (existingId ${incoming.existingId})`, reason: NOTE_EXISTING_ID_REJECTED })
      plan.notes.push(`${label(incoming)}: ${NOTE_EXISTING_ID_REJECTED} (id ${incoming.existingId})`)
    }

    let endpoint: PlanEndpoint
    if (match.kind === 'update') {
      const id = match.row.id
      const existing = current.get(id) ?? existingById.get(id)
      if (!existing) throw new Error(`planImport: entity ${id} is in the index but its row was not loaded`)
      const outcome = mergeIntoExisting(existing, incoming, filename)
      for (const conflict of outcome.conflicts) plan.conflicts.push(`${label(existing)}: ${conflict}`)
      for (const note of outcome.notes) plan.notes.push(`${label(existing)}: ${note}`)
      const earlier = updates.get(id)
      if (outcome.changes.length > 0) {
        current.set(id, { ...existing, ...outcome.input })
        if (earlier) {
          earlier.input = outcome.input
          earlier.changes.push(...outcome.changes)
        } else {
          const update: PlanUpdate = {
            id, slug: existing.slug, type: existing.type, name: existing.name, input: outcome.input, changes: [...outcome.changes],
          }
          updates.set(id, update)
          plan.updates.push(update)
        }
      } else if (!earlier) {
        plan.skipped.push({ what: label(existing), reason: 'no new information' })
      }
      endpoint = { kind: 'existing', id }
    } else {
      for (const duplicate of match.duplicates) {
        const slug = existingById.get(duplicate.id)?.slug ?? `#${duplicate.id}`
        plan.notes.push(`${label(incoming)}: ${notePossibleDuplicate(slug)}`)
      }
      // Step 4 — create.
      const body = cutAtParagraph(incoming.body)
      if (body.length < incoming.body.length) plan.notes.push(`${label(incoming)}: ${NOTE_BODY_CUT}`)
      plan.creates.push({
        input: {
          type: incoming.type,
          name: incoming.name,
          aliases: unionAliases(incoming.name, [], incoming.aliases).slice(0, MAX_ALIASES),
          summary: incoming.summary,
          body,
          attributes: { ...incoming.attributes },
        },
      })
      endpoint = { kind: 'create', index: plan.creates.length - 1 }
    }
    for (const key of entityKeys(incoming)) {
      if (!fileEndpoints.has(key)) fileEndpoints.set(key, endpoint)
    }
  }

  // Step 5 — relations: endpoints by key, first among the entities of this file, then among existing ones.
  const resolve = (name: string): PlanEndpoint | null => {
    const key = normKey(name)
    if (key === '') return null
    const inFile = fileEndpoints.get(key)
    if (inFile) return inFile
    const byName = lowestId(maps.byName.get(key) ?? [])
    if (byName) return { kind: 'existing', id: byName.id }
    const byAlias = maps.byAlias.get(key) ?? []
    const only = byAlias.length === 1 ? byAlias[0] : undefined // an alias shared by several entities is ambiguous
    return only ? { kind: 'existing', id: only.id } : null
  }
  const endpointKey = (endpoint: PlanEndpoint) => (endpoint.kind === 'create' ? `c${endpoint.index}` : `e${endpoint.id}`)
  const seen = new Set<string>()
  for (const relation of merged.relations) {
    const what = `${relation.from} —[${relation.kind}]→ ${relation.to}`
    const from = resolve(relation.from)
    const to = resolve(relation.to)
    if (!from || !to) {
      plan.skipped.push({ what, reason: `relation endpoint not found: ${!from ? relation.from : relation.to}` })
      continue
    }
    if (endpointKey(from) === endpointKey(to)) {
      plan.skipped.push({ what, reason: 'relation points to itself' })
      continue
    }
    const key = `${endpointKey(from)}>${endpointKey(to)}>${relation.kind}`
    if (seen.has(key)) continue
    seen.add(key)
    plan.relations.push({ from, to, fromName: relation.from, toName: relation.to, kind: relation.kind, note: relation.note })
  }
  return plan
}

/** One printable line per entity; `createdSlugs[i]` belongs to `plan.creates[i]`. */
export function planLines(plan: ImportPlan, createdSlugs: readonly (string | undefined)[] = []): string[] {
  const lines: string[] = []
  plan.creates.forEach((create, i) => {
    const slug = createdSlugs[i]
    lines.push(`+ ${create.input.type.padEnd(11)} ${create.input.name}${slug ? `  /entry/${slug}` : ''}`)
  })
  for (const update of plan.updates) {
    lines.push(`~ ${update.type.padEnd(11)} ${update.name} (${update.changes.join(', ')})`)
  }
  return lines
}

/** The stored and printed summary. `relations` may be lower than planned when edges already existed. */
export function planResult(
  plan: ImportPlan, createdSlugs: readonly (string | undefined)[] = [], relationsWritten: number = plan.relations.length,
): ImportResult {
  return {
    created: plan.creates.length,
    updated: plan.updates.length,
    relations: relationsWritten,
    skipped: plan.skipped.length,
    conflicts: plan.conflicts.length,
    notes: [...plan.notes, ...plan.conflicts, ...plan.skipped.map((skip) => `skipped: ${skip.what} (${skip.reason})`)],
    lines: planLines(plan, createdSlugs),
  }
}

/** `created 7 · updated 2 · relations 9 · skipped 1 (conflicts kept: 1)` */
export function formatSummary(result: Pick<ImportResult, 'created' | 'updated' | 'relations' | 'skipped' | 'conflicts'>): string {
  return `created ${result.created} · updated ${result.updated} · relations ${result.relations} · skipped ${result.skipped} (conflicts kept: ${result.conflicts})`
}
