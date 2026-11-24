// Session cookie settings and the validity rule (plan 5.6). No Next.js imports: shared by session.ts and proxy.ts.
import type { SessionOptions } from 'iron-session'

export const SESSION_COOKIE = 'xaro_session'
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30

export interface SessionData {
  isLoggedIn?: true
  /** Login time, epoch seconds. */
  at?: number
  /** Fingerprint of the password hash that was current at login. */
  pw?: string
}

export function sessionOptions(secret: string): SessionOptions {
  return {
    password: secret,
    cookieName: SESSION_COOKIE,
    ttl: SESSION_TTL_SECONDS,
    cookieOptions: { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' },
  }
}

/** Logged in only if the session was sealed while the CURRENT password hash was configured. */
export function isSessionValid(session: SessionData, currentPw: string): boolean {
  return session.isLoggedIn === true && typeof session.pw === 'string' && session.pw.length > 0 && session.pw === currentPw
}
