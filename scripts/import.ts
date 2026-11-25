// npm run import -- <file.txt> [--force] [--dry-run] [--model <alias>]
// npm run import -- --pending [--retry-failed] [--dry-run] [--model <alias>]
//
// Runs on the owner's PC only. Sends the text through the Claude Code CLI in headless mode (the owner's
// subscription; no API key) and writes the result to the database in one transaction per source
// (plan 6). The deployed site never calls Claude. With IMPORT_STUB_FILE set, Claude is not called.
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { parseImportArgs, timeoutFromEnv, USAGE } from '../src/lib/import/args'
import { runnerFromEnv } from '../src/lib/import/cli'
import { MAX_SOURCE_BYTES, runImport, type ImportTarget } from '../src/lib/import/pipeline'
import { createImportStore } from '../src/lib/import/write'
import { loadEnv, runScript } from './lib/env'
import { openScriptDb } from './lib/script-db'

async function main(): Promise<void> {
  loadEnv()
  const parsed = parseImportArgs(process.argv.slice(2), process.env)
  if (!parsed.ok) {
    console.error(`${parsed.error}\n\n${USAGE}`)
    process.exitCode = 1
    return
  }
  if (parsed.help) {
    console.log(USAGE)
    return
  }
  const { args } = parsed

  let target: ImportTarget
  if (args.target.kind === 'file') {
    const file = path.resolve(args.target.path)
    const info = await stat(file).catch(() => null)
    if (!info?.isFile()) {
      console.error(`File not found: ${args.target.path}`)
      process.exitCode = 1
      return
    }
    // Newline normalisation can only shrink the text, so a file this large can never fit.
    if (info.size > MAX_SOURCE_BYTES * 2) {
      console.error(`${path.basename(file)}: the file is larger than ${MAX_SOURCE_BYTES} bytes.`)
      process.exitCode = 1
      return
    }
    target = { kind: 'file', filename: path.basename(file), content: await readFile(file, 'utf8') }
  } else {
    target = args.target
  }

  const { runner, stub } = runnerFromEnv(process.env)
  const db = openScriptDb()
  try {
    const result = await runImport(
      { target, force: args.force, dryRun: args.dryRun, model: args.model, timeoutMs: timeoutFromEnv(process.env) },
      { store: createImportStore(db.db), runner, stub, log: (line) => console.log(line) },
    )
    process.exitCode = result.exitCode
  } finally {
    await db.close()
  }
}

runScript(main)
