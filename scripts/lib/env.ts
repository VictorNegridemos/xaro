// Loads .env.local, then .env (the first definition of a variable wins). Never prints values (K22).
import { existsSync } from 'node:fs'
import path from 'node:path'

let loaded = false

export function loadEnv(cwd: string = process.cwd()): void {
  if (loaded) return
  loaded = true
  for (const name of ['.env.local', '.env']) {
    const file = path.join(cwd, name)
    if (existsSync(file)) process.loadEnvFile(file)
  }
}

export function requireDatabaseUrl(): string {
  loadEnv()
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set (expected in .env or .env.local).')
  return url
}

/** An error message that is safe to print: connection strings are masked. */
export function safeMessage(error: unknown): string {
  const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  return text.replace(/postgres(?:ql)?:\/\/\S+/gi, '[database url hidden]')
}

/** Runs a script's main function, prints a safe error and sets the exit code. */
export function runScript(main: () => Promise<void>): void {
  main().catch((error: unknown) => {
    console.error(`FAILED — ${safeMessage(error)}`)
    process.exitCode = 1
  })
}
