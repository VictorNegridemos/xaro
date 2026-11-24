import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loginErrorMessage } from './messages'

test('login error line: wrong code, throttled with the wait time, not configured, faults', () => {
  assert.match(loginErrorMessage(401, { error: 'invalid_credentials' }), /ACCESS DENIED/)
  assert.match(loginErrorMessage(429, { error: 'throttled', retryAfter: 840 }), /Try again in 14 minutes\./)
  assert.match(loginErrorMessage(429, { error: 'throttled', retryAfter: 61 }), /in 2 minutes\./)
  assert.match(loginErrorMessage(429, { error: 'throttled', retryAfter: 45 }), /in 45 seconds\./)
  assert.match(loginErrorMessage(429, { error: 'throttled', retryAfter: 1 }), /in 1 second\./)
  assert.match(loginErrorMessage(429, null, '120'), /in 2 minutes\./)
  assert.match(loginErrorMessage(429, null, null), /Try again later\./)
  assert.match(loginErrorMessage(503, { error: 'auth_not_configured' }), /Authentication is not configured on this deployment/)
  assert.match(loginErrorMessage(503, { error: 'service_unavailable' }), /SYSTEM FAULT/)
  assert.match(loginErrorMessage(400, { error: 'invalid_body' }), /INPUT REJECTED/)
  assert.match(loginErrorMessage(413, null), /INPUT REJECTED/)
  assert.match(loginErrorMessage(0, null), /NO SIGNAL/)
  assert.match(loginErrorMessage(500, 'oops'), /SYSTEM FAULT/)
})
