// STUB created by Foundation (Step 1). The Auth workstream replaces the bodies (plan 5.6, 5.7);
// the exported signatures are final and may not change in Step 2.
// Fail closed: until real authentication exists nobody is logged in and nothing can be written.
import { redirect } from 'next/navigation'
import { jsonError } from '../http'

/** Server components and the layout. Never throws. */
export async function isLoggedIn(): Promise<boolean> {
  return false
}

/** First line of every mutating route handler. null = allowed; otherwise a 401/403 JSON response. */
export async function requireApiAuth(request: Request): Promise<Response | null> {
  void request
  return jsonError(401, 'unauthorized')
}

/** Protected pages: redirects to /login?next=… when logged out. */
export async function requirePageAuth(nextPath: string): Promise<void> {
  redirect(`/login?next=${encodeURIComponent(nextPath)}`)
}

/** Login handler only. */
export async function startSession(): Promise<void> {
  throw new Error('Authentication is not implemented yet (Step 2, Auth workstream).')
}

export async function endSession(): Promise<void> {
  // Nothing to end: no session can exist yet.
}
