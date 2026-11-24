import assert from 'node:assert/strict'
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, test } from 'node:test'
import {
  NOT_FOUND_MESSAGE, NOT_LOGGED_IN_MESSAGE, childEnv, claudeArgs, classifyClaudeOutput, classifySpawnError,
  createClaudeRunner, createStubRunner, runnerFromEnv,
} from './cli'
import { SYSTEM_PROMPT } from './prompt'

// Recorded shapes (01-investigation-platform.md §4.5, CLI 2.1.330).
const NOT_LOGGED_IN = JSON.stringify({
  type: 'result', subtype: 'success', is_error: true, result: 'Not logged in · Please run /login',
  session_id: 's', num_turns: 1, duration_ms: 12, terminal_reason: 'api_error',
})
const SUCCESS = JSON.stringify({
  type: 'result', subtype: 'success', is_error: false, result: '{"entities":[]}', session_id: 's', num_turns: 1,
  usage: { input_tokens: 10, output_tokens: 5 },
})

describe('classifyClaudeOutput', () => {
  test('success needs exit 0, type result, is_error false and a string result', () => {
    assert.deepEqual(classifyClaudeOutput({ code: 0, stdout: SUCCESS, stderr: '' }), { ok: true, text: '{"entities":[]}' })
    assert.equal(classifyClaudeOutput({ code: 1, stdout: SUCCESS, stderr: '' }).ok, false)
    const noResult = JSON.stringify({ type: 'result', is_error: false })
    assert.equal(classifyClaudeOutput({ code: 0, stdout: noResult, stderr: '' }).ok, false)
    const otherType = JSON.stringify({ type: 'assistant', is_error: false, result: 'x' })
    assert.equal(classifyClaudeOutput({ code: 0, stdout: otherType, stderr: '' }).ok, false)
  })

  test('the observed "Not logged in" object (exit 1, subtype success) is not_logged_in', () => {
    const result = classifyClaudeOutput({ code: 1, stdout: NOT_LOGGED_IN, stderr: '' })
    assert.deepEqual(result, { ok: false, kind: 'not_logged_in', message: NOT_LOGGED_IN_MESSAGE })
  })

  test('another is_error result is a cli_error carrying the text', () => {
    const stdout = JSON.stringify({ type: 'result', subtype: 'success', is_error: true, result: 'Rate limit reached' })
    const result = classifyClaudeOutput({ code: 1, stdout, stderr: '' })
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.equal(result.kind, 'cli_error')
      assert.match(result.message, /Rate limit reached/)
    }
  })

  test('unparseable stdout is a cli_error with the start of stderr and stdout', () => {
    const result = classifyClaudeOutput({ code: 2, stdout: 'garbage', stderr: 'error: unknown option --foo' })
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.equal(result.kind, 'cli_error')
      assert.match(result.message, /unknown option --foo/)
      assert.match(result.message, /garbage/)
    }
  })
})

describe('spawn and environment', () => {
  test('ENOENT and EINVAL are not_found with the install instructions', () => {
    for (const code of ['ENOENT', 'EINVAL']) {
      assert.deepEqual(classifySpawnError(Object.assign(new Error('x'), { code })), { ok: false, kind: 'not_found', message: NOT_FOUND_MESSAGE })
    }
    assert.match(NOT_FOUND_MESSAGE, /irm https:\/\/claude\.ai\/install\.ps1 \| iex/)
    assert.match(NOT_FOUND_MESSAGE, /CLAUDE_BIN/)
    assert.equal(classifySpawnError(Object.assign(new Error('x'), { code: 'EACCES' })).ok, false)
  })

  test('the five subscription-bypassing variables are removed from the child environment (any case)', () => {
    const env = childEnv({
      ANTHROPIC_API_KEY: 'k', anthropic_auth_token: 't', ANTHROPIC_BASE_URL: 'u', CLAUDE_CODE_USE_BEDROCK: '1',
      CLAUDE_CODE_USE_VERTEX: '1', PATH: 'p', HOME: 'h',
    } as unknown as NodeJS.ProcessEnv)
    assert.deepEqual(env, { PATH: 'p', HOME: 'h' })
  })

  test('arguments: print mode, JSON, no tools, no MCP, no slash commands, no session, system prompt; no prompt text', () => {
    const args = claudeArgs()
    assert.deepEqual(args.slice(0, 11), [
      '-p', '--output-format', 'json', '--tools', '', '--disallowedTools', 'mcp__*', '--strict-mcp-config',
      '--disable-slash-commands', '--no-session-persistence', '--system-prompt',
    ])
    assert.equal(args[11], SYSTEM_PROMPT)
    assert.equal(args.length, 12)
    assert.ok(!args.includes('--bare'))
    assert.deepEqual(claudeArgs('sonnet').slice(-2), ['--model', 'sonnet'])
  })

  test('the real runner with a missing CLAUDE_BIN gives not_found', async () => {
    const runner = createClaudeRunner({ ...process.env, CLAUDE_BIN: path.join(tmpdir(), 'xaro-does-not-exist', 'claude.exe') })
    const result = await runner({ system: SYSTEM_PROMPT, prompt: 'hello', timeoutMs: 10_000 })
    assert.deepEqual(result, { ok: false, kind: 'not_found', message: NOT_FOUND_MESSAGE })
  })

  test('the real runner reports a binary that does not speak the protocol as cli_error', async () => {
    // node.exe rejects the claude flags on stderr and prints no JSON.
    const runner = createClaudeRunner({ ...process.env, CLAUDE_BIN: process.execPath })
    const result = await runner({ system: SYSTEM_PROMPT, prompt: 'hello', timeoutMs: 20_000 })
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.kind, 'cli_error')
  })
})

describe('stub mode', () => {
  test('IMPORT_STUB_FILE selects the stub runner, which returns the file content', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'xaro-stub-'))
    try {
      const file = path.join(dir, 'stub.json')
      writeFileSync(file, '{"entities":[]}')
      const { runner, stub } = runnerFromEnv({ IMPORT_STUB_FILE: file } as unknown as NodeJS.ProcessEnv)
      assert.equal(stub, true)
      assert.deepEqual(await runner({ system: '', prompt: '', timeoutMs: 1 }), { ok: true, text: '{"entities":[]}' })
      const missing = await createStubRunner(path.join(dir, 'missing.json'))({ system: '', prompt: '', timeoutMs: 1 })
      assert.equal(missing.ok, false)
      assert.equal(runnerFromEnv({} as NodeJS.ProcessEnv).stub, false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
