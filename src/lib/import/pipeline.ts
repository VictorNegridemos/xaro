// The import state machine (plan 6.7). Talks to the database only through ImportStore and to Claude only
// through a ClaudeRunner, so every branch is unit-tested with doubles. scripts/import.ts wires it up.
//
// REAL RUN : hash lookup -> (insert pending) -> claim -> Claude calls (no transaction open) -> one write
//            transaction -> done | failed. CLI missing / not logged in -> back to pending, exit 2.
// DRY RUN  : reads only. No insert, no claim, no status change; the plan is printed.
import { normalizeNewlines, sha256Hex } from '../data/text'
import type { ImportResult, ImportStatus } from '../data/types'
import type { ClaudeRunner } from './cli'
import { DEFAULT_TIMEOUT_MS } from './cli'
import { extractSource } from './extract'
import { formatSummary } from './plan'
import type { ImportStore, QueueSource } from './write'

/** import_sources.byte_size is limited to 2 MiB by a check constraint. */
export const MAX_SOURCE_BYTES = 2_097_152

export const STUB_BANNER = 'STUB MODE — Claude was not called'
export const DRY_RUN_BANNER = 'DRY RUN — nothing is written to the database (no insert, no claim, no status change).'

export type ImportTarget =
  | { kind: 'file'; filename: string; content: string }
  | { kind: 'pending'; retryFailed: boolean }

export interface ImportOptions {
  target: ImportTarget
  force: boolean
  dryRun: boolean
  model?: string
  timeoutMs?: number
}

export interface PipelineDeps {
  store: ImportStore
  runner: ClaudeRunner
  stub: boolean
  log: (line: string) => void
  sleep?: (ms: number) => Promise<void>
}

export type Totals = Pick<ImportResult, 'created' | 'updated' | 'relations' | 'skipped' | 'conflicts'>
export interface RunOutcome {
  /** 0 = everything processed (or nothing to do); 1 = at least one source failed; 2 = Claude CLI missing or not logged in. */
  exitCode: 0 | 1 | 2
  totals: Totals
  processed: number
  failed: number
}

type SourceOutcome = { kind: 'ok'; result: ImportResult } | { kind: 'failed' } | { kind: 'environment' } | { kind: 'skipped' }

const zeroTotals = (): Totals => ({ created: 0, updated: 0, relations: 0, skipped: 0, conflicts: 0 })
function addTotals(totals: Totals, result: Totals): void {
  totals.created += result.created
  totals.updated += result.updated
  totals.relations += result.relations
  totals.skipped += result.skipped
  totals.conflicts += result.conflicts
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error))
  .replace(/postgres(?:ql)?:\/\/\S+/gi, '[database url hidden]')
  .slice(0, 4000)

function printResult(log: (line: string) => void, result: ImportResult, planned: boolean): void {
  log(`  ${planned ? 'plan: ' : ''}${formatSummary(result)}`)
  for (const line of result.lines ?? []) log(`    ${line}`)
  const notes = result.notes ?? []
  if (notes.length > 0) {
    log('  notes:')
    for (const note of notes) log(`    - ${note}`)
  }
}

/** Checks a file's text before anything else happens. Returns an error text or null. */
export function checkFileContent(content: string): string | null {
  if (content.includes('\u0000')) return 'The file contains NUL characters; it does not look like a text file.'
  const normalised = normalizeNewlines(content)
  if (normalised.trim() === '') return 'The file is empty.'
  if (Buffer.byteLength(normalised, 'utf8') > MAX_SOURCE_BYTES) return `The file is larger than ${MAX_SOURCE_BYTES} bytes.`
  return null
}

export async function runImport(options: ImportOptions, deps: PipelineDeps): Promise<RunOutcome> {
  const { store, log } = deps
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const totals = zeroTotals()
  let processed = 0
  let failed = 0
  const outcome = (exitCode: RunOutcome['exitCode']): RunOutcome => ({ exitCode, totals, processed, failed })

  if (deps.stub) log(STUB_BANNER)
  if (options.dryRun) log(DRY_RUN_BANNER)

  /** Claude calls for one text; on success either previews (dry run) or writes (claimed source). */
  async function handle(source: { id: number | null; filename: string; content: string }): Promise<SourceOutcome> {
    const index = await store.listIndex()
    const extracted = await extractSource({
      filename: source.filename, content: source.content, index, runner: deps.runner,
      model: options.model, timeoutMs, sleep: deps.sleep, log,
    })
    if (!extracted.ok) {
      if (extracted.environment) {
        log(extracted.message)
        if (!options.dryRun && source.id !== null) {
          await store.releaseToPending(source.id, extracted.message)
          log('  The source is back in the queue as pending; nothing was marked failed.')
        }
        return { kind: 'environment' }
      }
      log(`  FAILED: ${extracted.message}`)
      if (!options.dryRun && source.id !== null) await store.markFailed(source.id, extracted.message)
      return { kind: 'failed' }
    }
    const input = { merged: extracted.merged, sentIds: extracted.sentIds }
    log(`  ${extracted.chunks} part(s), ${extracted.calls} Claude call(s)`)
    if (options.dryRun || source.id === null) {
      const { result } = await store.previewPlan(source.filename, input)
      printResult(log, result, true)
      return { kind: 'ok', result }
    }
    try {
      const { result } = await store.applyImport({ id: source.id, filename: source.filename }, input, deps.stub)
      printResult(log, result, false)
      return { kind: 'ok', result }
    } catch (error) {
      const message = `The write transaction was rolled back: ${errorText(error)}`
      log(`  FAILED: ${message}`)
      await store.markFailed(source.id, message)
      return { kind: 'failed' }
    }
  }

  async function processClaimed(row: QueueSource): Promise<SourceOutcome> {
    log(`== ${row.filename} (source #${row.id}, attempt ${row.attempts})`)
    return handle({ id: row.id, filename: row.filename, content: row.content })
  }

  function count(result: SourceOutcome): boolean {
    if (result.kind === 'ok') {
      processed += 1
      addTotals(totals, result.result)
    } else if (result.kind === 'failed') {
      failed += 1
    }
    return result.kind === 'environment'
  }

  if (options.target.kind === 'file') {
    const { filename } = options.target
    const problem = checkFileContent(options.target.content)
    if (problem) {
      log(`${filename}: ${problem}`)
      return outcome(1)
    }
    const content = normalizeNewlines(options.target.content)
    const known = await store.findSourceByHash(sha256Hex(content))

    if (options.dryRun) {
      log(`== ${filename} (${known ? `already known as source #${known.id}, status ${known.status}` : 'not yet in import_sources'})`)
      const result = await handle({ id: null, filename, content })
      if (count(result)) return outcome(2)
      return outcome(failed > 0 ? 1 : 0)
    }

    let claimFrom: ImportStatus[]
    let id: number
    if (!known) {
      id = (await store.insertPending(filename, content)).id
      claimFrom = ['pending']
    } else if (known.status === 'done' && !options.force) {
      log(`${filename}: already imported (source #${known.id}) — nothing to do. Use --force to import it again.`)
      return outcome(0)
    } else {
      id = known.id
      claimFrom = known.status === 'done' ? ['done'] : known.status === 'processing' ? [] : ['pending', 'failed']
    }
    const claimed = await store.claim(id, claimFrom)
    if (!claimed) {
      log(`${filename}: source #${id} is being processed by another run — skipped.`)
      return outcome(0)
    }
    if (count(await processClaimed(claimed))) return outcome(2)
    log(`TOTAL ${formatSummary(totals)}`)
    return outcome(failed > 0 ? 1 : 0)
  }

  // --pending
  const { retryFailed } = options.target
  const queue = await store.listQueue({ retryFailed })
  if (queue.length === 0) {
    log(`Queue empty — no pending sources${retryFailed ? ' or failed sources' : ''}.`)
    return outcome(0)
  }
  log(`${queue.length} source(s) in the queue.`)
  const claimFrom: ImportStatus[] = retryFailed ? ['pending', 'failed'] : ['pending']
  for (const row of queue) {
    if (options.dryRun) {
      log(`== ${row.filename} (source #${row.id}, status ${row.status})`)
      if (count(await handle({ id: null, filename: row.filename, content: row.content }))) return outcome(2)
      continue
    }
    const claimed = await store.claim(row.id, claimFrom)
    if (!claimed) {
      log(`== ${row.filename} (source #${row.id}) is being processed by another run — skipped.`)
      continue
    }
    if (count(await processClaimed(claimed))) return outcome(2)
  }
  log(`TOTAL ${options.dryRun ? '(planned) ' : ''}${formatSummary(totals)}${failed > 0 ? ` · failed ${failed}` : ''}`)
  return outcome(failed > 0 ? 1 : 0)
}
