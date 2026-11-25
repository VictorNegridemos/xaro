// Pure helpers of the EntryForm: the editable state of an entry and the request body built from it.
// Client-safe (no Node or database imports).
import type { EntityAttributes, EntityInput, EntityType } from '@/lib/data/types'

export interface AttributeRow { id: number; key: string; value: string }

export interface EntryFormValues {
  type: EntityType
  name: string
  /** One alias per line. */
  aliases: string
  summary: string
  body: string
  attributes: AttributeRow[]
}

export function initialValues(entity?: Pick<EntityInput, 'type' | 'name' | 'aliases' | 'summary' | 'body' | 'attributes'>): EntryFormValues {
  if (!entity) return { type: 'record', name: '', aliases: '', summary: '', body: '', attributes: [] }
  return {
    type: entity.type,
    name: entity.name,
    aliases: entity.aliases.join('\n'),
    summary: entity.summary,
    body: entity.body,
    attributes: Object.entries(entity.attributes).map(([key, value], index) => ({ id: index + 1, key, value })),
  }
}

export type BuildResult = { ok: true; body: EntityInput } | { ok: false; fields: Record<string, string> }

/**
 * The JSON body for POST/PUT. Blank alias lines and fully blank attribute rows are dropped; a value
 * without a key and a repeated key are reported. Everything else is checked by the server's zod schema.
 */
export function buildBody(values: EntryFormValues): BuildResult {
  const attributes: EntityAttributes = {}
  for (const row of values.attributes) {
    const key = row.key.trim()
    if (key === '' && row.value.trim() === '') continue
    if (key === '') return { ok: false, fields: { attributes: 'Every attribute with a value needs a key.' } }
    if (Object.hasOwn(attributes, key)) return { ok: false, fields: { attributes: `The key "${key}" is used twice.` } }
    attributes[key] = row.value
  }
  return {
    ok: true,
    body: {
      type: values.type,
      name: values.name,
      aliases: values.aliases.split('\n').map((alias) => alias.trim()).filter((alias) => alias !== ''),
      summary: values.summary,
      body: values.body,
      attributes,
    },
  }
}

/** The message of a failed save, in the voice of the ship's computer. */
export function saveFailure(status: number): string {
  if (status === 401 || status === 403) return 'ACCESS DENIED — your session has ended. Log in again and resubmit.'
  if (status === 404) return 'NO RECORD — this entry no longer exists.'
  if (status === 413) return 'TRANSMISSION TOO LARGE — shorten the text and try again.'
  if (status === 400) return 'ENTRY REJECTED — correct the marked fields.'
  if (status === 0) return 'NO CONNECTION — the archive could not be reached. Nothing was saved.'
  return 'ARCHIVE UNREACHABLE — nothing was saved. Try again in a moment.'
}
