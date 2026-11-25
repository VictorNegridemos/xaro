// Small helpers shared by the route handlers. FROZEN in Step 2.

/** JSON error response: { error: code, ...extra }. Never cached. */
export function jsonError(
  status: number, code: string, extra: Record<string, unknown> = {}, headers: Record<string, string> = {},
): Response {
  return Response.json({ error: code, ...extra }, { status, headers: { 'Cache-Control': 'no-store', ...headers } })
}

export type JsonBodyResult = { ok: true; data: unknown } | { ok: false; response: Response }

/**
 * Reads a JSON request body of at most `limit` bytes.
 * 415 unsupported_media_type — Content-Type is not application/json
 * 413 payload_too_large      — Content-Length or the actual body exceeds the limit (rejected before parsing)
 * 400 invalid_json           — the body is empty or not JSON
 */
export async function readJsonBody(request: Request, limit: number): Promise<JsonBodyResult> {
  const contentType = (request.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase()
  if (contentType !== 'application/json') {
    return { ok: false, response: jsonError(415, 'unsupported_media_type') }
  }
  const declared = Number(request.headers.get('content-length') ?? '')
  if (Number.isFinite(declared) && declared > limit) {
    return { ok: false, response: jsonError(413, 'payload_too_large', { limit }) }
  }

  const chunks: Uint8Array[] = []
  let size = 0
  if (request.body) {
    const reader = request.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit) {
        await reader.cancel().catch(() => {})
        return { ok: false, response: jsonError(413, 'payload_too_large', { limit }) }
      }
      chunks.push(value)
    }
  }
  const text = new TextDecoder('utf-8').decode(Buffer.concat(chunks))
  if (text.trim() === '') return { ok: false, response: jsonError(400, 'invalid_json') }
  try {
    return { ok: true, data: JSON.parse(text) as unknown }
  } catch {
    return { ok: false, response: jsonError(400, 'invalid_json') }
  }
}

/** A positive integer id from a route segment (1 to 9 digits), or null. */
export function parseId(value: string | undefined): number | null {
  if (value === undefined || !/^\d{1,9}$/.test(value)) return null
  const id = Number(value)
  return id > 0 ? id : null
}
