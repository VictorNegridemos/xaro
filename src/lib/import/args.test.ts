import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseImportArgs, timeoutFromEnv } from './args'

test('file path with flags', () => {
  assert.deepEqual(parseImportArgs(['samples/sample-log.txt', '--dry-run', '--force', '--model', 'sonnet']), {
    ok: true, help: false,
    args: { target: { kind: 'file', path: 'samples/sample-log.txt' }, force: true, dryRun: true, model: 'sonnet' },
  })
})

test('--pending with --retry-failed; IMPORT_MODEL as default model', () => {
  assert.deepEqual(parseImportArgs(['--pending', '--retry-failed'], { IMPORT_MODEL: 'opus' }), {
    ok: true, help: false,
    args: { target: { kind: 'pending', retryFailed: true }, force: false, dryRun: false, model: 'opus' },
  })
})

test('usage errors', () => {
  for (const argv of [[], ['a.txt', '--pending'], ['a.txt', 'b.txt'], ['--pending', '--force'], ['a.txt', '--retry-failed'], ['a.txt', '--model'], ['a.txt', '--nope'], ['a.txt', '--model', 'x y']]) {
    assert.equal(parseImportArgs(argv).ok, false, argv.join(' '))
  }
  assert.deepEqual(parseImportArgs(['--help']), { ok: true, help: true })
})

test('IMPORT_TIMEOUT_MS', () => {
  assert.equal(timeoutFromEnv({}), undefined)
  assert.equal(timeoutFromEnv({ IMPORT_TIMEOUT_MS: '30000' }), 30_000)
  assert.equal(timeoutFromEnv({ IMPORT_TIMEOUT_MS: 'abc' }), undefined)
  assert.equal(timeoutFromEnv({ IMPORT_TIMEOUT_MS: '5' }), undefined)
})
