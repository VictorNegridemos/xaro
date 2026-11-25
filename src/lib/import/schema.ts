// The shape Claude must return (plan 6.4), validated with zod. Pure.
import { z } from 'zod'
import { ENTITY_TYPES } from '../db/schema'

const attributeKey = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/)
// Numbers and booleans are accepted from the model and coerced, so attributes are Record<string, string> everywhere.
const attributeValue = z.union([z.string(), z.number(), z.boolean()])
  .transform((v) => String(v).trim())
  .pipe(z.string().max(500))

export const extractedEntity = z.strictObject({
  existingId: z.number().int().positive().nullable().default(null),
  type: z.enum(ENTITY_TYPES),
  name: z.string().trim().min(1).max(200),
  aliases: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
  summary: z.string().trim().max(400).default(''),
  body: z.string().trim().max(20000).default(''),
  attributes: z.record(attributeKey, attributeValue).default({}),
})

export const extractedRelation = z.strictObject({
  from: z.string().trim().min(1).max(200),
  to: z.string().trim().min(1).max(200),
  kind: z.string().trim().min(1).max(60).transform((s) => s.toLowerCase()),
  note: z.string().trim().max(300).nullable().default(null),
})

export const extraction = z.strictObject({
  entities: z.array(extractedEntity).max(200),
  relations: z.array(extractedRelation).max(400).default([]),
})

export type ExtractedEntity = z.infer<typeof extractedEntity>
export type ExtractedRelation = z.infer<typeof extractedRelation>
export type Extraction = z.infer<typeof extraction>

export type ParseResult = { ok: true; data: Extraction } | { ok: false; error: string }

/** Removes one optional leading ``` or ```json fence and its trailing fence. */
export function stripFence(text: string): string {
  const trimmed = text.trim()
  const match = /^```[a-zA-Z]*[ \t]*\r?\n([\s\S]*?)\r?\n?```$/.exec(trimmed)
  return match?.[1] !== undefined ? match[1].trim() : trimmed
}

/** Model text -> validated extraction, or a short error text that is fed back on the retry. */
export function parseExtraction(text: string): ParseResult {
  let json: unknown
  try {
    json = JSON.parse(stripFence(text))
  } catch (error) {
    return { ok: false, error: `The reply is not valid JSON (${error instanceof Error ? error.message : 'parse error'})` }
  }
  const parsed = extraction.safeParse(json)
  if (parsed.success) return { ok: true, data: parsed.data }
  return { ok: false, error: `The JSON does not match the required shape:\n${z.prettifyError(parsed.error)}` }
}
