// Command-line parsing for `npm run import` (plan 6.1). Pure.

export const USAGE = [
  'Usage:',
  '  npm run import -- <path-to-file.txt> [--force] [--dry-run] [--model <alias>]',
  '  npm run import -- --pending [--retry-failed] [--dry-run] [--model <alias>]',
  '',
  '  --force         import a file again although the same content was imported before',
  '  --pending       process the queue filled by the Import page (oldest first)',
  '  --retry-failed  with --pending: also retry sources that failed',
  '  --dry-run       call Claude and print the plan; write nothing to the database',
  '  --model <alias> Claude model (default: the CLI default, or IMPORT_MODEL)',
  '',
  'Environment: CLAUDE_BIN (path to claude.exe), IMPORT_MODEL, IMPORT_TIMEOUT_MS,',
  '             IMPORT_STUB_FILE (stub mode: use that file as the model reply; Claude is not called).',
].join('\n')

export interface ImportArgs {
  target: { kind: 'file'; path: string } | { kind: 'pending'; retryFailed: boolean }
  force: boolean
  dryRun: boolean
  model?: string
}

export type ParsedArgs = { ok: true; help: true } | { ok: true; help: false; args: ImportArgs } | { ok: false; error: string }

export function parseImportArgs(argv: readonly string[], env: Readonly<Record<string, string | undefined>> = {}): ParsedArgs {
  let pending = false
  let retryFailed = false
  let force = false
  let dryRun = false
  let model: string | undefined = env.IMPORT_MODEL?.trim() || undefined
  const paths: string[] = []

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? ''
    switch (arg) {
      case '--help':
      case '-h':
        return { ok: true, help: true }
      case '--pending': pending = true; break
      case '--retry-failed': retryFailed = true; break
      case '--force': force = true; break
      case '--dry-run': dryRun = true; break
      case '--model': {
        const value = argv[i + 1]
        if (value === undefined || value.startsWith('--') || value.trim() === '') return { ok: false, error: '--model needs a value' }
        model = value.trim()
        i += 1
        break
      }
      default:
        if (arg.startsWith('--')) return { ok: false, error: `Unknown option ${arg}` }
        paths.push(arg)
    }
  }

  if (pending && paths.length > 0) return { ok: false, error: 'Give either a file path or --pending, not both' }
  if (!pending && paths.length === 0) return { ok: false, error: 'Give a file path or --pending' }
  if (paths.length > 1) return { ok: false, error: 'Give one file path at a time' }
  if (pending && force) return { ok: false, error: '--force applies to a file path, not to --pending' }
  if (!pending && retryFailed) return { ok: false, error: '--retry-failed applies to --pending only' }
  if (model !== undefined && !/^[A-Za-z0-9._\-[\]]{1,80}$/.test(model)) return { ok: false, error: '--model has an unexpected format' }

  const target: ImportArgs['target'] = pending ? { kind: 'pending', retryFailed } : { kind: 'file', path: paths[0] ?? '' }
  return { ok: true, help: false, args: { target, force, dryRun, ...(model !== undefined ? { model } : {}) } }
}

/** IMPORT_TIMEOUT_MS, or undefined for the default (10 minutes). */
export function timeoutFromEnv(env: Readonly<Record<string, string | undefined>>): number | undefined {
  const raw = env.IMPORT_TIMEOUT_MS?.trim()
  if (!raw) return undefined
  const value = Number(raw)
  return Number.isInteger(value) && value >= 1_000 ? value : undefined
}
