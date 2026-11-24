import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'node:test'
import { sealData } from 'iron-session'
import { NextRequest } from 'next/server'
import { config as proxyConfig, proxy } from '../../proxy'
import { passwordFingerprint } from './config'
import { SESSION_COOKIE, SESSION_TTL_SECONDS } from './session-options'

const SECRET = '9'.repeat(64)
const HASH_A = `scrypt:32768:8:1:${'a1'.repeat(16)}:${'b2'.repeat(64)}`
const HASH_B = `scrypt:32768:8:1:${'c3'.repeat(16)}:${'d4'.repeat(64)}`

const request = (path: string, cookie?: string) =>
  new NextRequest(`http://localhost:3000${path}`, { headers: cookie ? { cookie: `${SESSION_COOKIE}=${cookie}` } : {} })
const seal = (data: object) => sealData(data, { password: SECRET, ttl: SESSION_TTL_SECONDS })

let saved: { secret: string | undefined; hash: string | undefined }
let savedError: typeof console.error
beforeEach(() => {
  saved = { secret: process.env.SESSION_SECRET, hash: process.env.AUTH_PASSWORD_HASH }
  process.env.SESSION_SECRET = SECRET
  process.env.AUTH_PASSWORD_HASH = HASH_A
  savedError = console.error
  console.error = () => {}
})
afterEach(() => {
  console.error = savedError
  if (saved.secret === undefined) delete process.env.SESSION_SECRET
  else process.env.SESSION_SECRET = saved.secret
  if (saved.hash === undefined) delete process.env.AUTH_PASSWORD_HASH
  else process.env.AUTH_PASSWORD_HASH = saved.hash
})

const isRedirectToLogin = (response: Response, next: string) => {
  assert.ok(response.status === 307 || response.status === 308, `status ${response.status}`)
  const location = new URL(response.headers.get('location') ?? '')
  assert.equal(location.pathname, '/login')
  assert.equal(location.searchParams.get('next'), next)
}

test('proxy matcher covers exactly the protected pages, never an API route', () => {
  assert.deepEqual(proxyConfig.matcher, ['/import/:path*', '/entry/new', '/entry/:slug/edit'])
})

test('proxy: logged out, tampered, or sealed under another password hash redirects to /login?next=<path>', async () => {
  isRedirectToLogin(await proxy(request('/import')), '/import')
  isRedirectToLogin(await proxy(request('/entry/kik/edit', 'garbage')), '/entry/kik/edit')
  const old = await seal({ isLoggedIn: true, at: 1, pw: passwordFingerprint(HASH_B) })
  isRedirectToLogin(await proxy(request('/entry/new', old)), '/entry/new')
  const noPw = await seal({ isLoggedIn: true, at: 1 })
  isRedirectToLogin(await proxy(request('/import', noPw)), '/import')
})

test('proxy: a valid session passes through; without configuration it never does', async () => {
  const valid = await seal({ isLoggedIn: true, at: 1, pw: passwordFingerprint(HASH_A) })
  const response = await proxy(request('/import', valid))
  assert.equal(response.headers.get('location'), null)
  assert.equal(response.headers.get('x-middleware-next'), '1')

  delete process.env.SESSION_SECRET
  isRedirectToLogin(await proxy(request('/import', valid)), '/import')
})
