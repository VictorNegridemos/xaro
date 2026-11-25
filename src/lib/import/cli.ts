// Headless Claude Code CLI call (plan 6.2). Subscription login only: no API key, no tools, no MCP,
// no slash commands, an empty working directory. The prompt travels on stdin.
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { SYSTEM_PROMPT } from './prompt'

export type ClaudeRunner = (input: { system: string; prompt: string; model?: string; timeoutMs: number }) => Promise<ClaudeRunResult>
export type ClaudeFailureKind = 'not_found' | 'not_logged_in' | 'timeout' | 'cli_error' | 'bad_output'
export type ClaudeRunResult =
  | { ok: true; text: string }
  | { ok: false; kind: ClaudeFailureKind; message: string }

export const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000

/** Removed from the child environment so the call cannot leave the subscription path. */
export const STRIPPED_ENV_KEYS = [
  'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX',
] as const

export const NOT_FOUND_MESSAGE = [
  'The Claude CLI was not found.',
  '  1. Install it (PowerShell):  irm https://claude.ai/install.ps1 | iex',
  '  2. Open a new terminal and run "claude" once to log in with the subscription account.',
  '  3. Or set CLAUDE_BIN to the full path of claude.exe.',
].join('\n')

export const NOT_LOGGED_IN_MESSAGE = [
  'The Claude CLI is installed but not logged in.',
  '  Open a terminal, run "claude" once and complete the login (or "claude auth login"), then run the import again.',
].join('\n')

export function claudeArgs(model?: string): string[] {
  return [
    '-p',
    '--output-format', 'json',
    '--tools', '',
    '--disallowedTools', 'mcp__*',
    '--strict-mcp-config',
    '--disable-slash-commands',
    '--no-session-persistence',
    '--system-prompt', SYSTEM_PROMPT,
    ...(model ? ['--model', model] : []),
  ]
}

export function childEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const copy: NodeJS.ProcessEnv = { ...env }
  const stripped = new Set<string>(STRIPPED_ENV_KEYS)
  // Windows environment names are case-insensitive.
  for (const key of Object.keys(copy)) {
    if (stripped.has(key.toUpperCase())) delete copy[key]
  }
  return copy
}

/** A spawn error: ENOENT (or EINVAL for a .cmd shim) means the binary is not usable. */
export function classifySpawnError(error: unknown): ClaudeRunResult {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code: unknown }).code) : ''
  if (code === 'ENOENT' || code === 'EINVAL') return { ok: false, kind: 'not_found', message: NOT_FOUND_MESSAGE }
  return { ok: false, kind: 'cli_error', message: `The Claude CLI could not be started (${code || 'unknown error'}).` }
}

const head = (s: string) => s.trim().slice(0, 500)

/**
 * Result handling of plan 6.2:
 * - stdout is parsed as JSON whatever the exit code; unparseable output is a cli_error;
 * - success needs exit code 0, type "result", is_error false and a string result ("subtype" is ignored:
 *   it says "success" even for a failed run);
 * - is_error with a "not logged in" text is not_logged_in; everything else is a cli_error.
 */
export function classifyClaudeOutput(run: { code: number | null; stdout: string; stderr: string }): ClaudeRunResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(run.stdout)
  } catch {
    return {
      ok: false,
      kind: 'cli_error',
      message: `The Claude CLI did not return JSON (exit code ${run.code}). stderr: ${head(run.stderr) || '(empty)'} stdout: ${head(run.stdout) || '(empty)'}`,
    }
  }
  const out = (typeof parsed === 'object' && parsed !== null ? parsed : {}) as Record<string, unknown>
  if (run.code === 0 && out.type === 'result' && out.is_error === false && typeof out.result === 'string') {
    return { ok: true, text: out.result }
  }
  const text = typeof out.result === 'string' ? out.result : ''
  if (out.is_error === true && /not logged in|\/login/i.test(text)) {
    return { ok: false, kind: 'not_logged_in', message: NOT_LOGGED_IN_MESSAGE }
  }
  return {
    ok: false,
    kind: 'cli_error',
    message: `The Claude CLI reported an error (exit code ${run.code}): ${head(text) || head(run.stderr) || 'no message'}`,
  }
}

/** The real runner. One call at a time; the caller never runs two in parallel. */
export function createClaudeRunner(env: NodeJS.ProcessEnv = process.env): ClaudeRunner {
  return async ({ prompt, model, timeoutMs }) => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'xaro-import-'))
    try {
      return await new Promise<ClaudeRunResult>((resolve) => {
        let settled = false
        const finish = (result: ClaudeRunResult) => {
          if (settled) return
          settled = true
          clearTimeout(timer) // finish only runs from asynchronous callbacks, after timer is set
          resolve(result)
        }
        let child: ReturnType<typeof spawn>
        try {
          child = spawn(env.CLAUDE_BIN || 'claude', claudeArgs(model), {
            cwd, shell: false, windowsHide: true, env: childEnv(env), stdio: ['pipe', 'pipe', 'pipe'],
          })
        } catch (error) {
          resolve(classifySpawnError(error)) // EINVAL is thrown synchronously for a .cmd shim
          return
        }
        const timer = setTimeout(() => {
          child.kill()
          finish({ ok: false, kind: 'timeout', message: `The Claude CLI did not answer within ${Math.round(timeoutMs / 1000)} s.` })
        }, timeoutMs)
        let stdout = ''
        let stderr = ''
        child.stdout?.setEncoding('utf8').on('data', (data: string) => { stdout += data })
        child.stderr?.setEncoding('utf8').on('data', (data: string) => { stderr += data })
        child.on('error', (error) => finish(classifySpawnError(error)))
        child.on('close', (code) => finish(classifyClaudeOutput({ code, stdout, stderr })))
        child.stdin?.on('error', () => {}) // EPIPE when the child exits early; the close handler reports it
        child.stdin?.end(prompt, 'utf8')
      })
    } finally {
      await rm(cwd, { recursive: true, force: true }).catch(() => {})
    }
  }
}

/** Stub mode: the file's content is returned as the model text; Claude is not called. */
export function createStubRunner(file: string): ClaudeRunner {
  return async () => {
    try {
      return { ok: true, text: await readFile(file, 'utf8') }
    } catch {
      return { ok: false, kind: 'cli_error', message: `IMPORT_STUB_FILE could not be read: ${file}` }
    }
  }
}

/** IMPORT_STUB_FILE selects the stub runner; otherwise the real CLI is used. */
export function runnerFromEnv(env: NodeJS.ProcessEnv = process.env): { runner: ClaudeRunner; stub: boolean } {
  const stubFile = env.IMPORT_STUB_FILE
  if (stubFile) return { runner: createStubRunner(stubFile), stub: true }
  return { runner: createClaudeRunner(env), stub: false }
}
