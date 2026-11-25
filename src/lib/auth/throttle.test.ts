import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MAX_ATTEMPTS, bucketFor, clientIp, decideAttempt } from './throttle'

const request = (headers: Record<string, string> = {}) => new Request('http://localhost/api/auth/login', { method: 'POST', headers })

test('decideAttempt: five attempts per window are allowed, the sixth and later are refused', () => {
  assert.equal(MAX_ATTEMPTS, 5)
  for (let failures = 1; failures <= 5; failures += 1) {
    assert.deepEqual(decideAttempt({ failures, retryAfter: 900 }), { allowed: true })
  }
  assert.deepEqual(decideAttempt({ failures: 6, retryAfter: 512 }), { allowed: false, retryAfter: 512 })
  assert.deepEqual(decideAttempt({ failures: 60, retryAfter: 3 }), { allowed: false, retryAfter: 3 })
})

test('decideAttempt: Retry-After stays within 1 second and the window; nonsense fails closed', () => {
  assert.deepEqual(decideAttempt({ failures: 6, retryAfter: 0 }), { allowed: false, retryAfter: 1 })
  assert.deepEqual(decideAttempt({ failures: 6, retryAfter: -20 }), { allowed: false, retryAfter: 1 })
  assert.deepEqual(decideAttempt({ failures: 6, retryAfter: 5000 }), { allowed: false, retryAfter: 900 })
  assert.deepEqual(decideAttempt({ failures: 6, retryAfter: Number.NaN }), { allowed: false, retryAfter: 900 })
  assert.deepEqual(decideAttempt({ failures: Number.NaN, retryAfter: 10 }), { allowed: false, retryAfter: 900 })
  assert.deepEqual(decideAttempt({ failures: 0, retryAfter: 10 }), { allowed: false, retryAfter: 900 })
})

test('clientIp: x-real-ip, else the first x-forwarded-for entry, else "local"', () => {
  assert.equal(clientIp(request({ 'x-real-ip': '198.51.100.7', 'x-forwarded-for': '203.0.113.77' })), '198.51.100.7')
  assert.equal(clientIp(request({ 'x-forwarded-for': '203.0.113.77, 10.0.0.1' })), '203.0.113.77')
  assert.equal(clientIp(request()), 'local')
})

test('bucketFor: "ip:" + 32 hex, stable per IP and secret, never the raw IP', () => {
  const secret = 's'.repeat(64)
  const a = bucketFor(request({ 'x-forwarded-for': '203.0.113.77' }), secret)
  assert.match(a, /^ip:[0-9a-f]{32}$/)
  assert.ok(!a.includes('203.0.113.77'))
  assert.equal(a, bucketFor(request({ 'x-forwarded-for': '203.0.113.77' }), secret))
  assert.notEqual(a, bucketFor(request({ 'x-forwarded-for': '203.0.113.78' }), secret))
  assert.notEqual(a, bucketFor(request({ 'x-forwarded-for': '203.0.113.77' }), 't'.repeat(64)))
  assert.notEqual(a, bucketFor(request(), secret))
})
