import assert from 'node:assert/strict'
import { test } from 'node:test'
import { LEGACY_TABLES } from './lib/legacy'
import {
  FIXTURE_TABLE, QUOTING_FIXTURE, buildRestoreSelect, buildSetvalLine, insertLineToSelect, restoreInsertTemplate,
} from './lib/restore-sql'

const byName = (suffix: string) => {
  const table = LEGACY_TABLES.find((t) => t.name.endsWith(suffix))
  assert.ok(table, `legacy table *${suffix} is defined`)
  return table
}

test('restore template per table: column list, %s for the id, %L for every other column', () => {
  for (const table of LEGACY_TABLES) {
    const template = restoreInsertTemplate(table)
    assert.ok(template.startsWith(`INSERT INTO public.${table.name} (${table.columns.join(', ')})`))
    const values = /VALUES \((.*)\);$/.exec(template)?.[1]?.split(', ') ?? []
    assert.equal(values.length, table.columns.length)
    assert.equal(values[0], '%s')
    assert.ok(values.slice(1).every((v) => v === '%L'))
    assert.ok(!template.includes("'"), 'no hand-written quote in the template')
  }
})

test('OVERRIDING SYSTEM VALUE only for the identity table (crew)', () => {
  assert.ok(restoreInsertTemplate(byName('members')).includes(') OVERRIDING SYSTEM VALUE VALUES ('))
  assert.ok(!restoreInsertTemplate(byName('subsystems')).includes('OVERRIDING'))
  assert.ok(!restoreInsertTemplate(byName('records')).includes('OVERRIDING'))
})

test('column lists match the live tables documented in 01-investigation-data.md', () => {
  assert.deepEqual(byName('members').columns, ['id', 'first_name', 'last_name', 'crew_rank', 'race', 'composition', 'current_status', 'expertise'])
  assert.deepEqual(byName('subsystems').columns, ['id', 'type', 'status', 'current', 'value', 'details'])
  assert.deepEqual(byName('records').columns, ['id', 'title', 'text'])
})

test('the SELECT lets Postgres format the line, ordered by id', () => {
  const records = byName('records')
  assert.equal(
    buildRestoreSelect(records),
    `SELECT format('INSERT INTO public.${records.name} (id, title, text) VALUES (%s, %L, %L);', id, title, text) AS line FROM public.${records.name} ORDER BY id`,
  )
})

test('setval lines name the real sequences', () => {
  assert.deepEqual(LEGACY_TABLES.map((t) => t.sequence), ['crew_members_id_seq', 'ship_subsystems_id_seq', 'records_id_seq'])
  assert.ok(buildSetvalLine(byName('records')).startsWith("SELECT setval('public.records_id_seq', "))
})

test('identifiers that are not plain are refused', () => {
  assert.throws(() => restoreInsertTemplate({ ...FIXTURE_TABLE, name: 'x; drop' }))
  assert.throws(() => restoreInsertTemplate({ ...FIXTURE_TABLE, columns: ['id', "a'b"] }))
  assert.throws(() => restoreInsertTemplate({ ...FIXTURE_TABLE, columns: ['a', 'id'] }))
})

test('quoting fixture covers apostrophe, backslash, newline and $$; the read-back statement is well formed', () => {
  const joined = QUOTING_FIXTURE.join('')
  for (const needle of ["'", '\\', '\n', '$$']) assert.ok(joined.includes(needle))
  // What Postgres returns for format('%L') of "It's" under standard_conforming_strings.
  const line = "INSERT INTO public.quoting_fixture (id, a, b, c, d) VALUES (1, 'It''s', E'a\\\\b', 'x', 'y');"
  assert.equal(insertLineToSelect(line), "SELECT * FROM (VALUES (1, 'It''s', E'a\\\\b', 'x', 'y')) AS v(id, a, b, c, d)")
  assert.throws(() => insertLineToSelect('DELETE FROM x;'))
})
