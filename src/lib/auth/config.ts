// Authentication configuration from the environment (plan 5.2, 5.7). Read on every call; fail closed.
import { createHash } from 'node:crypto'
import { parseHash, type ParsedHash } from './password'

export const MIN_SECRET_LENGTH = 32

export type AuthConfig =
  | {
    ok: true
    passwordHash: ParsedHash
    sessionSecret: string
    /** First 16 hex characters of SHA-256(AUTH_PASSWORD_HASH): stored in the session, so a password change ends it. */
    pw: string
  }
  | { ok: false; reason: string }

/** The value kept in the session cookie to tie it to the current password hash. */
export function passwordFingerprint(rawHash: string): string {
  return createHash('sha256').update(rawHash).digest('hex').slice(0, 16)
}

const logged = new Set<string>()
function notConfigured(reason: string): AuthConfig {
  if (!logged.has(reason)) {
    logged.add(reason) // once per process; the reason never contains a value
    console.error(`[auth] not configured: ${reason}. Nobody can log in until this is fixed.`)
  }
  return { ok: false, reason }
}

export function getAuthConfig(): AuthConfig {
  const sessionSecret = (process.env.SESSION_SECRET ?? '').trim()
  if (sessionSecret.length === 0) return notConfigured('SESSION_SECRET is not set')
  if (sessionSecret.length < MIN_SECRET_LENGTH) return notConfigured(`SESSION_SECRET is shorter than ${MIN_SECRET_LENGTH} characters`)
  const rawHash = (process.env.AUTH_PASSWORD_HASH ?? '').trim()
  if (rawHash.length === 0) return notConfigured('AUTH_PASSWORD_HASH is not set')
  const passwordHash = parseHash(rawHash)
  if (!passwordHash) return notConfigured('AUTH_PASSWORD_HASH is malformed')
  return { ok: true, passwordHash, sessionSecret, pw: passwordFingerprint(rawHash) }
}
