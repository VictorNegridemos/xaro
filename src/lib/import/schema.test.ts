import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseExtraction, stripFence } from './schema'

const entity = (over: Record<string, unknown> = {}) => ({ type: 'character', name: 'Odalys Brann', ...over })

test('a minimal extraction is accepted and defaults are filled', () => {
  const parsed = parseExtraction(JSON.stringify({ entities: [entity()] }))
  assert.ok(parsed.ok)
  assert.deepEqual(parsed.data, {
    entities: [{ existingId: null, type: 'character', name: 'Odalys Brann', aliases: [], summary: '', body: '', attributes: {} }],
    relations: [],
  })
})

test('attributes: numbers and booleans become strings', () => {
  const parsed = parseExtraction(JSON.stringify({ entities: [entity({ attributes: { age: 41, hostile: true, rank: ' sergeant ' } })] }))
  assert.ok(parsed.ok)
  assert.deepEqual(parsed.data.entities[0]?.attributes, { age: '41', hostile: 'true', rank: 'sergeant' })
})

test('relation kind is lower-cased and trimmed', () => {
  const parsed = parseExtraction(JSON.stringify({ entities: [], relations: [{ from: 'A', to: 'B', kind: ' Member Of ' }] }))
  assert.ok(parsed.ok)
  assert.deepEqual(parsed.data.relations[0], { from: 'A', to: 'B', kind: 'member of', note: null })
})

test('reject cases', () => {
  const bad: Array<[string, unknown]> = [
    ['unknown type', { entities: [entity({ type: 'ship' })] }],
    ['empty name', { entities: [entity({ name: '  ' })] }],
    ['unknown entity field', { entities: [entity({ slug: 'x' })] }],
    ['unknown top-level field', { entities: [], extra: 1 }],
    ['attribute key not snake case', { entities: [entity({ attributes: { Rank: 'x' } })] }],
    ['attribute value object', { entities: [entity({ attributes: { rank: { a: 1 } } })] }],
    ['attribute value too long', { entities: [entity({ attributes: { rank: 'x'.repeat(501) } })] }],
    ['existingId not positive', { entities: [entity({ existingId: 0 })] }],
    ['too many aliases', { entities: [entity({ aliases: Array.from({ length: 21 }, (_, i) => `a${i}`) })] }],
    ['body too long', { entities: [entity({ body: 'x'.repeat(20_001) })] }],
    ['missing entities', { relations: [] }],
    ['relation without kind', { entities: [], relations: [{ from: 'A', to: 'B' }] }],
    ['not an object', [1, 2]],
  ]
  for (const [label, value] of bad) {
    const parsed = parseExtraction(JSON.stringify(value))
    assert.equal(parsed.ok, false, label)
    if (!parsed.ok) assert.match(parsed.error, /does not match/, label)
  }
})

test('invalid JSON gives a parse error text', () => {
  const parsed = parseExtraction('Here is the JSON you asked for: {')
  assert.equal(parsed.ok, false)
  if (!parsed.ok) assert.match(parsed.error, /not valid JSON/)
})

test('one leading ```json fence and its trailing fence are stripped', () => {
  assert.equal(stripFence('```json\n{"entities":[]}\n```'), '{"entities":[]}')
  assert.equal(stripFence('```\n{"entities":[]}\n```'), '{"entities":[]}')
  assert.equal(stripFence('  {"entities":[]}  '), '{"entities":[]}')
  assert.ok(parseExtraction('```json\r\n{"entities":[]}\r\n```').ok)
})
