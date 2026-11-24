import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'node:test'
import { sealData, type CookieStore } from 'iron-session'
import { getAuthConfig, passwordFingerprint } from './config'
import { handleLogin, type LoginDeps } from './login-handler'
import {
  SESSION_COOKIE, SESSION_TTL_SECONDS, isLoggedIn, isLoggedInWith, requireApiAuth, sessionOptions, startSessionWith,
} from './session'

const SECRET = 'f'.repeat(64)
const HASH_A = `scrypt:32768:8:1:${'a1'.repeat(16)}:${'b2'.repeat(64)}`
const HASH_B = `scrypt:32768:8:1:${'c3'.repeat(16)}:${'d4'.repeat(64)}`

interface Jar extends CookieStore {
  values: Map<string, string>
  options: Map<string, Record<string, unknown>>
}
function jar(): Jar {
  const values = new Map<string, string>()
  const options = new Map<string, Record<string, unknown>>()
  return {
    values,
    options,
    get: (name) => (values.has(name) ? { name, value: values.get(name) ?? '' } : undefined),
    set: (name, value, cookie) => {
      values.set(name, value)
      options.set(name, { ...cookie })
    },
  }
}

const sameOriginPost = (body?: string, headers: Record<string, string> = {}) => new Request('http://localhost:3000/api/x', {
  method: 'POST',
  headers: { origin: 'http://localhost:3000', host: 'localhost:3000', 'content-type': 'application/json', ...headers },
  body,
})

interface Calls { register: number; clear: number; verify: number; start: number }
function fakeDeps(overrides: Partial<LoginDeps> = {}): { deps: LoginDeps; calls: Calls } {
  const calls: Calls = { register: 0, clear: 0, verify: 0, start: 0 }
  const deps: LoginDeps = {
    registerAttempt: async () => { calls.register += 1; return { failures: 1, retryAfter: 900 } },
    clearAttempts: async () => { calls.clear += 1 },
    verifyPassword: async (password) => { calls.verify += 1; return password === 'right' },
    startSession: async () => { calls.start += 1 },
    ...overrides,
  }
  const counted = { ...deps }
  if (overrides.registerAttempt) counted.registerAttempt = async (bucket) => { calls.register += 1; return overrides.registerAttempt!(bucket) }
  return { deps: counted, calls }
}

let savedEnv: { secret: string | undefined; hash: string | undefined }
let savedError: typeof console.error
beforeEach(() => {
  savedEnv = { secret: process.env.SESSION_SECRET, hash: process.env.AUTH_PASSWORD_HASH }
  process.env.SESSION_SECRET = SECRET
  process.env.AUTH_PASSWORD_HASH = HASH_A
  savedError = console.error
  console.error = () => {} // the "not configured" notice is expected here
})
afterEach(() => {
  console.error = savedError
  if (savedEnv.secret === undefined) delete process.env.SESSION_SECRET
  else process.env.SESSION_SECRET = savedEnv.secret
  if (savedEnv.hash === undefined) delete process.env.AUTH_PASSWORD_HASH
  else process.env.AUTH_PASSWORD_HASH = savedEnv.hash
})

test('getAuthConfig: ok with both variables; reads the environment on every call', () => {
  const config = getAuthConfig()
  assert.equal(config.ok, true)
  assert.ok(config.ok && config.pw === passwordFingerprint(HASH_A) && /^[0-9a-f]{16}$/.test(config.pw))
  process.env.AUTH_PASSWORD_HASH = HASH_B
  const changed = getAuthConfig()
  assert.ok(changed.ok && changed.pw === passwordFingerprint(HASH_B) && changed.pw !== passwordFingerprint(HASH_A))
})

test('session options: xaro_session, 30 days, httpOnly, SameSite=Lax, path /, Secure only in production', () => {
  const options = sessionOptions(SECRET)
  assert.equal(options.cookieName, 'xaro_session')
  assert.equal(SESSION_COOKIE, 'xaro_session')
  assert.equal(options.ttl, 2_592_000)
  assert.equal(SESSION_TTL_SECONDS, 2_592_000)
  assert.deepEqual(options.cookieOptions, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' })
})

test('a started session is recognised; the cookie is encrypted and carries the 30-day lifetime', async () => {
  const store = jar()
  assert.equal(await isLoggedInWith(store), false, 'no cookie')
  await startSessionWith(store)
  const sealed = store.values.get(SESSION_COOKIE) ?? ''
  assert.ok(sealed.length > 50)
  assert.ok(!sealed.includes('isLoggedIn') && !sealed.includes(passwordFingerprint(HASH_A)))
  const cookie = store.options.get(SESSION_COOKIE) ?? {}
  assert.equal(cookie.httpOnly, true)
  assert.equal(cookie.sameSite, 'lax')
  assert.equal(cookie.path, '/')
  assert.ok(typeof cookie.maxAge === 'number' && Math.abs(cookie.maxAge - 2_592_000) <= 60)
  assert.equal(await isLoggedInWith(store), true)
})

test('pw check: a session sealed under password hash A is rejected under hash B and accepted again under A', async () => {
  const store = jar()
  await startSessionWith(store)
  assert.equal(await isLoggedInWith(store), true)
  process.env.AUTH_PASSWORD_HASH = HASH_B
  assert.equal(await isLoggedInWith(store), false)
  process.env.AUTH_PASSWORD_HASH = HASH_A
  assert.equal(await isLoggedInWith(store), true)
})

test('a session without pw, a tampered cookie, and a cookie sealed with another secret are all logged out', async () => {
  const withoutPw = jar()
  withoutPw.values.set(SESSION_COOKIE, await sealData({ isLoggedIn: true, at: 1 }, { password: SECRET, ttl: SESSION_TTL_SECONDS }))
  assert.equal(await isLoggedInWith(withoutPw), false)

  const notLoggedIn = jar()
  notLoggedIn.values.set(SESSION_COOKIE, await sealData({ pw: passwordFingerprint(HASH_A) }, { password: SECRET, ttl: SESSION_TTL_SECONDS }))
  assert.equal(await isLoggedInWith(notLoggedIn), false)

  const tampered = jar()
  await startSessionWith(tampered)
  const value = tampered.values.get(SESSION_COOKIE) ?? ''
  const middle = Math.floor(value.length / 2)
  tampered.values.set(SESSION_COOKIE, value.slice(0, middle) + (value[middle] === 'A' ? 'B' : 'A') + value.slice(middle + 1))
  assert.equal(await isLoggedInWith(tampered), false)

  const garbage = jar()
  garbage.values.set(SESSION_COOKIE, 'not-a-seal')
  assert.equal(await isLoggedInWith(garbage), false)

  const otherSecret = jar()
  await startSessionWith(otherSecret)
  process.env.SESSION_SECRET = 'e'.repeat(64)
  assert.equal(await isLoggedInWith(otherSecret), false)
})

for (const variable of ['SESSION_SECRET', 'AUTH_PASSWORD_HASH'] as const) {
  test(`fail closed without ${variable}: config not ok, isLoggedIn false, requireApiAuth 401, login 503`, async () => {
    const store = jar()
    await startSessionWith(store) // a perfectly valid cookie from before the variable disappeared
    delete process.env[variable]

    const config = getAuthConfig()
    assert.equal(config.ok, false)
    assert.ok(!config.ok && config.reason.includes(variable))
    assert.equal(await isLoggedIn(), false)
    assert.equal(await isLoggedInWith(store), false, 'a valid cookie is not honoured either')
    await assert.rejects(startSessionWith(jar()))

    const denied = await requireApiAuth(sameOriginPost('{}'))
    assert.equal(denied?.status, 401)
    assert.deepEqual(await denied?.json(), { error: 'unauthorized' })

    const { deps, calls } = fakeDeps()
    const login = await handleLogin(sameOriginPost(JSON.stringify({ password: 'right' })), deps)
    assert.equal(login.status, 503)
    assert.deepEqual(await login.json(), { error: 'auth_not_configured' })
    assert.deepEqual(calls, { register: 0, clear: 0, verify: 0, start: 0 })
  })
}

test('fail closed with a short secret or a malformed hash', async () => {
  process.env.SESSION_SECRET = 'x'.repeat(31)
  assert.equal(getAuthConfig().ok, false)
  assert.equal(await isLoggedIn(), false)
  process.env.SESSION_SECRET = SECRET
  process.env.AUTH_PASSWORD_HASH = HASH_A.replaceAll(':', '$')
  assert.equal(getAuthConfig().ok, false)
  assert.equal(await isLoggedIn(), false)
  assert.equal((await handleLogin(sameOriginPost(JSON.stringify({ password: 'right' })), fakeDeps().deps)).status, 503)
})

test('requireApiAuth: 403 bad_origin before anything else; 401 without a session', async () => {
  const foreign = await requireApiAuth(new Request('http://localhost:3000/api/x', {
    method: 'POST', headers: { origin: 'https://evil.example', host: 'localhost:3000' },
  }))
  assert.equal(foreign?.status, 403)
  assert.deepEqual(await foreign?.json(), { error: 'bad_origin' })
  const noOrigin = await requireApiAuth(new Request('http://localhost:3000/api/x', { method: 'POST', headers: { host: 'localhost:3000' } }))
  assert.equal(noOrigin?.status, 403)
  // Outside a request there is no cookie store: that must read as "logged out", not as an exception.
  assert.equal((await requireApiAuth(sameOriginPost('{}')))?.status, 401)
})

test('login: malformed bodies are rejected without a throttle write and without hashing', async () => {
  const cases: Array<{ name: string; request: Request; status: number }> = [
    { name: 'oversized password', request: sameOriginPost(JSON.stringify({ password: 'p'.repeat(3000) })), status: 413 },
    { name: 'not JSON', request: sameOriginPost('password=wrong'), status: 400 },
    { name: 'empty body', request: sameOriginPost(''), status: 400 },
    { name: 'wrong content type', request: sameOriginPost('{"password":"wrong"}', { 'content-type': 'text/plain' }), status: 415 },
    { name: 'no password', request: sameOriginPost('{}'), status: 400 },
    { name: 'empty password', request: sameOriginPost('{"password":""}'), status: 400 },
    { name: 'password not a string', request: sameOriginPost('{"password":12345}'), status: 400 },
    { name: 'password over 200 characters', request: sameOriginPost(JSON.stringify({ password: 'p'.repeat(201) })), status: 400 },
    { name: 'next over 200 characters', request: sameOriginPost(JSON.stringify({ password: 'right', next: `/${'n'.repeat(200)}` })), status: 400 },
    { name: 'array body', request: sameOriginPost('["right"]'), status: 400 },
  ]
  for (const { name, request, status } of cases) {
    const { deps, calls } = fakeDeps()
    const response = await handleLogin(request, deps)
    assert.equal(response.status, status, name)
    assert.deepEqual(calls, { register: 0, clear: 0, verify: 0, start: 0 }, name)
  }
})

test('login: no Origin or a foreign Origin gives 403 before anything else', async () => {
  const { deps, calls } = fakeDeps()
  const noOrigin = new Request('http://localhost:3000/api/auth/login', {
    method: 'POST', headers: { host: 'localhost:3000', 'content-type': 'application/json' }, body: '{"password":"right"}',
  })
  assert.equal((await handleLogin(noOrigin, deps)).status, 403)
  assert.equal((await handleLogin(sameOriginPost('{"password":"right"}', { origin: 'https://evil.example' }), deps)).status, 403)
  assert.deepEqual(calls, { register: 0, clear: 0, verify: 0, start: 0 })
})

test('login: a wrong password is counted, then 401; no session', async () => {
  const { deps, calls } = fakeDeps()
  const response = await handleLogin(sameOriginPost('{"password":"wrong"}'), deps)
  assert.equal(response.status, 401)
  assert.deepEqual(await response.json(), { error: 'invalid_credentials' })
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.deepEqual(calls, { register: 1, clear: 0, verify: 1, start: 0 })
})

test('login: the sixth attempt gives 429 with Retry-After and the password is not checked, even a correct one', async () => {
  const { deps, calls } = fakeDeps({ registerAttempt: async () => ({ failures: 6, retryAfter: 777 }) })
  const response = await handleLogin(sameOriginPost('{"password":"right"}'), deps)
  assert.equal(response.status, 429)
  assert.equal(response.headers.get('retry-after'), '777')
  assert.deepEqual(await response.json(), { error: 'throttled', retryAfter: 777 })
  assert.deepEqual(calls, { register: 1, clear: 0, verify: 0, start: 0 })
})

test('login: the fifth attempt is still checked', async () => {
  const { deps, calls } = fakeDeps({ registerAttempt: async () => ({ failures: 5, retryAfter: 100 }) })
  assert.equal((await handleLogin(sameOriginPost('{"password":"right"}'), deps)).status, 200)
  assert.deepEqual(calls, { register: 1, clear: 1, verify: 1, start: 1 })
})

test('login: database down means 503 and no password check', async () => {
  const { deps, calls } = fakeDeps({ registerAttempt: async () => { throw new Error('connection refused') } })
  const response = await handleLogin(sameOriginPost('{"password":"right"}'), deps)
  assert.equal(response.status, 503)
  assert.deepEqual(await response.json(), { error: 'service_unavailable' })
  assert.deepEqual(calls, { register: 1, clear: 0, verify: 0, start: 0 })
})

test('login: the right password clears the bucket, starts the session and returns a safe next path', async () => {
  const ok = fakeDeps()
  const response = await handleLogin(sameOriginPost(JSON.stringify({ password: 'right', next: '/import' })), ok.deps)
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { ok: true, next: '/import' })
  assert.deepEqual(ok.calls, { register: 1, clear: 1, verify: 1, start: 1 })

  const evil = await handleLogin(sameOriginPost(JSON.stringify({ password: 'right', next: '//evil.example' })), fakeDeps().deps)
  assert.deepEqual(await evil.json(), { ok: true, next: '/' })
  const none = await handleLogin(sameOriginPost(JSON.stringify({ password: 'right' })), fakeDeps().deps)
  assert.deepEqual(await none.json(), { ok: true, next: '/' })

  const cleanupFails = fakeDeps({ clearAttempts: async () => { throw new Error('db hiccup') } })
  assert.equal((await handleLogin(sameOriginPost('{"password":"right"}'), cleanupFails.deps)).status, 200)
  assert.equal(cleanupFails.calls.start, 1)
})
