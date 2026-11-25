// Login throttle stored in the database table auth_throttle (plan 5.9): works on serverless.
import { createHmac } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { getDb, type DbOrTx } from '../db/client'

export const MAX_ATTEMPTS = 5
export const WINDOW_MINUTES = 15

export interface AttemptState {
  /** Attempts in the current window, this one included. */
  failures: number
  /** Seconds until the window ends. */
  retryAfter: number
}

export type ThrottleDecision = { allowed: true } | { allowed: false; retryAfter: number }

/** Pure decision: the sixth and later attempts within the window are refused, whatever the password. */
export function decideAttempt(state: AttemptState): ThrottleDecision {
  const fullWindow = WINDOW_MINUTES * 60
  if (!Number.isFinite(state.failures) || state.failures < 1) return { allowed: false, retryAfter: fullWindow }
  if (state.failures <= MAX_ATTEMPTS) return { allowed: true }
  const retryAfter = Number.isFinite(state.retryAfter) ? Math.ceil(state.retryAfter) : fullWindow
  return { allowed: false, retryAfter: Math.min(Math.max(retryAfter, 1), fullWindow) }
}

/** x-real-ip, else the first entry of x-forwarded-for, else "local". */
export function clientIp(request: Request): string {
  const real = request.headers.get('x-real-ip')?.trim()
  if (real) return real
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || 'local'
}

/** "ip:" + the first 32 hex characters of HMAC-SHA256(secret, client IP). No raw IP is stored. */
export function bucketFor(request: Request, secret: string): string {
  return `ip:${createHmac('sha256', secret).update(clientIp(request)).digest('hex').slice(0, 32)}`
}

/** Registers one attempt atomically (and removes rows older than a day). Called BEFORE the password check. */
export async function registerAttempt(bucket: string, db: DbOrTx = getDb()): Promise<AttemptState> {
  const rows = await db.execute<{ failures: number; retry_after: number }>(sql`
    WITH gc AS (
      DELETE FROM public.auth_throttle WHERE window_start < now() - interval '1 day'
    )
    INSERT INTO public.auth_throttle AS t (bucket, failures, window_start)
    VALUES (${bucket}, 1, now())
    ON CONFLICT (bucket) DO UPDATE SET
      failures     = CASE WHEN t.window_start < now() - interval '15 minutes' THEN 1 ELSE t.failures + 1 END,
      window_start = CASE WHEN t.window_start < now() - interval '15 minutes' THEN now() ELSE t.window_start END
    RETURNING failures,
              ceil(extract(epoch FROM (window_start + interval '15 minutes' - now())))::int AS retry_after
  `)
  const row = rows[0]
  if (!row) throw new Error('auth_throttle: the attempt statement returned no row')
  return { failures: Number(row.failures), retryAfter: Number(row.retry_after) }
}

/** After a successful login. */
export async function clearAttempts(bucket: string, db: DbOrTx = getDb()): Promise<void> {
  await db.execute(sql`DELETE FROM public.auth_throttle WHERE bucket = ${bucket}`)
}
