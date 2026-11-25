// The error line of the login form, in the voice of the ship's computer (plan 5.11). Pure.

function waitText(seconds: number): string {
  if (seconds < 60) return `${seconds} second${seconds === 1 ? '' : 's'}`
  const minutes = Math.ceil(seconds / 60)
  return `${minutes} minute${minutes === 1 ? '' : 's'}`
}

function retrySeconds(body: unknown, retryAfterHeader: string | null | undefined): number | null {
  const fromBody = body && typeof body === 'object' && 'retryAfter' in body ? Number(body.retryAfter) : Number.NaN
  const value = Number.isFinite(fromBody) ? fromBody : Number(retryAfterHeader ?? Number.NaN)
  return Number.isFinite(value) && value > 0 ? Math.ceil(value) : null
}

/** status 0 = the request never reached the server. */
export function loginErrorMessage(status: number, body: unknown, retryAfterHeader?: string | null): string {
  const code = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string' ? body.error : ''
  if (status === 401) return 'ACCESS DENIED — access code not recognised.'
  if (status === 429) {
    const seconds = retrySeconds(body, retryAfterHeader)
    return seconds === null
      ? 'LOCKOUT — too many attempts. Try again later.'
      : `LOCKOUT — too many attempts. Try again in ${waitText(seconds)}.`
  }
  if (status === 503 && code === 'auth_not_configured') return 'AUTH OFFLINE — Authentication is not configured on this deployment.'
  if (status === 503) return 'SYSTEM FAULT — the archive is unreachable. Try again shortly.'
  if (status === 400 || status === 413) return 'INPUT REJECTED — enter the access code.'
  if (status === 0) return 'NO SIGNAL — the request did not reach the ship. Check the connection.'
  return 'SYSTEM FAULT — login failed. Try again.'
}
