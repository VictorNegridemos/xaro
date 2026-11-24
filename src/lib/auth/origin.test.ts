import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkSameOrigin, safeNextPath } from './origin'

const post = (headers: Record<string, string>) => new Request('http://internal.invalid/api/x', { method: 'POST', headers })

test('safeNextPath keeps plain site paths', () => {
  for (const value of ['/', '/import', '/entry/new', '/entry/kik/edit', '/search?q=warp&type=record', '/entry/a-b_c']) {
    assert.equal(safeNextPath(value), value)
  }
  const longest = `/${'a'.repeat(199)}`
  assert.equal(safeNextPath(longest), longest)
})

test('safeNextPath turns everything else into "/"', () => {
  const bad: unknown[] = [
    undefined, null, 42, ['/import'], {}, '', 'import', 'https://evil.example/', '//evil.example', '/a//b',
    '/\\evil.example', '\\/evil.example', '/a\\b', '/a\nb', '/a\tb', '/a\u0000b', '/a\u007fb', '/a\u0085b',
    'javascript:alert(1)', ' /import', `/${'a'.repeat(200)}`, '/http://evil.example',
  ]
  for (const value of bad) assert.equal(safeNextPath(value), '/', JSON.stringify(value))
})

test('checkSameOrigin: Origin host must equal the request host', () => {
  assert.equal(checkSameOrigin(post({ origin: 'http://localhost:3000', host: 'localhost:3000' })), true)
  assert.equal(checkSameOrigin(post({ origin: 'https://xaro.example', host: 'xaro.example' })), true)
  assert.equal(checkSameOrigin(post({ origin: 'https://XARO.example', host: 'xaro.EXAMPLE' })), true)
  assert.equal(checkSameOrigin(post({ host: 'localhost:3000' })), false, 'no Origin header')
  assert.equal(checkSameOrigin(post({ origin: 'null', host: 'localhost:3000' })), false)
  assert.equal(checkSameOrigin(post({ origin: 'not a url', host: 'localhost:3000' })), false)
  assert.equal(checkSameOrigin(post({ origin: 'http://localhost:3001', host: 'localhost:3000' })), false, 'other port')
  assert.equal(checkSameOrigin(post({ origin: 'https://evil.example', host: 'xaro.example' })), false)
  assert.equal(checkSameOrigin(post({ origin: 'https://xaro.example.evil.example', host: 'xaro.example' })), false)
  assert.equal(checkSameOrigin(post({ origin: 'https://xaro.example' })), false, 'no host to compare with')
})

test('checkSameOrigin: x-forwarded-host wins over host', () => {
  assert.equal(checkSameOrigin(post({ origin: 'https://xaro.example', host: 'internal:3000', 'x-forwarded-host': 'xaro.example' })), true)
  assert.equal(checkSameOrigin(post({ origin: 'https://xaro.example', host: 'xaro.example', 'x-forwarded-host': 'other.example' })), false)
  assert.equal(checkSameOrigin(post({ origin: 'https://xaro.example', host: 'internal', 'x-forwarded-host': 'xaro.example, proxy.internal' })), true)
})

test('checkSameOrigin: Sec-Fetch-Site, when present, must be same-origin', () => {
  const base = { origin: 'https://xaro.example', host: 'xaro.example' }
  assert.equal(checkSameOrigin(post({ ...base, 'sec-fetch-site': 'same-origin' })), true)
  for (const value of ['same-site', 'cross-site', 'none', '']) {
    assert.equal(checkSameOrigin(post({ ...base, 'sec-fetch-site': value })), false, value)
  }
})
