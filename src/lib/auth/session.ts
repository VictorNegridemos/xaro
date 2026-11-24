// Session handling with iron-session (plan 5.6, 5.7). Fail closed: without a valid configuration
// nobody is logged in and iron-session is never called.
import { getIronSession, type CookieStore } from 'iron-session'
import { cookies } from 'next/headers'
import { redirect, unstable_rethrow } from 'next/navigation'
import { jsonError } from '../http'
import { getAuthConfig } from './config'
import { checkSameOrigin, safeNextPath } from './origin'
import { SESSION_COOKIE, isSessionValid, sessionOptions, type SessionData } from './session-options'

export { SESSION_COOKIE, SESSION_TTL_SECONDS, sessionOptions, type SessionData } from './session-options'

/** Reads the session from a cookie store and applies every rule of 5.7. Never throws. */
export async function isLoggedInWith(store: CookieStore): Promise<boolean> {
  const config = getAuthConfig()
  if (!config.ok) return false
  try {
    const session = await getIronSession<SessionData>(store, sessionOptions(config.sessionSecret))
    return isSessionValid(session, config.pw)
  } catch {
    return false
  }
}

/** Seals a logged-in session into the store. Throws when authentication is not configured. */
export async function startSessionWith(store: CookieStore): Promise<void> {
  const config = getAuthConfig()
  if (!config.ok) throw new Error(`Authentication is not configured: ${config.reason}`)
  const session = await getIronSession<SessionData>(store, sessionOptions(config.sessionSecret))
  session.isLoggedIn = true
  session.at = Math.floor(Date.now() / 1000)
  session.pw = config.pw
  await session.save()
}

/** Server components and the layout. Never throws (except Next's own control-flow signals). */
export async function isLoggedIn(): Promise<boolean> {
  if (!getAuthConfig().ok) return false
  try {
    return await isLoggedInWith(await cookies())
  } catch (error) {
    unstable_rethrow(error) // e.g. the dynamic-rendering bail-out; anything else means "logged out"
    return false
  }
}

/** First line of every mutating route handler. null = allowed; otherwise a 401/403 JSON response. */
export async function requireApiAuth(request: Request): Promise<Response | null> {
  if (!checkSameOrigin(request)) return jsonError(403, 'bad_origin')
  if (!(await isLoggedIn())) return jsonError(401, 'unauthorized')
  return null
}

/** Protected pages: redirects to /login?next=… when logged out. */
export async function requirePageAuth(nextPath: string): Promise<void> {
  if (await isLoggedIn()) return
  redirect(`/login?next=${encodeURIComponent(safeNextPath(nextPath))}`)
}

/** Login handler only. */
export async function startSession(): Promise<void> {
  await startSessionWith(await cookies())
}

export async function endSession(): Promise<void> {
  const store = await cookies()
  const config = getAuthConfig()
  if (config.ok) {
    const session = await getIronSession<SessionData>(store, sessionOptions(config.sessionSecret))
    session.destroy()
  } else {
    store.delete(SESSION_COOKIE)
  }
}
