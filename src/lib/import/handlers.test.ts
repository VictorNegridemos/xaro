// POST /api/import and DELETE /api/import/[id] handlers, called directly with a Request. Auth and the
// data layer are doubles; the auth double mirrors requireApiAuth (same-origin check, then the session).
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import type { ImportSourceSummary, ImportStatus } from '../data/types'
import { createDeleteHandler, createUploadHandler } from './handlers'
import { MAX_UPLOAD_CONTENT_BYTES, checkUpload } from './upload-schema'

const ORIGIN = 'http://localhost:3103'

function auth(loggedIn: boolean) {
  return async (request: Request): Promise<Response | null> => {
    const origin = request.headers.get('origin')
    if (!origin || new URL(origin).host !== new URL(request.url).host) return Response.json({ error: 'bad_origin' }, { status: 403 })
    return loggedIn ? null : Response.json({ error: 'unauthorized' }, { status: 401 })
  }
}

function summary(over: Partial<ImportSourceSummary> = {}): ImportSourceSummary {
  return {
    id: 1, filename: 'zz-verify-upload-a.txt', contentHash: 'a'.repeat(64), byteSize: 5, origin: 'upload', status: 'pending',
    error: null, result: null, attempts: 0, createdAt: new Date('2026-11-24T10:00:00Z'), startedAt: null, processedAt: null, ...over,
  }
}

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}/api/import`, {
    method: 'POST',
    headers: { origin: ORIGIN, 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

function uploadHandler(loggedIn = true, created = true) {
  const enqueued: Array<{ filename: string; content: string; origin: string }> = []
  let revalidated = 0
  const handler = createUploadHandler({
    requireAuth: auth(loggedIn),
    enqueue: async (input) => {
      enqueued.push(input)
      return { source: summary({ filename: input.filename, status: created ? 'pending' : 'done' }), created }
    },
    revalidate: () => { revalidated += 1 },
  })
  return { handler, enqueued, revalidated: () => revalidated }
}

describe('POST /api/import', () => {
  test('no session: 401 and the data layer is not called', async () => {
    const h = uploadHandler(false)
    const response = await h.handler(post({ filename: 'a.txt', content: 'x' }))
    assert.equal(response.status, 401)
    assert.equal(h.enqueued.length, 0)
  })

  test('foreign Origin: 403', async () => {
    const h = uploadHandler(true)
    assert.equal((await h.handler(post({ filename: 'a.txt', content: 'x' }, { origin: 'https://evil.example' }))).status, 403)
    assert.equal(h.enqueued.length, 0)
  })

  test('new file: 201 created, stored with origin upload and normalised newlines', async () => {
    const h = uploadHandler(true, true)
    const response = await h.handler(post({ filename: 'zz-verify-upload-a.txt', content: 'one\r\ntwo' }))
    assert.equal(response.status, 201)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    const data = await response.json() as { created: boolean; source: { filename: string } }
    assert.equal(data.created, true)
    assert.equal(data.source.filename, 'zz-verify-upload-a.txt')
    assert.deepEqual(h.enqueued, [{ filename: 'zz-verify-upload-a.txt', content: 'one\ntwo', origin: 'upload' }])
    assert.equal(h.revalidated(), 1)
  })

  test('known hash: 200 with the existing row', async () => {
    const h = uploadHandler(true, false)
    const response = await h.handler(post({ filename: 'zz-verify-upload-a.txt', content: 'x' }))
    assert.equal(response.status, 200)
    const data = await response.json() as { created: boolean; source: { status: string } }
    assert.equal(data.created, false)
    assert.equal(data.source.status, 'done')
  })

  test('wrong content type 415, invalid JSON 400, schema failure 400 with field errors', async () => {
    const h = uploadHandler()
    assert.equal((await h.handler(post('{}', { 'content-type': 'text/plain' }))).status, 415)
    assert.equal((await h.handler(post('{not json'))).status, 400)
    const bad = await h.handler(post({ filename: 'a.pdf', content: 'x' }))
    assert.equal(bad.status, 400)
    const data = await bad.json() as { error: string; fields: Record<string, string> }
    assert.equal(data.error, 'invalid_body')
    assert.match(data.fields.filename ?? '', /\.txt/)
    assert.equal((await h.handler(post({}))).status, 400)
    assert.equal(h.enqueued.length, 0)
  })

  test('a Content-Length above 1,500,000 gives 413 before the body is read', async () => {
    const h = uploadHandler()
    const response = await h.handler(post({ filename: 'a.txt', content: 'x' }, { 'content-length': '1500001' }))
    assert.equal(response.status, 413)
  })

  test('content above 1 MiB after normalisation gives 413 file_too_large', async () => {
    const h = uploadHandler()
    const response = await h.handler(post({ filename: 'a.txt', content: 'é'.repeat(MAX_UPLOAD_CONTENT_BYTES / 2 + 1) }))
    assert.equal(response.status, 413)
    assert.equal((await response.json() as { error: string }).error, 'file_too_large')
  })

  test('database down: 503', async () => {
    const handler = createUploadHandler({
      requireAuth: auth(true), enqueue: async () => { throw new Error('connect ECONNREFUSED') }, revalidate: () => {},
    })
    assert.equal((await handler(post({ filename: 'a.txt', content: 'x' }))).status, 503)
  })
})

describe('upload validation', () => {
  test('filename rules', () => {
    const ok = (filename: string) => checkUpload({ filename, content: 'x' }).ok
    assert.ok(ok('log.txt'))
    assert.ok(ok('LOG.TXT'))
    assert.ok(!ok('.txt'))
    assert.ok(!ok('log.md'))
    assert.ok(!ok('dir/log.txt'))
    assert.ok(!ok('dir\\log.txt'))
    assert.ok(!ok('lo\u0007g.txt'))
    assert.ok(!ok(' log.txt'))
    assert.ok(!ok(`${'a'.repeat(117)}.txt`))
    assert.ok(ok(`${'a'.repeat(116)}.txt`))
  })

  test('content rules', () => {
    assert.ok(!checkUpload({ filename: 'a.txt', content: '  \n ' }).ok)
    assert.ok(!checkUpload({ filename: 'a.txt', content: 'a\u0000b' }).ok)
    assert.ok(!checkUpload({ filename: 'a.txt', content: 5 }).ok)
    assert.ok(!checkUpload({ filename: 'a.txt', content: 'x', extra: true }).ok)
    assert.ok(checkUpload({ filename: 'a.txt', content: 'x'.repeat(MAX_UPLOAD_CONTENT_BYTES) }).ok)
    // CRLF counts after normalisation
    assert.ok(checkUpload({ filename: 'a.txt', content: 'a\r\n'.repeat(MAX_UPLOAD_CONTENT_BYTES / 2) }).ok)
    assert.ok(!checkUpload({ filename: 'a.txt', content: 'a\r\n'.repeat(MAX_UPLOAD_CONTENT_BYTES / 2 + 1) }).ok)
  })
})

describe('DELETE /api/import/[id]', () => {
  function deleteHandler(rows: Map<number, ImportStatus>, loggedIn = true) {
    return createDeleteHandler({
      requireAuth: auth(loggedIn),
      deleteQueued: async (id) => {
        const status = rows.get(id)
        if (status === 'pending' || status === 'failed') {
          rows.delete(id)
          return true
        }
        return false
      },
      statusOf: async (id) => rows.get(id) ?? null,
      revalidate: () => {},
    })
  }
  const del = (id: string) => new Request(`${ORIGIN}/api/import/${id}`, { method: 'DELETE', headers: { origin: ORIGIN } })

  test('pending and failed rows are removed; processing and done give 409; unknown 404; bad id 404', async () => {
    const rows = new Map<number, ImportStatus>([[1, 'pending'], [2, 'failed'], [3, 'processing'], [4, 'done']])
    const handler = deleteHandler(rows)
    assert.equal((await handler(del('1'), '1')).status, 200)
    assert.equal((await handler(del('2'), '2')).status, 200)
    const busy = await handler(del('3'), '3')
    assert.equal(busy.status, 409)
    assert.equal((await busy.json() as { status: string }).status, 'processing')
    assert.equal((await handler(del('4'), '4')).status, 409)
    assert.equal((await handler(del('99'), '99')).status, 404)
    assert.equal((await handler(del('abc'), 'abc')).status, 404)
    assert.equal((await handler(del('0'), '0')).status, 404)
    assert.deepEqual([...rows.keys()], [3, 4])
  })

  test('no session: 401, nothing removed', async () => {
    const rows = new Map<number, ImportStatus>([[1, 'pending']])
    assert.equal((await deleteHandler(rows, false)(del('1'), '1')).status, 401)
    assert.equal(rows.size, 1)
  })
})
