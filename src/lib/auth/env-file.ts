// Editing of a dotenv file for `npm run set-password` (plan 5.5). Replaces or appends single lines only.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { generateSessionSecret } from './generate'
import { hashPassword } from './password'

const lineFor = (name: string) => new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=`)

/** The value of a variable in dotenv text, or null. Surrounding quotes are removed. */
export function readEnvVar(content: string, name: string): string | null {
  const matcher = lineFor(name)
  for (const line of content.split(/\r?\n/)) {
    if (!matcher.test(line)) continue
    const value = line.slice(line.indexOf('=') + 1).trim()
    const quoted = /^(['"])(.*)\1$/.exec(value)
    return quoted ? (quoted[2] ?? '') : value
  }
  return null
}

/** Replaces the line of `name` (first occurrence; later duplicates are dropped) or appends it. Other lines are untouched. */
export function upsertEnvVar(content: string, name: string, value: string): string {
  const eol = content.includes('\r\n') ? '\r\n' : '\n'
  const matcher = lineFor(name)
  const lines = content === '' ? [] : content.split(/\r?\n/)
  if (lines.at(-1) === '') lines.pop()
  const out: string[] = []
  let done = false
  for (const line of lines) {
    if (!matcher.test(line)) out.push(line)
    else if (!done) {
      out.push(`${name}=${value}`)
      done = true
    }
  }
  if (!done) out.push(`${name}=${value}`)
  return out.join(eol) + eol
}

export interface ApplyResult {
  hash: string
  secret: string
  createdFile: boolean
  secretWritten: boolean
}

/**
 * Writes AUTH_PASSWORD_HASH for `password` into the env file (created if absent) and adds SESSION_SECRET
 * when it is missing or too short, or always with `rotateSecret`.
 */
export async function applyPassword(file: string, password: string, options: { rotateSecret?: boolean } = {}): Promise<ApplyResult> {
  const createdFile = !existsSync(file)
  let content = createdFile ? '' : readFileSync(file, 'utf8')
  const hash = await hashPassword(password)
  content = upsertEnvVar(content, 'AUTH_PASSWORD_HASH', hash)
  let secret = readEnvVar(content, 'SESSION_SECRET') ?? ''
  const secretWritten = options.rotateSecret === true || secret.length < 32
  if (secretWritten) {
    secret = generateSessionSecret()
    content = upsertEnvVar(content, 'SESSION_SECRET', secret)
  }
  mkdirSync(path.dirname(path.resolve(file)), { recursive: true })
  writeFileSync(file, content, { mode: 0o600 })
  return { hash, secret, createdFile, secretWritten }
}
