// Same-origin check for non-GET requests and validation of the post-login target (plan 5.8, 5.10). Pure.

const firstValue = (value: string | null): string => (value ?? '').split(',')[0]?.trim().toLowerCase() ?? ''

/**
 * true when the request comes from the site itself: an Origin header is present and its host equals the
 * request host (x-forwarded-host, else host); if Sec-Fetch-Site is present it must be "same-origin".
 */
export function checkSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin')
  if (!origin) return false
  let originHost: string
  try {
    const url = new URL(origin)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
    originHost = url.host.toLowerCase()
  } catch {
    return false
  }
  const requestHost = firstValue(request.headers.get('x-forwarded-host')) || firstValue(request.headers.get('host'))
  if (!requestHost || originHost !== requestHost) return false
  const fetchSite = request.headers.get('sec-fetch-site')
  if (fetchSite !== null && fetchSite.trim().toLowerCase() !== 'same-origin') return false
  return true
}

/**
 * A path on this site to go to after login. Accepts only values that start with a single "/", contain
 * no "//", "\" or control characters and are at most 200 characters long. Everything else becomes "/".
 */
export function safeNextPath(value: unknown): string {
  if (typeof value !== 'string') return '/'
  if (value.length === 0 || value.length > 200) return '/'
  if (!value.startsWith('/') || value.includes('//') || value.includes('\\')) return '/'
  if (/[\u0000-\u001f\u007f-\u009f]/.test(value)) return '/'
  return value
}
