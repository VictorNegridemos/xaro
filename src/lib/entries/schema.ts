// zod schema of the create and update body (plan 9.3 task 1). Shared by POST /api/entries and
// PUT /api/entries/[id]. Unknown top-level fields (slug, legacyTable, id, ...) are rejected.
import { z } from 'zod'
import { ENTITY_TYPES } from '../db/schema'
import type { EntityInput } from '../data/types'
import {
  ATTRIBUTE_KEY_PATTERN, MAX_ALIASES, MAX_ALIAS_CHARS, MAX_ATTRIBUTES, MAX_ATTRIBUTE_VALUE_CHARS, MAX_BODY_CHARS,
  MAX_NAME_CHARS, MAX_SUMMARY_CHARS,
} from './limits'

export const entryBody = z.strictObject({
  type: z.enum(ENTITY_TYPES, 'Choose one of the listed types.'),
  name: z.string('The name is required.')
    .trim()
    .min(1, 'The name is required.')
    .max(MAX_NAME_CHARS, `The name may hold at most ${MAX_NAME_CHARS} characters.`),
  aliases: z.array(
    z.string().trim().min(1, 'An alias may not be empty.').max(MAX_ALIAS_CHARS, `An alias may hold at most ${MAX_ALIAS_CHARS} characters.`),
  ).max(MAX_ALIASES, `At most ${MAX_ALIASES} aliases.`),
  summary: z.string().max(MAX_SUMMARY_CHARS, `The summary may hold at most ${MAX_SUMMARY_CHARS} characters.`),
  body: z.string().max(MAX_BODY_CHARS, `The text may hold at most ${MAX_BODY_CHARS.toLocaleString('en')} characters.`),
  attributes: z.record(
    z.string().regex(ATTRIBUTE_KEY_PATTERN, 'Attribute keys use lower-case letters, digits and _ and start with a letter (at most 40).'),
    z.string('Attribute values are text.').max(MAX_ATTRIBUTE_VALUE_CHARS, `An attribute value may hold at most ${MAX_ATTRIBUTE_VALUE_CHARS} characters.`),
  ).refine((attributes) => Object.keys(attributes).length <= MAX_ATTRIBUTES, `At most ${MAX_ATTRIBUTES} attributes.`),
})

export type EntryCheck =
  | { ok: true; input: EntityInput }
  | { ok: false; fields: Record<string, string> }

/**
 * Validates a parsed JSON body. Field errors are keyed by the top-level field (`_form` for the
 * body as a whole and unknown fields); the first message wins.
 */
export function checkEntry(body: unknown): EntryCheck {
  const parsed = entryBody.safeParse(body)
  if (!parsed.success) {
    const fields: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      const key = issue.code === 'unrecognized_keys' || issue.path.length === 0 ? '_form' : String(issue.path[0])
      fields[key] ??= issue.code === 'unrecognized_keys' ? `Unknown field: ${issue.keys.join(', ')}` : issue.message
    }
    return { ok: false, fields }
  }
  const { type, name, aliases, summary, body: text, attributes } = parsed.data
  return { ok: true, input: { type, name, aliases, summary, body: text, attributes } }
}
