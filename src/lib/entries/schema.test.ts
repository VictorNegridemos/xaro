// The entry body schema (plan 9.3 task 1).
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { MAX_BODY_CHARS } from '../data/types'
import { checkEntry } from './schema'

const valid = { type: 'character', name: 'ZZ-VERIFY minimal', aliases: [], summary: '', body: '', attributes: {} }
const with_ = (over: Record<string, unknown>) => ({ ...valid, ...over })
const fieldsOf = (body: unknown) => {
  const result = checkEntry(body)
  assert.equal(result.ok, false, 'expected a rejection')
  return result.ok ? {} : result.fields
}

describe('entry schema', () => {
  test('a minimal valid entry is accepted and the name is trimmed', () => {
    const result = checkEntry(with_({ name: '  ZZ-VERIFY minimal  ', aliases: ['  Z  '] }))
    assert.ok(result.ok)
    if (result.ok) {
      assert.equal(result.input.name, 'ZZ-VERIFY minimal')
      assert.deepEqual(result.input.aliases, ['Z'])
    }
  })

  test('name empty, whitespace-only and 201 characters are rejected', () => {
    assert.ok(fieldsOf(with_({ name: '' })).name)
    assert.ok(fieldsOf(with_({ name: '   ' })).name)
    assert.ok(fieldsOf(with_({ name: 'a'.repeat(201) })).name)
    assert.ok(checkEntry(with_({ name: 'a'.repeat(200) })).ok)
  })

  test('an unknown type is rejected', () => {
    assert.ok(fieldsOf(with_({ type: 'spaceship' })).type)
  })

  test('31 aliases and an alias of 201 characters are rejected', () => {
    assert.ok(checkEntry(with_({ aliases: Array.from({ length: 30 }, (_, i) => `a${i}`) })).ok)
    assert.ok(fieldsOf(with_({ aliases: Array.from({ length: 31 }, (_, i) => `a${i}`) })).aliases)
    assert.ok(fieldsOf(with_({ aliases: ['a'.repeat(201)] })).aliases)
  })

  test('summary of 501 characters is rejected', () => {
    assert.ok(checkEntry(with_({ summary: 's'.repeat(500) })).ok)
    assert.ok(fieldsOf(with_({ summary: 's'.repeat(501) })).summary)
  })

  test('body of exactly MAX_BODY_CHARS is accepted, one more is rejected', () => {
    assert.ok(checkEntry(with_({ body: 'b'.repeat(MAX_BODY_CHARS) })).ok)
    assert.ok(fieldsOf(with_({ body: 'b'.repeat(MAX_BODY_CHARS + 1) })).body)
  })

  test('41 attributes are rejected, 40 accepted', () => {
    const attrs = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`k${i}`, 'v']))
    assert.ok(checkEntry(with_({ attributes: attrs(40) })).ok)
    assert.ok(fieldsOf(with_({ attributes: attrs(41) })).attributes)
  })

  test('attribute keys Rank, 1x and a 41-character key are rejected', () => {
    assert.ok(fieldsOf(with_({ attributes: { Rank: 'x' } })).attributes)
    assert.ok(fieldsOf(with_({ attributes: { '1x': 'x' } })).attributes)
    assert.ok(fieldsOf(with_({ attributes: { ['k'.repeat(41)]: 'x' } })).attributes)
    assert.ok(checkEntry(with_({ attributes: { ['k'.repeat(40)]: 'x', crew_rank: 'Captain' } })).ok)
  })

  test('a number or boolean attribute value is rejected', () => {
    assert.ok(fieldsOf(with_({ attributes: { rank: 3 } })).attributes)
    assert.ok(fieldsOf(with_({ attributes: { online: true } })).attributes)
    assert.ok(fieldsOf(with_({ attributes: { note: 'x'.repeat(1001) } })).attributes)
  })

  test('unknown top-level fields (slug, legacyTable, id) are rejected', () => {
    for (const key of ['slug', 'legacyTable', 'id']) {
      const fields = fieldsOf(with_({ [key]: key === 'id' ? 1 : 'x' }))
      assert.ok(fields._form?.includes(key), key)
    }
  })

  test('missing fields and a non-object body are rejected', () => {
    assert.ok(fieldsOf({ type: 'character', name: 'x' }).aliases)
    assert.ok(fieldsOf(null)._form)
    assert.ok(fieldsOf([])._form)
  })
})
