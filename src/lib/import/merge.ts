// Merge rules of the import (plan 6.6, steps 1 and 3). Pure functions: the rules are enforced here,
// in code, and never left to the prompt.
import { MAX_BODY_CHARS } from '../data/types'
import type { Entity, EntityAttributes, EntityInput, EntityType } from '../data/types'
import type { ExtractedEntity, ExtractedRelation, Extraction } from './schema'

export const MAX_ALIASES = 30

/** NFKC, lower-case, apostrophes removed, every run of non-letter/non-digit characters -> one space, trimmed. */
export function normKey(s: string): string {
  return s.normalize('NFKC').toLowerCase()
    .replace(/['‘’ʼ`´]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/** The non-empty keys of a name and its aliases; the name key (when not empty) comes first. */
export function entityKeys(entity: { name: string; aliases: readonly string[] }): string[] {
  const keys = new Set<string>()
  for (const value of [entity.name, ...entity.aliases]) {
    const key = normKey(value)
    if (key !== '') keys.add(key)
  }
  return [...keys]
}

export interface MergedEntity {
  existingId: number | null
  type: EntityType
  name: string
  aliases: string[]
  summary: string
  body: string
  attributes: EntityAttributes
}
export interface MergedFile { entities: MergedEntity[]; relations: ExtractedRelation[] }

const squash = (s: string) => s.replace(/\s+/g, ' ').trim()

/** Union with case-insensitive de-duplication; the entity's own name is never an alias. */
export function unionAliases(name: string, current: readonly string[], incoming: readonly string[]): string[] {
  const seen = new Set<string>([name.trim().toLowerCase()])
  const out: string[] = []
  for (const alias of [...current, ...incoming]) {
    const value = alias.trim()
    const lower = value.toLowerCase()
    if (value === '' || seen.has(lower)) continue
    seen.add(lower)
    out.push(value)
  }
  return out
}

/** Appends the paragraphs of `more` that `body` does not already contain, separated by a blank line. */
export function appendNewParagraphs(body: string, more: string): string {
  const paragraphs = (s: string) => s.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p !== '')
  const present = new Set(paragraphs(body).map(squash))
  const out = body.trim() === '' ? [] : [body.trim()]
  for (const paragraph of paragraphs(more)) {
    const key = squash(paragraph)
    if (present.has(key)) continue
    present.add(key)
    out.push(paragraph)
  }
  return out.join('\n\n')
}

/** Cuts at the last paragraph boundary before the limit, or hard at the limit. */
export function cutAtParagraph(body: string, max: number = MAX_BODY_CHARS): string {
  if (body.length <= max) return body
  const window = body.slice(0, max)
  const boundary = window.lastIndexOf('\n\n')
  return (boundary > 0 ? window.slice(0, boundary) : window).trimEnd()
}

function fold(target: MergedEntity, source: MergedEntity): void {
  target.aliases = unionAliases(target.name, target.aliases, [source.name, ...source.aliases])
  if (target.summary === '') target.summary = source.summary
  target.body = appendNewParagraphs(target.body, source.body)
  for (const [key, value] of Object.entries(source.attributes)) {
    if (!Object.hasOwn(target.attributes, key)) target.attributes[key] = value
  }
  if (target.existingId === null) target.existingId = source.existingId
}

/**
 * Step 1 — merge within the file (across chunks). Entities that share any key among {name, aliases}
 * become one: the first occurrence gives name and type, aliases are unioned, the summary is the first
 * non-empty one, bodies are concatenated without repeated paragraphs, attributes are first-wins.
 */
export function mergeExtractions(parts: readonly Extraction[]): MergedFile {
  const groups: Array<{ entity: MergedEntity; keys: Set<string> }> = []
  for (const part of parts) {
    for (const raw of part.entities) {
      const incoming = toMerged(raw)
      const keys = entityKeys(incoming)
      const hits = groups.filter((group) => keys.some((key) => group.keys.has(key)))
      const first = hits[0]
      if (!first) {
        groups.push({ entity: incoming, keys: new Set(keys) })
        continue
      }
      // The incoming entity may bridge groups that had nothing in common before.
      for (const other of hits.slice(1)) {
        fold(first.entity, other.entity)
        for (const key of other.keys) first.keys.add(key)
        groups.splice(groups.indexOf(other), 1)
      }
      fold(first.entity, incoming)
      for (const key of keys) first.keys.add(key)
    }
  }
  return { entities: groups.map((group) => group.entity), relations: parts.flatMap((part) => part.relations) }
}

function toMerged(raw: ExtractedEntity): MergedEntity {
  return {
    existingId: raw.existingId,
    type: raw.type,
    name: raw.name,
    aliases: unionAliases(raw.name, [], raw.aliases),
    summary: raw.summary,
    body: raw.body,
    attributes: { ...raw.attributes },
  }
}

export function addendumMarker(filename: string): string {
  return `[Addendum · ${squash(filename)}]`
}
const ANY_ADDENDUM = '\n\n[Addendum · '

export const NOTE_BODY_FULL = 'body full, addendum skipped'
export const NOTE_BODY_CUT = 'body cut at the size limit'
export const NOTE_CONFLICT = 'conflict, kept existing'

export interface BodyOutcome { body: string; change: string | null; note: string | null }

/** The body row of the update table in plan 6.6. */
export function mergeBody(existing: string, incoming: string, filename: string, max: number = MAX_BODY_CHARS): BodyOutcome {
  if (incoming.trim() === '') return { body: existing, change: null, note: null }
  if (existing.trim() === '') {
    const body = cutAtParagraph(incoming, max)
    return { body, change: 'body set', note: body.length < incoming.length ? NOTE_BODY_CUT : null }
  }
  if (squash(existing).includes(squash(incoming))) return { body: existing, change: null, note: null }

  const marker = addendumMarker(filename)
  const block = `${marker}\n${incoming}`
  const at = existing.indexOf(`\n\n${marker}\n`)
  let candidate: string
  let change: string
  if (at >= 0) {
    // Re-import with --force: the block of this file is replaced, later blocks are kept.
    const next = existing.indexOf(ANY_ADDENDUM, at + 2 + marker.length)
    candidate = `${existing.slice(0, at)}\n\n${block}${next >= 0 ? existing.slice(next) : ''}`
    change = 'addendum replaced'
  } else {
    candidate = `${existing.trimEnd()}\n\n${block}`
    change = 'body addendum'
  }
  if (candidate.length > max) return { body: existing, change: null, note: NOTE_BODY_FULL }
  return { body: candidate, change, note: null }
}

export interface UpdateOutcome {
  /** Complete new field values; type and name are always the existing ones. */
  input: EntityInput
  /** Short descriptions such as "aliases +1"; empty when nothing would change. */
  changes: string[]
  conflicts: string[]
  notes: string[]
}

const short = (s: string) => (s.length > 80 ? `${s.slice(0, 77)}...` : s)

/**
 * Step 3 — update an existing entity. id, slug, type, legacy keys, source and name never change
 * (the caller only writes the fields of `input`, and type and name are copied from `existing`).
 */
export function mergeIntoExisting(existing: Entity, incoming: MergedEntity, filename: string): UpdateOutcome {
  const changes: string[] = []
  const conflicts: string[] = []
  const notes: string[] = []

  const merged = unionAliases(existing.name, existing.aliases, [incoming.name, ...incoming.aliases])
  const aliases = merged.slice(0, Math.max(MAX_ALIASES, existing.aliases.length))
  const added = aliases.length - unionAliases(existing.name, existing.aliases, []).length
  if (added > 0) changes.push(`aliases +${added}`)
  if (merged.length > aliases.length) notes.push(`alias limit reached, ${merged.length - aliases.length} not added`)

  let summary = existing.summary
  if (existing.summary.trim() === '' && incoming.summary !== '') {
    summary = incoming.summary
    changes.push('summary set')
  }

  const body = mergeBody(existing.body, incoming.body, filename)
  if (body.change !== null) changes.push(body.change)
  if (body.note !== null) notes.push(body.note)

  const attributes: EntityAttributes = { ...existing.attributes }
  let addedKeys = 0
  for (const [key, value] of Object.entries(incoming.attributes)) {
    if (!Object.hasOwn(attributes, key)) {
      attributes[key] = value
      addedKeys += 1
    } else if (attributes[key] !== value) {
      conflicts.push(`${key}: ${NOTE_CONFLICT} ("${short(String(attributes[key]))}", incoming "${short(value)}")`)
    }
  }
  if (addedKeys > 0) changes.push(`attributes +${addedKeys}`)

  return {
    input: {
      type: existing.type,
      name: existing.name,
      aliases: added > 0 ? aliases : existing.aliases,
      summary,
      body: body.body,
      attributes,
    },
    changes,
    conflicts,
    notes,
  }
}
