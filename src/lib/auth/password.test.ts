import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PASSWORD_ALPHABET, generatePassword, generateSessionSecret } from './generate'
import { canonicalPassword, hashPassword, parseHash, verifyPassword } from './password'

test('hash format: scrypt:32768:8:1:<32 hex>:<128 hex>, no dollar sign', async () => {
  const hash = await hashPassword('correct horse battery')
  assert.match(hash, /^scrypt:32768:8:1:[0-9a-f]{32}:[0-9a-f]{128}$/)
  assert.ok(!hash.includes('$'))
  assert.notEqual(hash, await hashPassword('correct horse battery'), 'a fresh salt every time')
})

test('hash round trip; a wrong password is rejected; case is significant', async () => {
  const parsed = parseHash(await hashPassword('abcd-efgh-jkmn'))
  assert.ok(parsed)
  assert.equal(await verifyPassword('abcd-efgh-jkmn', parsed), true)
  assert.equal(await verifyPassword('abcd-efgh-jkmm', parsed), false)
  assert.equal(await verifyPassword('ABCD-EFGH-JKMN', parsed), false)
  assert.equal(await verifyPassword('', parsed), false)
})

test('canonicalisation: hyphens, dashes and whitespace are ignored, NFKC applied', async () => {
  assert.equal(canonicalPassword(' abcd-efgh \t jkmn\n'), 'abcdefghjkmn')
  assert.equal(canonicalPassword('ab–cd—ef gh'), 'abcdefgh')
  assert.equal(canonicalPassword('ａｂｃ'), 'abc', 'full-width letters fold to ASCII')
  assert.equal(canonicalPassword('AbC'), 'AbC')
  const parsed = parseHash(await hashPassword('abcd-efgh-jkmn'))
  assert.ok(parsed)
  assert.equal(await verifyPassword('abcdefghjkmn', parsed), true)
  assert.equal(await verifyPassword('abcd efgh jkmn', parsed), true)
  assert.equal(await verifyPassword('  abcd - efgh - jkmn  ', parsed), true)
})

test('malformed hashes are rejected', () => {
  const salt = 'ab'.repeat(16)
  const key = 'cd'.repeat(64)
  assert.ok(parseHash(`scrypt:32768:8:1:${salt}:${key}`))
  assert.ok(parseHash(`scrypt:16384:8:1:${salt}:${key}`))
  assert.ok(parseHash(`scrypt:131072:8:1:${salt}:${key}`))
  const bad: Array<string | undefined | null> = [
    undefined, null, '', 'scrypt', key,
    `bcrypt:32768:8:1:${salt}:${key}`,
    `scrypt:32768:8:1:${salt}`,
    `scrypt:32768:8:1:${salt}:${key}:extra`,
    `scrypt:8192:8:1:${salt}:${key}`,
    `scrypt:262144:8:1:${salt}:${key}`,
    `scrypt:32769:8:1:${salt}:${key}`,
    `scrypt:40000:8:1:${salt}:${key}`,
    `scrypt:0x8000:8:1:${salt}:${key}`,
    `scrypt:32768:16:1:${salt}:${key}`,
    `scrypt:32768:8:2:${salt}:${key}`,
    `scrypt:32768:8:1:${salt.slice(2)}:${key}`,
    `scrypt:32768:8:1:${salt}:${key.slice(2)}`,
    `scrypt:32768:8:1:${salt}:${key}00`,
    `scrypt:32768:8:1:${'zz'.repeat(16)}:${key}`,
    `scrypt:32768:8:1:${salt}:${'g'.repeat(128)}`,
    `scrypt$32768$8$1$${salt}$${key}`,
    ` scrypt:32768:8:1:${salt}:${key}`,
  ]
  for (const value of bad) assert.equal(parseHash(value), null, String(value).slice(0, 40))
})

test('generated passwords: 24 characters of the 31-symbol alphabet in six hyphenated groups of four', () => {
  assert.equal(PASSWORD_ALPHABET.length, 31)
  assert.equal(new Set(PASSWORD_ALPHABET).size, 31)
  for (const ambiguous of 'ilo01') assert.ok(!PASSWORD_ALPHABET.includes(ambiguous), ambiguous)
  assert.match(PASSWORD_ALPHABET, /^[a-z2-9]+$/)
  const seen = new Set<string>()
  for (let i = 0; i < 200; i += 1) {
    const password = generatePassword()
    assert.match(password, /^[a-z2-9]{4}(-[a-z2-9]{4}){5}$/)
    const raw = canonicalPassword(password)
    assert.equal(raw.length, 24)
    for (const char of raw) assert.ok(PASSWORD_ALPHABET.includes(char), char)
    seen.add(password)
  }
  assert.equal(seen.size, 200)
})

test('generated session secrets: 64 hex characters, different every time', () => {
  const secret = generateSessionSecret()
  assert.match(secret, /^[0-9a-f]{64}$/)
  assert.notEqual(secret, generateSessionSecret())
})
