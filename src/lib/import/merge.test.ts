import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { MAX_BODY_CHARS } from '../data/types'
import {
  NOTE_BODY_FULL, addendumMarker, mergeBody, mergeExtractions, mergeIntoExisting, normKey, unionAliases,
} from './merge'
import { SHIELDS, extraction, merged } from './test-fixtures'

describe('normKey', () => {
  test('NFKC, lower case, apostrophes removed, other runs become one space', () => {
    assert.equal(normKey("  X'aro "), 'xaro')
    assert.equal(normKey('Quist’s   recorder!'), 'quists recorder')
    assert.equal(normKey('Dr. Halvard-Quist'), 'dr halvard quist')
    assert.equal(normKey('ＦＴＬ'), 'ftl')
    assert.equal(normKey('...'), '')
  })
})

describe('step 1 — merge within the file', () => {
  test('entities sharing a name or alias key merge; first gives name and type; aliases union; first summary; attributes first-wins', () => {
    const result = mergeExtractions([
      extraction([{ type: 'character', name: 'Dr. Halvard Quist', aliases: ['the Archivist'], summary: '', body: 'He keeps the log.', attributes: { role: 'archivist' } }]),
      extraction([{ type: 'other', name: 'The Archivist', aliases: ['H. Quist'], summary: 'Chief archivist.', body: 'He keeps the log.\n\nHe built a recorder.', attributes: { role: 'other', status: 'missing' } }]),
    ])
    assert.equal(result.entities.length, 1)
    const e = result.entities[0]
    assert.ok(e)
    assert.equal(e.name, 'Dr. Halvard Quist')
    assert.equal(e.type, 'character')
    assert.deepEqual(e.aliases, ['the Archivist', 'H. Quist'])
    assert.equal(e.summary, 'Chief archivist.')
    assert.equal(e.body, 'He keeps the log.\n\nHe built a recorder.')
    assert.deepEqual(e.attributes, { role: 'archivist', status: 'missing' })
  })

  test('an entity bridging two groups merges them', () => {
    const result = mergeExtractions([
      extraction([{ type: 'creature', name: 'Pale Chorus' }, { type: 'creature', name: 'The Singers' }]),
      extraction([{ type: 'creature', name: 'Chorus', aliases: ['Pale Chorus', 'the singers'] }]),
    ])
    assert.equal(result.entities.length, 1)
    assert.equal(result.entities[0]?.name, 'Pale Chorus')
  })

  test('relations of all parts are kept', () => {
    const result = mergeExtractions([
      extraction([], [{ from: 'A', to: 'B', kind: 'member of', note: null }]),
      extraction([], [{ from: 'B', to: 'C', kind: 'located in', note: null }]),
    ])
    assert.equal(result.relations.length, 2)
  })
})

describe('step 3 — update an existing entity', () => {
  const filename = 'zz-sample.txt'

  test('name, type and slug never change; a different incoming name becomes an alias', () => {
    const out = mergeIntoExisting(SHIELDS, merged({ type: 'faction', name: 'Shield Array Mk II', aliases: ['Shields'] }), filename)
    assert.equal(out.input.name, 'Shield array')
    assert.equal(out.input.type, 'ship_system')
    assert.deepEqual(out.input.aliases, ['Shields', 'Shield Array Mk II'])
    assert.ok(!('slug' in out.input))
    assert.ok(!('legacyTable' in out.input) && !('legacyId' in out.input) && !('sourceId' in out.input))
    assert.deepEqual(out.changes, ['aliases +1'])
  })

  test('aliases: case-insensitive de-duplication, own name excluded, at most 30', () => {
    assert.deepEqual(unionAliases('Kik', ['Blink'], ['blink', 'KIK', ' Pilot ', '']), ['Blink', 'Pilot'])
    const many = Array.from({ length: 40 }, (_, i) => `alias ${i}`)
    const out = mergeIntoExisting(SHIELDS, merged({ type: 'ship_system', name: 'Shield array', aliases: many }), filename)
    assert.equal(out.input.aliases.length, 30)
    assert.ok(out.notes.some((n) => n.startsWith('alias limit reached')))
  })

  test('summary is set only when the existing one is empty', () => {
    assert.equal(mergeIntoExisting(SHIELDS, merged({ type: 'ship_system', name: 'Shield array', summary: 'New.' }), filename).input.summary, 'Deflector shields.')
    const empty = { ...SHIELDS, summary: '' }
    const out = mergeIntoExisting(empty, merged({ type: 'ship_system', name: 'Shield array', summary: 'New.' }), filename)
    assert.equal(out.input.summary, 'New.')
    assert.ok(out.changes.includes('summary set'))
  })

  test('attributes: new keys are added, existing keys (status of a ship system) are never overwritten', () => {
    const out = mergeIntoExisting(SHIELDS, merged({
      type: 'ship_system', name: 'Shield array', attributes: { status: 'Online', value: '100', manufacturer: 'Meridian' },
    }), filename)
    assert.equal(out.input.attributes.status, 'Offline')
    assert.equal(out.input.attributes.manufacturer, 'Meridian')
    assert.equal(out.conflicts.length, 1)
    assert.match(out.conflicts[0] ?? '', /^status: conflict, kept existing/)
    assert.ok(out.changes.includes('attributes +1'))
  })

  test('body: empty gets the incoming body; contained text is not repeated', () => {
    assert.deepEqual(mergeBody('', 'New body.', filename), { body: 'New body.', change: 'body set', note: null })
    assert.deepEqual(mergeBody('The shield  array\nprotects the hull.', 'The shield array protects the hull.', filename),
      { body: 'The shield  array\nprotects the hull.', change: null, note: null })
    assert.equal(mergeBody('Old.', '  ', filename).change, null)
  })

  test('body: an addendum is appended, and replaced (not appended again) on a forced re-import', () => {
    const first = mergeBody('Old body.', 'Fact A.', filename)
    assert.equal(first.body, `Old body.\n\n${addendumMarker(filename)}\nFact A.`)
    assert.equal(first.change, 'body addendum')

    const other = mergeBody(first.body, 'Fact from elsewhere.', 'other.txt')
    const forced = mergeBody(other.body, 'Fact A, revised.', filename)
    assert.equal(forced.change, 'addendum replaced')
    assert.equal(forced.body,
      `Old body.\n\n${addendumMarker(filename)}\nFact A, revised.\n\n${addendumMarker('other.txt')}\nFact from elsewhere.`)
    assert.equal(forced.body.split(addendumMarker(filename)).length, 2, 'one block per file')
  })

  test('body limit: an addendum that would exceed MAX_BODY_CHARS is skipped and reported', () => {
    const full = 'x'.repeat(MAX_BODY_CHARS - 10)
    const out = mergeIntoExisting({ ...SHIELDS, body: full }, merged({ type: 'ship_system', name: 'Shield array', body: 'More facts that do not fit.' }), filename)
    assert.equal(out.input.body, full)
    assert.ok(out.notes.includes(NOTE_BODY_FULL))
    assert.equal(mergeBody(full, 'More facts that do not fit.', filename).note, 'body full, addendum skipped')
  })

  test('nothing new means no change', () => {
    const out = mergeIntoExisting(SHIELDS, merged({ type: 'ship_system', name: 'Shield array', aliases: ['shields'] }), filename)
    assert.deepEqual(out.changes, [])
    assert.deepEqual(out.input.aliases, SHIELDS.aliases)
  })
})
