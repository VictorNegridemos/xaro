// createEntity and updateEntity against a recording database double (drizzle's pg-proxy driver):
// every SQL statement is captured with its parameters; nothing reaches a real database (plan 9.3 task 1).
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { drizzle } from 'drizzle-orm/pg-proxy'
import type { Db } from '../db/client'
import * as schema from '../db/schema'
import { LEGACY_KEYS } from './legacy-keys'
import { createEntity, updateEntity } from './entities'
import type { EntityInput } from './types'

interface Statement { sql: string; params: unknown[] }

/** `taken` = slugs that already exist. INSERT/UPDATE ... RETURNING echo the slug they were given (or `stored`). */
function recordingDb(taken: string[] = [], stored = 'stored-slug') {
  const statements: Statement[] = []
  let nextId = 500
  const client = async (sqlText: string, params: unknown[]) => {
    statements.push({ sql: sqlText, params })
    const s = sqlText.toLowerCase()
    if (s.startsWith('select') && s.includes('"slug" =')) {
      return { rows: taken.includes(String(params[0])) ? [[1]] : [] }
    }
    if (s.startsWith('insert into "entities"')) {
      const slug = params.find((p) => typeof p === 'string' && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(p) && p !== 'character' && p !== 'ship_system' && p !== 'record')
      nextId += 1
      return { rows: [[nextId, slug]] }
    }
    if (s.startsWith('update "entities"')) return { rows: [[params[params.length - 1], stored]] }
    return { rows: [] }
  }
  const db = drizzle(client, { schema }) as unknown as Db
  return { db, statements }
}

const input = (over: Partial<EntityInput> = {}): EntityInput => ({
  type: 'character', name: 'ZZ-VERIFY Halvard Quist', aliases: ['H. Quist'], summary: 's', body: 'b', attributes: { rank: 'Ensign' }, ...over,
})

describe('updateEntity', () => {
  test('sets only type, name, aliases, summary, body, attributes', async () => {
    const { db, statements } = recordingDb()
    await updateEntity(42, input({ name: 'ZZ-VERIFY renamed' }), db)
    assert.equal(statements.length, 1)
    const sql = statements[0]?.sql ?? ''
    const set = sql.slice(sql.toLowerCase().indexOf(' set ') + 5, sql.toLowerCase().indexOf(' where '))
    const columns = [...set.matchAll(/"([a-z_]+)"\s*=/g)].map((m) => m[1]).sort()
    assert.deepEqual(columns, ['aliases', 'attributes', 'body', 'name', 'summary', 'type'])
    for (const forbidden of ['slug', 'legacy_table', 'legacy_id', 'source_id', 'created_at', 'search_vector', 'updated_at']) {
      assert.ok(!new RegExp(`"${forbidden}"\\s*=`).test(set), `${forbidden} is not set`)
    }
    assert.ok(statements[0]?.params.includes('ZZ-VERIFY renamed'))
  })

  test('renaming leaves the slug as it was', async () => {
    const { db } = recordingDb([], 'zz-verify-halvard-quist')
    const result = await updateEntity(42, input({ name: 'Something else entirely' }), db)
    assert.deepEqual(result, { id: 42, slug: 'zz-verify-halvard-quist' })
  })
})

describe('createEntity', () => {
  test('the slug comes from uniqueSlug(slugBase(name), type with dashes)', async () => {
    const { db, statements } = recordingDb()
    const result = await createEntity(input(), {}, db)
    assert.equal(result.slug, 'zz-verify-halvard-quist')
    const insert = statements.find((s) => s.sql.toLowerCase().startsWith('insert'))
    assert.ok(insert)
    assert.ok(!/"search_vector"/.test(insert.sql), 'search_vector is never written')
    for (const key of Object.values(LEGACY_KEYS)) assert.ok(!insert.params.includes(key), 'create never sets a legacy key')
  })

  test('a punctuation-only name of type ship_system gets ship-system', async () => {
    const { db } = recordingDb()
    assert.equal((await createEntity(input({ name: '?? !!', type: 'ship_system' }), {}, db)).slug, 'ship-system')
  })

  test('a second entry with the same name gets -2', async () => {
    const { db } = recordingDb(['zz-verify-halvard-quist'])
    assert.equal((await createEntity(input(), {}, db)).slug, 'zz-verify-halvard-quist-2')
  })

  test('the name "new" does not get the slug new', async () => {
    const { db, statements } = recordingDb()
    const result = await createEntity(input({ name: 'New' }), {}, db)
    assert.equal(result.slug, 'new-2')
    assert.ok(!statements.some((s) => s.sql.toLowerCase().startsWith('select') && s.params[0] === 'new'), 'the reserved slug is never even looked up')
  })
})
