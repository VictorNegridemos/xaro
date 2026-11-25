import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import type { ClaudeRunResult, ClaudeRunner } from './cli'
import { MAX_ATTEMPTS, RETRY_WAITS_MS, extractSource } from './extract'

const VALID = JSON.stringify({ entities: [{ type: 'creature', name: 'Pale Chorus' }] })

function scripted(results: ClaudeRunResult[]): { runner: ClaudeRunner; prompts: string[] } {
  const prompts: string[] = []
  let i = 0
  const runner: ClaudeRunner = async ({ prompt }) => {
    prompts.push(prompt)
    const next = results[Math.min(i, results.length - 1)]
    i += 1
    if (!next) throw new Error('no scripted result')
    return next
  }
  return { runner, prompts }
}

const base = { filename: 'zz-test.txt', content: 'The Pale Chorus sings in the drift.', index: [], timeoutMs: 1000 }

describe('retry budget (3 attempts per chunk)', () => {
  test('invalid output twice, then valid: succeeds and the retry prompt carries the error', async () => {
    const waits: number[] = []
    const { runner, prompts } = scripted([
      { ok: true, text: 'not json' },
      { ok: true, text: '{"entities":[{"type":"ship","name":"x"}]}' },
      { ok: true, text: VALID },
    ])
    const result = await extractSource({ ...base, runner, sleep: async (ms) => { waits.push(ms) } })
    assert.ok(result.ok)
    assert.equal(result.calls, 3)
    assert.equal(result.merged.entities[0]?.name, 'Pale Chorus')
    assert.ok(!prompts[0]?.includes('PREVIOUS REPLY'))
    assert.match(prompts[1] ?? '', /YOUR PREVIOUS REPLY WAS REJECTED: The reply is not valid JSON/)
    assert.match(prompts[2] ?? '', /YOUR PREVIOUS REPLY WAS REJECTED: The JSON does not match/)
    assert.deepEqual(waits, [], 'no wait after a parse failure')
  })

  test('always invalid: fails after 3 attempts, not an environment problem', async () => {
    const { runner, prompts } = scripted([{ ok: true, text: '{}' }])
    const result = await extractSource({ ...base, runner, sleep: async () => {} })
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.equal(result.environment, false)
      assert.equal(result.kind, 'bad_output')
      assert.match(result.message, /failed after 3 attempts/)
    }
    assert.equal(prompts.length, MAX_ATTEMPTS)
  })

  test('timeout and cli_error use the same budget with waits of 5 s and 20 s', async () => {
    const waits: number[] = []
    const { runner } = scripted([
      { ok: false, kind: 'timeout', message: 't' },
      { ok: false, kind: 'cli_error', message: 'c' },
      { ok: true, text: VALID },
    ])
    const result = await extractSource({ ...base, runner, sleep: async (ms) => { waits.push(ms) } })
    assert.ok(result.ok)
    assert.deepEqual(waits, [...RETRY_WAITS_MS])
    assert.deepEqual(RETRY_WAITS_MS, [5_000, 20_000])
  })

  test('not_found and not_logged_in stop at once as environment problems', async () => {
    for (const kind of ['not_found', 'not_logged_in'] as const) {
      const { runner, prompts } = scripted([{ ok: false, kind, message: 'install' }])
      const result = await extractSource({ ...base, runner, sleep: async () => {} })
      assert.equal(result.ok, false)
      if (!result.ok) assert.equal(result.environment, true)
      assert.equal(prompts.length, 1)
    }
  })
})

describe('chunks', () => {
  test('several chunks are called one after another; later prompts list earlier extractions', async () => {
    const paragraph = 'x'.repeat(15_000)
    let active = 0
    let maxActive = 0
    const prompts: string[] = []
    const runner: ClaudeRunner = async ({ prompt }) => {
      active += 1
      maxActive = Math.max(maxActive, active)
      prompts.push(prompt)
      await new Promise((resolve) => setTimeout(resolve, 5))
      active -= 1
      return { ok: true, text: prompts.length === 1 ? VALID : JSON.stringify({ entities: [{ type: 'creature', name: 'the pale chorus', aliases: ['Pale Chorus'] }] }) }
    }
    const result = await extractSource({ ...base, content: `${paragraph}\n\n${paragraph}`, runner })
    assert.ok(result.ok)
    assert.equal(result.chunks, 2)
    assert.equal(maxActive, 1, 'never parallel')
    assert.match(prompts[1] ?? '', /ALREADY EXTRACTED FROM THIS FILE \(type \| name \| aliases\)\ncreature \| Pale Chorus/)
    assert.equal(result.merged.entities.length, 1)
  })

  test('the ids of the index rows sent are returned', async () => {
    const { runner } = scripted([{ ok: true, text: VALID }])
    const result = await extractSource({ ...base, runner, index: [{ id: 7, type: 'other', name: 'Thing', aliases: [] }] })
    assert.ok(result.ok)
    assert.deepEqual([...result.sentIds], [7])
  })

  test('an empty text fails without a call', async () => {
    const { runner, prompts } = scripted([{ ok: true, text: VALID }])
    const result = await extractSource({ ...base, content: '   ', runner })
    assert.equal(result.ok, false)
    assert.equal(prompts.length, 0)
  })
})
