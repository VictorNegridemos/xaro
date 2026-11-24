import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { applyPassword, readEnvVar, upsertEnvVar } from '../src/lib/auth/env-file'
import { PASSWORD_ALPHABET } from '../src/lib/auth/generate'
import { parseHash, verifyPassword } from '../src/lib/auth/password'

const ROOT = path.resolve(__dirname, '..')

function withTempDir(run: (dir: string) => void | Promise<void>): Promise<void> {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'xaro-set-password-'))
  return Promise.resolve(run(dir)).finally(() => rmSync(dir, { recursive: true, force: true }))
}

test('upsertEnvVar replaces only the named line, appends when absent, keeps the line endings', () => {
  assert.equal(upsertEnvVar('', 'A', '1'), 'A=1\n')
  assert.equal(upsertEnvVar('X=1\nA=old\n# note\nY=2\n', 'A', 'new'), 'X=1\nA=new\n# note\nY=2\n')
  assert.equal(upsertEnvVar('X=1', 'A', 'new'), 'X=1\nA=new\n')
  assert.equal(upsertEnvVar('X=1\r\nA=old\r\n', 'A', 'new'), 'X=1\r\nA=new\r\n')
  assert.equal(upsertEnvVar('A=1\nB=2\nA=3\n', 'A', '9'), 'A=9\nB=2\n', 'duplicates collapse to one line')
  assert.equal(upsertEnvVar('AA=1\n', 'A', '2'), 'AA=1\nA=2\n', 'a longer name is a different variable')
})

test('readEnvVar reads plain and quoted values', () => {
  assert.equal(readEnvVar('A=1\nB="two"\n', 'B'), 'two')
  assert.equal(readEnvVar('A=1\n', 'B'), null)
})

test('applyPassword creates the env file with a valid hash and a 64-hex secret', () => withTempDir(async (dir) => {
  const file = path.join(dir, '.env.local')
  const result = await applyPassword(file, 'abcd-efgh-jkmn-pqrs')
  assert.equal(result.createdFile, true)
  assert.equal(result.secretWritten, true)
  const content = readFileSync(file, 'utf8')
  const hash = readEnvVar(content, 'AUTH_PASSWORD_HASH')
  assert.ok(hash && !hash.includes('$'))
  const parsed = parseHash(hash)
  assert.ok(parsed)
  assert.equal(await verifyPassword('abcdefghjkmnpqrs', parsed), true)
  assert.match(readEnvVar(content, 'SESSION_SECRET') ?? '', /^[0-9a-f]{64}$/)
}))

test('applyPassword replaces only the hash line, keeps the secret and every other line; --rotate-secret replaces the secret', () => withTempDir(async (dir) => {
  const file = path.join(dir, '.env.local')
  const secret = 'a'.repeat(64)
  writeFileSync(file, `# local\nOTHER=keep me\nAUTH_PASSWORD_HASH=old\nSESSION_SECRET=${secret}\nLAST=1\n`)
  const result = await applyPassword(file, 'a new password 123')
  assert.equal(result.createdFile, false)
  assert.equal(result.secretWritten, false)
  const lines = readFileSync(file, 'utf8').split('\n')
  assert.equal(lines.length, 6)
  assert.deepEqual([lines[0], lines[1], lines[3], lines[4], lines[5]], ['# local', 'OTHER=keep me', `SESSION_SECRET=${secret}`, 'LAST=1', ''])
  assert.ok(parseHash(lines[2]?.replace('AUTH_PASSWORD_HASH=', '')))

  const rotated = await applyPassword(file, 'a new password 123', { rotateSecret: true })
  assert.equal(rotated.secretWritten, true)
  const after = readFileSync(file, 'utf8')
  assert.notEqual(readEnvVar(after, 'SESSION_SECRET'), secret)
  assert.equal(readEnvVar(after, 'OTHER'), 'keep me')
}))

test('the script: --generate --out writes the password to the file and prints nothing secret', () => withTempDir((dir) => {
  const envFile = path.join(dir, 'temp.env')
  const out = path.join(dir, 'nested', 'password.txt')
  const run = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/set-password.ts', '--generate', '--out', out, '--env-path', envFile], {
    cwd: ROOT, encoding: 'utf8',
  })
  assert.equal(run.status, 0, run.stderr)

  const password = readFileSync(out, 'utf8').trim()
  assert.match(password, new RegExp(`^[${PASSWORD_ALPHABET}]{4}(-[${PASSWORD_ALPHABET}]{4}){5}$`))
  const content = readFileSync(envFile, 'utf8')
  const hash = readEnvVar(content, 'AUTH_PASSWORD_HASH') ?? ''
  const secret = readEnvVar(content, 'SESSION_SECRET') ?? ''
  assert.ok(parseHash(hash))
  assert.match(secret, /^[0-9a-f]{64}$/)

  const printed = run.stdout + run.stderr
  assert.ok(!printed.includes(password), 'the password is not printed')
  assert.ok(!printed.includes(password.replaceAll('-', '')), 'nor without hyphens')
  assert.ok(!printed.includes(hash) && !printed.includes(hash.split(':')[5] ?? 'x'), 'the hash is not printed')
  assert.ok(!printed.includes(secret), 'the secret is not printed')
}))

test('the script: the written hash verifies the written password', () => withTempDir(async (dir) => {
  const envFile = path.join(dir, 'temp.env')
  const out = path.join(dir, 'password.txt')
  const run = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/set-password.ts', '--generate', '--out', out, '--env-path', envFile], {
    cwd: ROOT, encoding: 'utf8',
  })
  assert.equal(run.status, 0, run.stderr)
  const parsed = parseHash(readEnvVar(readFileSync(envFile, 'utf8'), 'AUTH_PASSWORD_HASH'))
  assert.ok(parsed)
  assert.equal(await verifyPassword(readFileSync(out, 'utf8'), parsed), true)
}))

test('the script: refuses unknown flags, --out without --generate, and a prompt without a terminal', () => withTempDir((dir) => {
  const envFile = path.join(dir, 'temp.env')
  const run = (...args: string[]) => spawnSync(process.execPath, ['--import', 'tsx', 'scripts/set-password.ts', ...args, '--env-path', envFile], {
    cwd: ROOT, encoding: 'utf8', input: '',
  })
  // Each run must fail inside the script itself (its own "FAILED —" line), not in Node's argument parsing.
  for (const [args, reason] of [
    [['--nope'], /Unknown argument "--nope"/],
    [['--out', path.join(dir, 'x.txt')], /--out is only valid together with --generate/],
    [[], /No terminal for the hidden prompt/],
  ] as const) {
    const result = run(...args)
    assert.notEqual(result.status, 0, args.join(' '))
    assert.match(result.stderr, /FAILED — /, args.join(' '))
    assert.match(result.stderr, reason, args.join(' '))
  }
  assert.throws(() => readFileSync(envFile, 'utf8'), 'no env file was written')
}))
