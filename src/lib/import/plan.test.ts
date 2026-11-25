import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, test } from 'node:test'
import type { Entity } from '../data/types'
import { MAX_BODY_CHARS } from '../data/types'
import { mergeExtractions } from './merge'
import type { MergedFile } from './merge'
import { NOTE_EXISTING_ID_REJECTED, formatSummary, planImport, planResult } from './plan'
import { parseExtraction } from './schema'
import { EXISTING, KIK, SHIELDS, entityRow, indexRow, merged } from './test-fixtures'

const index = EXISTING.map(indexRow)
const byId = new Map<number, Entity>(EXISTING.map((e) => [e.id, e]))
const file = (entities: MergedFile['entities'], relations: MergedFile['relations'] = []): MergedFile => ({ entities, relations })
const plan = (m: MergedFile, opts = {}) => planImport(index, byId, m, 'zz-sample.txt', opts)

describe('existingId (rule 1)', () => {
  test('honoured when a name or alias key of that entity matches', () => {
    const p = plan(file([merged({ type: 'ship_system', name: 'Shields', existingId: SHIELDS.id, body: 'New fact.' })]))
    assert.equal(p.updates.length, 1)
    assert.equal(p.updates[0]?.id, SHIELDS.id)
    assert.equal(p.creates.length, 0)
    assert.ok(!p.notes.some((n) => n.includes(NOTE_EXISTING_ID_REJECTED)))
  })

  test('rejected when no key matches: falls through to rule 2 and is counted', () => {
    const p = plan(file([merged({ type: 'faction', name: 'Meridian Salvage Combine', existingId: SHIELDS.id })]))
    assert.equal(p.updates.length, 0)
    assert.equal(p.creates.length, 1)
    assert.ok(p.skipped.some((s) => s.reason === NOTE_EXISTING_ID_REJECTED))
    assert.ok(p.notes.some((n) => n.includes(NOTE_EXISTING_ID_REJECTED)))
  })

  test('rejected when the id was not in the index that was sent', () => {
    const p = plan(file([merged({ type: 'ship_system', name: 'Shields', existingId: SHIELDS.id, body: 'x' })]), { sentIds: new Set([KIK.id]) })
    assert.ok(p.skipped.some((s) => s.reason === NOTE_EXISTING_ID_REJECTED))
    // rule 2b still matches by alias with equal type
    assert.equal(p.updates[0]?.id, SHIELDS.id)

    const unknown = plan(file([merged({ type: 'creature', name: 'Pale Chorus', existingId: 999 })]))
    assert.equal(unknown.creates.length, 1)
    assert.ok(unknown.skipped.some((s) => s.reason === NOTE_EXISTING_ID_REJECTED))
  })
})

describe('matching (rule 2 and 3)', () => {
  test('name key = name key merges across types', () => {
    const p = plan(file([merged({ type: 'faction', name: 'KIK', body: 'Kik leads a faction.' })]))
    assert.equal(p.updates[0]?.id, KIK.id)
    assert.equal(p.updates[0]?.type, 'character')
    assert.equal(p.updates[0]?.input.type, 'character')
  })

  test('an alias match with equal type merges', () => {
    const p = plan(file([merged({ type: 'character', name: 'Blink', body: 'Blink can teleport.' })]))
    assert.equal(p.updates[0]?.id, KIK.id)
    assert.equal(p.updates[0]?.input.name, 'Kik')
  })

  test('faction "The Shields" against the ship system alias Shields: created, possible duplicate', () => {
    const p = plan(file([merged({ type: 'faction', name: 'Shields', aliases: ['The Shields'] })]))
    assert.equal(p.updates.length, 0)
    assert.equal(p.creates.length, 1)
    assert.ok(p.notes.some((n) => n.includes('possible duplicate of shield-array')))
    const p2 = plan(file([merged({ type: 'faction', name: 'The Shields', aliases: ['Shields'] })]))
    assert.equal(p2.creates.length, 1)
    assert.ok(p2.notes.some((n) => n.includes('possible duplicate of shield-array')))
  })

  test('location "Blink" against the crew alias Blink: created, possible duplicate', () => {
    const p = plan(file([merged({ type: 'location', name: 'Blink' })]))
    assert.equal(p.updates.length, 0)
    assert.equal(p.creates.length, 1)
    assert.ok(p.notes.some((n) => n.includes('possible duplicate of kik')))
  })

  test('several matches: name over alias, then the lowest id', () => {
    const a = entityRow({ id: 20, type: 'item', name: 'Relic', aliases: ['Key'] })
    const b = entityRow({ id: 21, type: 'item', name: 'Key', aliases: [] })
    const c = entityRow({ id: 19, type: 'item', name: 'Other', aliases: ['Key'] })
    const idx = [a, b, c].map(indexRow)
    const map = new Map([a, b, c].map((e) => [e.id, e]))
    const byName = planImport(idx, map, file([merged({ type: 'item', name: 'Key', body: 'x' })]), 'f.txt')
    assert.equal(byName.updates[0]?.id, 21)
    const byAlias = planImport(idx, map, file([merged({ type: 'item', name: 'Thing', aliases: ['Key'], body: 'x' })]), 'f.txt')
    assert.equal(byAlias.updates[0]?.id, 19)
  })
})

describe('create, relations, summary', () => {
  test('a created body over MAX_BODY_CHARS is cut and reported', () => {
    const body = `${'a'.repeat(MAX_BODY_CHARS - 5)}\n\n${'b'.repeat(50)}`
    const p = plan(file([merged({ type: 'event', name: 'Kessler blackout', body })]))
    assert.equal(p.creates[0]?.input.body, 'a'.repeat(MAX_BODY_CHARS - 5))
    assert.ok(p.notes.some((n) => n.includes('body cut')))
  })

  test('relations resolve against the file, then existing entities; unresolved and self-references are skipped', () => {
    const p = plan(file(
      [merged({ type: 'character', name: 'Odalys Brann', aliases: ['Brann the Sergeant'] }), merged({ type: 'faction', name: 'Meridian Salvage Combine' })],
      [
        { from: 'Odalys Brann', to: 'Meridian Salvage Combine', kind: 'member of', note: null },
        { from: 'brann the sergeant', to: 'Meridian Salvage Combine', kind: 'member of', note: null }, // duplicate edge
        { from: 'Odalys Brann', to: 'Shield array', kind: 'repairs', note: null },
        { from: 'Odalys Brann', to: 'Nobody Known', kind: 'enemy of', note: null },
        { from: 'Odalys Brann', to: 'Brann the Sergeant', kind: 'is', note: null },
      ],
    ))
    assert.equal(p.relations.length, 2)
    assert.deepEqual(p.relations[0]?.from, { kind: 'create', index: 0 })
    assert.deepEqual(p.relations[0]?.to, { kind: 'create', index: 1 })
    assert.deepEqual(p.relations[1]?.to, { kind: 'existing', id: SHIELDS.id })
    assert.equal(p.skipped.filter((s) => s.reason.startsWith('relation endpoint not found')).length, 1)
    assert.equal(p.skipped.filter((s) => s.reason === 'relation points to itself').length, 1)
  })

  test('two incoming entities matching the same existing one give one update', () => {
    const p = plan(file([
      merged({ type: 'character', name: 'Kik', attributes: { mood: 'tense' } }),
      merged({ type: 'character', name: 'Blink', aliases: ['K.'] }),
    ]))
    assert.equal(p.updates.length, 1)
    assert.deepEqual(p.updates[0]?.changes, ['attributes +1', 'aliases +1'])
    assert.equal(p.updates[0]?.input.attributes.mood, 'tense')
    assert.deepEqual(p.updates[0]?.input.aliases, ['Blink', 'K.'])
  })

  test('result and summary line', () => {
    const p = plan(file([merged({ type: 'character', name: 'Kik', attributes: { status: 'Dead' } }), merged({ type: 'creature', name: 'Pale Chorus' })]))
    const result = planResult(p, ['pale-chorus'])
    assert.equal(formatSummary(result), 'created 1 · updated 0 · relations 0 · skipped 1 (conflicts kept: 1)')
    assert.deepEqual(result.lines, ['+ creature    Pale Chorus  /entry/pale-chorus'])
  })

  test('attributes from the model are stored as strings', () => {
    const parsed = parseExtraction(JSON.stringify({ entities: [{ type: 'creature', name: 'Pale Chorus', attributes: { age: 41, hostile: true } }] }))
    assert.ok(parsed.ok)
    const p = plan(mergeExtractions([parsed.data]))
    assert.deepEqual(p.creates[0]?.input.attributes, { age: '41', hostile: 'true' })
  })
})

describe('the sample stub', () => {
  test('is a valid extraction with at least 8 creates, 0 updates against the fixtures', () => {
    const text = readFileSync(path.join(process.cwd(), 'samples', 'sample-extraction.stub.json'), 'utf8')
    const parsed = parseExtraction(text)
    assert.ok(parsed.ok, parsed.ok ? '' : parsed.error)
    const p = plan(mergeExtractions([parsed.data]))
    assert.ok(p.creates.length >= 8)
    assert.equal(p.updates.length, 0)
    assert.ok(p.relations.length >= 7)
    assert.ok(!p.notes.some((n) => n.includes('possible duplicate')))
  })

  test('re-planning the same stub with the creates already present gives updates without changes', () => {
    const parsed = parseExtraction(readFileSync(path.join(process.cwd(), 'samples', 'sample-extraction.stub.json'), 'utf8'))
    assert.ok(parsed.ok)
    const m = mergeExtractions([parsed.data])
    const first = plan(m)
    const created = first.creates.map((c, i) => entityRow({ id: 100 + i, ...c.input }))
    const all = [...EXISTING, ...created]
    const again = planImport(all.map(indexRow), new Map(all.map((e) => [e.id, e])), m, 'zz-sample.txt')
    assert.equal(again.creates.length, 0)
    assert.equal(again.updates.length, 0)
  })
})

