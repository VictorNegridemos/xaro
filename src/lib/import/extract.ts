// Runs the Claude calls for one source text: chunk by chunk, sequentially, with the retry budget of plan 6.4.
// No database access here.
import type { EntityIndexRow } from '../data/types'
import { chunkText } from './chunk'
import type { ClaudeFailureKind, ClaudeRunner } from './cli'
import { mergeExtractions } from './merge'
import type { MergedFile } from './merge'
import { SYSTEM_PROMPT, buildPrompt, selectIndex } from './prompt'
import { parseExtraction } from './schema'
import type { Extraction } from './schema'

export const MAX_ATTEMPTS = 3
/** Waits before the second and the third attempt after a timeout or CLI error. */
export const RETRY_WAITS_MS = [5_000, 20_000] as const

export type ExtractResult =
  | { ok: true; merged: MergedFile; sentIds: Set<number>; chunks: number; calls: number }
  /** environment: the CLI is missing or not logged in (nothing is wrong with the source). */
  | { ok: false; environment: boolean; kind: ClaudeFailureKind; message: string }

export interface ExtractInput {
  filename: string
  content: string
  index: readonly EntityIndexRow[]
  runner: ClaudeRunner
  model?: string
  timeoutMs: number
  sleep?: (ms: number) => Promise<void>
  log?: (line: string) => void
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms) })

export async function extractSource(input: ExtractInput): Promise<ExtractResult> {
  const sleep = input.sleep ?? defaultSleep
  const log = input.log ?? (() => {})
  const chunks = chunkText(input.content)
  if (chunks.length === 0) return { ok: false, environment: false, kind: 'bad_output', message: 'The source text is empty.' }

  const parts: Extraction[] = []
  const sentIds = new Set<number>()
  let calls = 0

  for (const [i, chunk] of chunks.entries()) {
    const index = selectIndex(input.index, chunk)
    for (const row of index) sentIds.add(row.id)
    const earlier = mergeExtractions(parts).entities.map((e) => ({ type: e.type, name: e.name, aliases: e.aliases }))

    let retryError: string | undefined
    let done = false
    let last: { kind: ClaudeFailureKind; message: string } = { kind: 'bad_output', message: 'no attempt was made' }
    for (let attempt = 1; attempt <= MAX_ATTEMPTS && !done; attempt += 1) {
      const { prompt } = buildPrompt({
        filename: input.filename, chunk, part: i + 1, total: chunks.length, index, earlier, retryError,
      })
      log(`  part ${i + 1}/${chunks.length}, attempt ${attempt}/${MAX_ATTEMPTS} (${chunk.length} characters)`)
      calls += 1 // one call at a time, never parallel
      const run = await input.runner({ system: SYSTEM_PROMPT, prompt, model: input.model, timeoutMs: input.timeoutMs })
      if (!run.ok) {
        if (run.kind === 'not_found' || run.kind === 'not_logged_in') {
          return { ok: false, environment: true, kind: run.kind, message: run.message }
        }
        last = { kind: run.kind, message: run.message }
        log(`  ${run.kind}: ${run.message}`)
        const wait = RETRY_WAITS_MS[attempt - 1]
        if (attempt < MAX_ATTEMPTS && wait !== undefined) await sleep(wait)
        continue
      }
      const parsed = parseExtraction(run.text)
      if (!parsed.ok) {
        last = { kind: 'bad_output', message: parsed.error }
        retryError = parsed.error
        log(`  reply rejected: ${parsed.error.split('\n')[0] ?? ''}`)
        continue
      }
      parts.push(parsed.data)
      done = true
    }
    if (!done) {
      return {
        ok: false,
        environment: false,
        kind: last.kind,
        message: `Part ${i + 1} of ${chunks.length} failed after ${MAX_ATTEMPTS} attempts: ${last.message}`.slice(0, 4000),
      }
    }
  }
  return { ok: true, merged: mergeExtractions(parts), sentIds, chunks: chunks.length, calls }
}
