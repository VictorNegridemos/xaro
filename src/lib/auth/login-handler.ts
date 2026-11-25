// The logic of POST /api/auth/login (plan 5.8, 5.9), with its side effects injectable for tests.
import { z } from 'zod'
import { jsonError, readJsonBody } from '../http'
import { getAuthConfig } from './config'
import { checkSameOrigin, safeNextPath } from './origin'
import { verifyPassword, type ParsedHash } from './password'
import { startSession } from './session'
import { bucketFor, clearAttempts, decideAttempt, registerAttempt, type AttemptState } from './throttle'

/** The route is public and scrypt is expensive: the body is capped before anything is parsed or hashed. */
export const LOGIN_BODY_LIMIT = 2_048

export const loginBodySchema = z.object({
  password: z.string().min(1).max(200),
  next: z.string().max(200).optional(),
})

export interface LoginDeps {
  registerAttempt: (bucket: string) => Promise<AttemptState>
  clearAttempts: (bucket: string) => Promise<void>
  verifyPassword: (password: string, stored: ParsedHash) => Promise<boolean>
  startSession: () => Promise<void>
}

const defaultDeps: LoginDeps = {
  registerAttempt: (bucket) => registerAttempt(bucket),
  clearAttempts: (bucket) => clearAttempts(bucket),
  verifyPassword,
  startSession,
}

export async function handleLogin(request: Request, deps: LoginDeps = defaultDeps): Promise<Response> {
  if (!checkSameOrigin(request)) return jsonError(403, 'bad_origin')

  const config = getAuthConfig()
  if (!config.ok) return jsonError(503, 'auth_not_configured')

  // Malformed bodies are rejected before the throttle row is written and before anything is hashed.
  const body = await readJsonBody(request, LOGIN_BODY_LIMIT)
  if (!body.ok) return body.response
  const parsed = loginBodySchema.safeParse(body.data)
  if (!parsed.success) return jsonError(400, 'invalid_body')

  // The attempt is counted BEFORE the password is checked. If the database is down the attempt is refused.
  const bucket = bucketFor(request, config.sessionSecret)
  let state: AttemptState
  try {
    state = await deps.registerAttempt(bucket)
  } catch {
    console.error('[auth] login refused: the throttle could not be consulted')
    return jsonError(503, 'service_unavailable')
  }
  const decision = decideAttempt(state)
  if (!decision.allowed) {
    return jsonError(429, 'throttled', { retryAfter: decision.retryAfter }, { 'Retry-After': String(decision.retryAfter) })
  }

  if (!(await deps.verifyPassword(parsed.data.password, config.passwordHash))) {
    return jsonError(401, 'invalid_credentials')
  }

  try {
    await deps.clearAttempts(bucket)
  } catch {
    // The row expires by itself; a failed clean-up must not block a correct login.
  }
  await deps.startSession()
  return Response.json({ ok: true, next: safeNextPath(parsed.data.next) }, { headers: { 'Cache-Control': 'no-store' } })
}
