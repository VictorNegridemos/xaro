// Builds the SELECT statements that make Postgres itself write the INSERT lines of restore.sql
// (plan 3.4). Postgres does the quoting with format() and %L; no string is quoted in JavaScript.
import type { LegacyTableSpec } from './legacy'

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/

function assertIdentifier(name: string): string {
  if (!IDENTIFIER.test(name)) throw new Error(`Not a plain identifier: ${name}`)
  return name
}

/** The format() template: %s for the id, %L for every other column. */
export function restoreInsertTemplate(table: LegacyTableSpec): string {
  const columns = table.columns.map(assertIdentifier)
  if (columns[0] !== 'id') throw new Error(`${table.name}: the first column must be id`)
  const placeholders = columns.map((_, i) => (i === 0 ? '%s' : '%L')).join(', ')
  const overriding = table.overridingSystemValue ? ' OVERRIDING SYSTEM VALUE' : ''
  return `INSERT INTO public.${assertIdentifier(table.name)} (${columns.join(', ')})${overriding} VALUES (${placeholders});`
}

/**
 * SELECT format('<template>', id, col, ...) AS line FROM <source> ORDER BY id
 * `source` defaults to the table itself; the self-test passes a VALUES list instead.
 */
export function buildRestoreSelect(table: LegacyTableSpec, source?: string): string {
  const template = restoreInsertTemplate(table)
  if (template.includes("'")) throw new Error('The template must not contain a quote')
  const from = source ?? `public.${assertIdentifier(table.name)}`
  return `SELECT format('${template}', ${table.columns.join(', ')}) AS line FROM ${from} ORDER BY id`
}

/** setval() line that puts the table's sequence back after a restore. */
export function buildSetvalLine(table: LegacyTableSpec): string {
  const name = assertIdentifier(table.name)
  return `SELECT setval('public.${assertIdentifier(table.sequence)}', (SELECT coalesce(max(id), 1) FROM public.${name}));`
}

/** Strings that exercise the quoting: apostrophe, backslash, newline, dollar quoting. */
export const QUOTING_FIXTURE: readonly string[] = ["It's X'aro", 'back\\slash \\n', 'line one\nline two', 'cash $$ and $tag$ body']

export const FIXTURE_TABLE: LegacyTableSpec = {
  name: 'quoting_fixture',
  columns: ['id', 'a', 'b', 'c', 'd'],
  overridingSystemValue: false,
  sequence: 'quoting_fixture_id_seq',
}

/** Turns a generated INSERT line into a SELECT of the same literals, to read them back. */
export function insertLineToSelect(line: string): string {
  const marker = ' VALUES ('
  const at = line.indexOf(marker)
  if (!line.startsWith('INSERT INTO ') || at === -1 || !line.endsWith(');')) {
    throw new Error('Unexpected INSERT line shape')
  }
  return `SELECT * FROM (VALUES (${line.slice(at + marker.length, -2)})) AS v(${FIXTURE_TABLE.columns.join(', ')})`
}
