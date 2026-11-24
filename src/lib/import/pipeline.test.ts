import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { normalizeNewlines, sha256Hex } from '../data/text'
import type { EntityIndexRow, ImportResult, ImportStatus } from '../data/types'
import type { ClaudeRunResult, ClaudeRunner } from './cli'
import { DRY_RUN_BANNER, STUB_BANNER, runImport, type ImportOptions } from './pipeline'
import type { ImportPlan } from './plan'
import type { ExtractedSource, ImportStore, QueueSource, SourceInfo } from './write'

const VALID = JSON.stringify({ entities: [{ type: 'creature', name: 'Pale Chorus' }] })
const RESULT: ImportResult = { created: 1, updated: 0, relations: 0, skipped: 0, conflicts: 0, lines: ['+ creature    Pale Chorus'] }
const EMPTY_PLAN: ImportPlan = { creates: [], updates: [], relations: [], skipped: [], conflicts: [], notes: [] }

const WRITES = ['insertPending', 'claim', 'releaseToPending', 'markFailed', 'applyImport'] as const

interface Row { id: number; filename: string; content: string; status: ImportStatus; attempts: number }

/** An in-memory ImportStore that records every call. */
function fakeStore(rows: Row[] = [], options: { applyThrows?: boolean } = {}) {
  const calls: Array<{ name: string; args: unknown[] }> = []
  let nextId = 100
  const info = (r: Row): SourceInfo => ({ id: r.id, filename: r.filename, status: r.status, attempts: r.attempts })
  const queue = (r: Row): QueueSource => ({ ...info(r), content: r.content })
  const store: ImportStore = {
    async findSourceByHash(hash) {
      calls.push({ name: 'findSourceByHash', args: [hash] })
      const row = rows.find((r) => sha256Hex(r.content) === hash)
      return row ? info(row) : null
    },
    async listQueue({ retryFailed }) {
      calls.push({ name: 'listQueue', args: [retryFailed] })
      return rows.filter((r) => r.status === 'pending' || (retryFailed && r.status === 'failed')).map(queue)
    },
    async listIndex(): Promise<EntityIndexRow[]> {
      calls.push({ name: 'listIndex', args: [] })
      return []
    },
    async previewPlan(filename: string, extracted: ExtractedSource) {
      calls.push({ name: 'previewPlan', args: [filename, extracted] })
      return { plan: EMPTY_PLAN, result: RESULT }
    },
    async insertPending(filename, content) {
      calls.push({ name: 'insertPending', args: [filename] })
      const row: Row = { id: nextId++, filename, content, status: 'pending', attempts: 0 }
      rows.push(row)
      return info(row)
    },
    async claim(id, from) {
      calls.push({ name: 'claim', args: [id, from] })
      const row = rows.find((r) => r.id === id)
      if (!row || !from.includes(row.status)) return null
      row.status = 'processing'
      row.attempts += 1
      return queue(row)
    },
    async releaseToPending(id, error) {
      calls.push({ name: 'releaseToPending', args: [id, error] })
      const row = rows.find((r) => r.id === id)
      if (row) row.status = 'pending'
    },
    async markFailed(id, error) {
      calls.push({ name: 'markFailed', args: [id, error] })
      const row = rows.find((r) => r.id === id)
      if (row) row.status = 'failed'
    },
    async applyImport(source, _extracted, stub) {
      calls.push({ name: 'applyImport', args: [source.id, stub] })
      if (options.applyThrows) throw new Error('duplicate key value violates unique constraint')
      const row = rows.find((r) => r.id === source.id)
      if (row) row.status = 'done'
      return { plan: EMPTY_PLAN, result: { ...RESULT, ...(stub ? { stub: true } : {}) } }
    },
  }
  const writes = () => calls.filter((c) => (WRITES as readonly string[]).includes(c.name))
  return { store, calls, rows, writes }
}

function runnerOf(results: ClaudeRunResult[]): ClaudeRunner {
  let i = 0
  return async () => results[Math.min(i++, results.length - 1)] ?? { ok: true, text: VALID }
}

const SAMPLE = 'The Pale Chorus sings.\r\nIt sings in the drift.'
const fileTarget = (content = SAMPLE): ImportOptions['target'] => ({ kind: 'file', filename: 'zz-test.txt', content })

async function run(options: Partial<ImportOptions>, store: ImportStore, runner: ClaudeRunner = runnerOf([{ ok: true, text: VALID }]), stub = false) {
  const lines: string[] = []
  const outcome = await runImport(
    { target: fileTarget(), force: false, dryRun: false, ...options },
    { store, runner, stub, log: (line) => lines.push(line), sleep: async () => {} },
  )
  return { outcome, lines, text: lines.join('\n') }
}

describe('dry run writes nothing', () => {
  test('file path: no insert, no claim, no status change; the plan is printed', async () => {
    const fake = fakeStore()
    const { outcome, text } = await run({ dryRun: true }, fake.store, undefined, true)
    assert.equal(outcome.exitCode, 0)
    assert.deepEqual(fake.writes(), [])
    assert.deepEqual(fake.rows, [])
    assert.ok(text.includes(STUB_BANNER))
    assert.ok(text.includes(DRY_RUN_BANNER))
    assert.match(text, /not yet in import_sources/)
    assert.match(text, /plan: created 1 · updated 0/)
  })

  test('--pending: queue rows are read, never claimed or updated', async () => {
    const fake = fakeStore([{ id: 1, filename: 'zz-a.txt', content: 'A text.', status: 'pending', attempts: 0 }])
    const { outcome } = await run({ dryRun: true, target: { kind: 'pending', retryFailed: false } }, fake.store)
    assert.equal(outcome.exitCode, 0)
    assert.deepEqual(fake.writes(), [])
    assert.equal(fake.rows[0]?.status, 'pending')
    assert.equal(fake.rows[0]?.attempts, 0)
  })

  test('CLI missing during a dry run: exit 2, nothing written', async () => {
    const fake = fakeStore()
    const { outcome, text } = await run({ dryRun: true }, fake.store, runnerOf([{ ok: false, kind: 'not_found', message: 'INSTALL ME' }]))
    assert.equal(outcome.exitCode, 2)
    assert.deepEqual(fake.writes(), [])
    assert.match(text, /INSTALL ME/)
  })
})

describe('real run state machine', () => {
  test('new file: insert pending, claim, write, done', async () => {
    const fake = fakeStore()
    const { outcome, text } = await run({}, fake.store, undefined, true)
    assert.equal(outcome.exitCode, 0)
    assert.deepEqual(fake.writes().map((c) => c.name), ['insertPending', 'claim', 'applyImport'])
    assert.deepEqual(fake.calls.find((c) => c.name === 'claim')?.args[1], ['pending'])
    assert.deepEqual(fake.calls.find((c) => c.name === 'applyImport')?.args, [100, true])
    assert.equal(fake.rows[0]?.status, 'done')
    assert.equal(fake.rows[0]?.content, normalizeNewlines(SAMPLE))
    assert.match(text, /TOTAL created 1/)
  })

  test('same content already done: no-op without --force, re-import with --force', async () => {
    const rows: Row[] = [{ id: 5, filename: 'other-name.txt', content: normalizeNewlines(SAMPLE), status: 'done', attempts: 1 }]
    const fake = fakeStore(rows)
    const first = await run({}, fake.store)
    assert.equal(first.outcome.exitCode, 0)
    assert.match(first.text, /already imported .* nothing to do/)
    assert.deepEqual(fake.writes(), [])

    const forced = await run({ force: true }, fake.store)
    assert.equal(forced.outcome.exitCode, 0)
    assert.deepEqual(fake.calls.find((c) => c.name === 'claim')?.args, [5, ['done']])
    assert.equal(rows[0]?.status, 'done')
  })

  test('known pending or failed file is claimed directly', async () => {
    const fake = fakeStore([{ id: 6, filename: 'zz-test.txt', content: normalizeNewlines(SAMPLE), status: 'failed', attempts: 2 }])
    const { outcome } = await run({}, fake.store)
    assert.equal(outcome.exitCode, 0)
    assert.deepEqual(fake.writes().map((c) => c.name), ['claim', 'applyImport'])
  })

  test('a row held by another run is skipped', async () => {
    const fake = fakeStore([{ id: 7, filename: 'zz-test.txt', content: normalizeNewlines(SAMPLE), status: 'processing', attempts: 1 }])
    const { outcome, text } = await run({}, fake.store)
    assert.equal(outcome.exitCode, 0)
    assert.match(text, /being processed by another run/)
    assert.deepEqual(fake.writes().map((c) => c.name), ['claim'])
  })

  test('runner fails twice then succeeds: done', async () => {
    const fake = fakeStore()
    const runner = runnerOf([{ ok: true, text: 'nope' }, { ok: false, kind: 'timeout', message: 't' }, { ok: true, text: VALID }])
    const { outcome } = await run({}, fake.store, runner)
    assert.equal(outcome.exitCode, 0)
    assert.equal(fake.rows[0]?.status, 'done')
  })

  test('runner always fails: the source ends failed with the error, exit 1', async () => {
    const fake = fakeStore()
    const { outcome } = await run({}, fake.store, runnerOf([{ ok: true, text: '{"bad":1}' }]))
    assert.equal(outcome.exitCode, 1)
    assert.equal(fake.rows[0]?.status, 'failed')
    const failed = fake.calls.find((c) => c.name === 'markFailed')
    assert.match(String(failed?.args[1]), /failed after 3 attempts/)
    assert.ok(!fake.calls.some((c) => c.name === 'applyImport'))
  })

  test('CLI not logged in: back to pending with the explanation, exit 2, nothing marked failed', async () => {
    const fake = fakeStore()
    const { outcome } = await run({}, fake.store, runnerOf([{ ok: false, kind: 'not_logged_in', message: 'LOG IN' }]))
    assert.equal(outcome.exitCode, 2)
    assert.equal(fake.rows[0]?.status, 'pending')
    assert.deepEqual(fake.calls.find((c) => c.name === 'releaseToPending')?.args, [100, 'LOG IN'])
    assert.ok(!fake.calls.some((c) => c.name === 'markFailed'))
  })

  test('a failed write transaction marks the source failed', async () => {
    const fake = fakeStore([], { applyThrows: true })
    const { outcome } = await run({}, fake.store)
    assert.equal(outcome.exitCode, 1)
    assert.equal(fake.rows[0]?.status, 'failed')
    assert.match(String(fake.calls.find((c) => c.name === 'markFailed')?.args[1]), /rolled back: duplicate key/)
  })

  test('--pending processes oldest first and stops the queue on an environment problem', async () => {
    const fake = fakeStore([
      { id: 1, filename: 'zz-a.txt', content: 'A.', status: 'pending', attempts: 0 },
      { id: 2, filename: 'zz-b.txt', content: 'B.', status: 'failed', attempts: 1 },
      { id: 3, filename: 'zz-c.txt', content: 'C.', status: 'pending', attempts: 0 },
    ])
    const ok = await run({ target: { kind: 'pending', retryFailed: false } }, fake.store)
    assert.equal(ok.outcome.exitCode, 0)
    assert.equal(ok.outcome.processed, 2)
    assert.deepEqual(fake.rows.map((r) => r.status), ['done', 'failed', 'done'])

    const retry = await run({ target: { kind: 'pending', retryFailed: true } }, fake.store, runnerOf([{ ok: false, kind: 'not_found', message: 'x' }]))
    assert.equal(retry.outcome.exitCode, 2)
    assert.deepEqual(fake.calls.filter((c) => c.name === 'claim').at(-1)?.args, [2, ['pending', 'failed']])
    assert.equal(fake.rows[1]?.status, 'pending')
  })

  test('empty file and empty queue', async () => {
    const empty = await run({ target: fileTarget('  \n ') }, fakeStore().store)
    assert.equal(empty.outcome.exitCode, 1)
    assert.match(empty.text, /empty/)
    const queue = await run({ target: { kind: 'pending', retryFailed: false } }, fakeStore().store)
    assert.equal(queue.outcome.exitCode, 0)
    assert.match(queue.text, /Queue empty/)
  })
})
