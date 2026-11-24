// POST /api/entries, PUT and DELETE /api/entries/[id], called directly with a Request (plan 9.3 task 1).
// The auth double mirrors requireApiAuth: same-origin check, then the session.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import type { EntityInput } from '../data/types'
import { createEntryHandlers } from './handlers'

const ORIGIN = 'http://localhost:3000'
const valid: EntityInput = { type: 'record', name: 'ZZ-VERIFY handler', aliases: [], summary: '', body: 'text', attributes: { zz_verify: '0' } }

function auth(loggedIn: boolean) {
  return async (request: Request): Promise<Response | null> => {
    const origin = request.headers.get('origin')
    if (!origin || new URL(origin).host !== new URL(request.url).host) return Response.json({ error: 'bad_origin' }, { status: 403 })
    return loggedIn ? null : Response.json({ error: 'unauthorized' }, { status: 401 })
  }
}

function setup(loggedIn = true, existing: number[] = [7]) {
  const calls: string[] = []
  let revalidated = 0
  const handlers = createEntryHandlers({
    requireAuth: auth(loggedIn),
    create: async (input) => { calls.push(`create ${input.name}`); return { id: 99, slug: 'zz-verify-handler' } },
    update: async (id, input) => {
      calls.push(`update ${id} ${input.name}`)
      return existing.includes(id) ? { id, slug: 'zz-verify-handler' } : null
    },
    remove: async (id) => { calls.push(`remove ${id}`); return existing.includes(id) },
    revalidate: () => { revalidated += 1 },
  })
  return { handlers, calls, revalidated: () => revalidated }
}

function request(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}${path}`, {
    method,
    headers: { origin: ORIGIN, 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  })
}

describe('entry handlers: auth first', () => {
  test('no session: 401 for POST, PUT and DELETE and the data layer is not called', async () => {
    const h = setup(false)
    assert.equal((await h.handlers.POST(request('POST', '/api/entries', valid))).status, 401)
    assert.equal((await h.handlers.PUT(request('PUT', '/api/entries/7', valid), '7')).status, 401)
    assert.equal((await h.handlers.DELETE(request('DELETE', '/api/entries/7'), '7')).status, 401)
    assert.deepEqual(h.calls, [])
    assert.equal(h.revalidated(), 0)
  })

  test('a foreign Origin gives 403 even with a session', async () => {
    const h = setup(true)
    const evil = { origin: 'https://evil.example' }
    assert.equal((await h.handlers.POST(request('POST', '/api/entries', valid, evil))).status, 403)
    assert.equal((await h.handlers.PUT(request('PUT', '/api/entries/7', valid, evil), '7')).status, 403)
    assert.equal((await h.handlers.DELETE(request('DELETE', '/api/entries/7', undefined, evil), '7')).status, 403)
    assert.deepEqual(h.calls, [])
  })
})

describe('entry handlers: body', () => {
  test('a wrong content type gives 415', async () => {
    const h = setup()
    const response = await h.handlers.POST(request('POST', '/api/entries', valid, { 'content-type': 'text/plain' }))
    assert.equal(response.status, 415)
    assert.equal((await h.handlers.PUT(request('PUT', '/api/entries/7', valid, { 'content-type': 'text/plain' }), '7')).status, 415)
    assert.deepEqual(h.calls, [])
  })

  test('invalid JSON gives 400', async () => {
    const h = setup()
    const response = await h.handlers.POST(request('POST', '/api/entries', '{"name": '))
    assert.equal(response.status, 400)
    assert.equal(((await response.json()) as { error: string }).error, 'invalid_json')
  })

  test('a schema failure gives 400 with field errors', async () => {
    const h = setup()
    const response = await h.handlers.POST(request('POST', '/api/entries', { ...valid, name: ' ', slug: 'x' }))
    assert.equal(response.status, 400)
    const data = (await response.json()) as { error: string; fields: Record<string, string> }
    assert.equal(data.error, 'invalid_body')
    assert.ok(data.fields._form?.includes('slug'))
    const put = await h.handlers.PUT(request('PUT', '/api/entries/7', { ...valid, attributes: { Rank: 'x' } }), '7')
    assert.equal(put.status, 400)
    assert.ok(((await put.json()) as { fields: Record<string, string> }).fields.attributes)
    assert.deepEqual(h.calls, [])
  })
})

describe('entry handlers: create, update, delete', () => {
  test('POST: 201 with id and slug, revalidates', async () => {
    const h = setup()
    const response = await h.handlers.POST(request('POST', '/api/entries', valid))
    assert.equal(response.status, 201)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.deepEqual(await response.json(), { id: 99, slug: 'zz-verify-handler' })
    assert.equal(h.revalidated(), 1)
  })

  test('PUT: 200 on a known id, 404 on an unknown id', async () => {
    const h = setup()
    assert.equal((await h.handlers.PUT(request('PUT', '/api/entries/7', valid), '7')).status, 200)
    assert.equal((await h.handlers.PUT(request('PUT', '/api/entries/8', valid), '8')).status, 404)
    assert.equal(h.revalidated(), 1)
  })

  test('DELETE: 200 on a known id, 404 on an unknown id', async () => {
    const h = setup()
    const ok = await h.handlers.DELETE(request('DELETE', '/api/entries/7'), '7')
    assert.equal(ok.status, 200)
    assert.deepEqual(await ok.json(), { deleted: true, id: 7 })
    assert.equal((await h.handlers.DELETE(request('DELETE', '/api/entries/8'), '8')).status, 404)
    assert.equal(h.revalidated(), 1)
  })

  test('a non-numeric or out-of-range id gives 404, never 500, and the data layer is not called', async () => {
    const h = setup()
    for (const id of ['abc', '0', '-1', '1.5', '1234567890', '']) {
      assert.equal((await h.handlers.PUT(request('PUT', `/api/entries/${id}`, valid), id)).status, 404, `PUT ${id}`)
      assert.equal((await h.handlers.DELETE(request('DELETE', `/api/entries/${id}`), id)).status, 404, `DELETE ${id}`)
    }
    assert.deepEqual(h.calls, [])
  })

  test('a database failure gives 503, not a stack trace', async () => {
    const handlers = createEntryHandlers({
      requireAuth: auth(true),
      create: async () => { throw new Error('connection refused') },
      update: async () => { throw new Error('x') },
      remove: async () => { throw new Error('x') },
      revalidate: () => {},
    })
    const response = await handlers.POST(request('POST', '/api/entries', valid))
    assert.equal(response.status, 503)
    assert.equal(((await response.json()) as { error: string }).error, 'database_unavailable')
  })
})
