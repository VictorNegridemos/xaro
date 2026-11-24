// Limits of the entry form (plan 9.3 task 1). Client-safe: no Node or database imports, so the
// EntryForm can show the same limits the server enforces.
export { MAX_BODY_CHARS } from '../data/types'

export const MAX_NAME_CHARS = 200
export const MAX_ALIASES = 30
export const MAX_ALIAS_CHARS = 200
export const MAX_SUMMARY_CHARS = 500
export const MAX_ATTRIBUTES = 40
export const MAX_ATTRIBUTE_VALUE_CHARS = 1_000
/** A lower-case key: a letter, then letters, digits or underscores; at most 40 characters. */
export const ATTRIBUTE_KEY_PATTERN = /^[a-z][a-z0-9_]{0,39}$/
/** A request above this is rejected before parsing (413). Body 100,000 chars of UTF-8 plus the rest. */
export const MAX_ENTRY_REQUEST_BYTES = 600_000
