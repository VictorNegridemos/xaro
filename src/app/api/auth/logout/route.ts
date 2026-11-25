// POST /api/auth/logout — destroys the session. Same-origin check only (plan 5.8).
import { checkSameOrigin } from '@/lib/auth/origin'
import { endSession } from '@/lib/auth/session'
import { jsonError } from '@/lib/http'

export async function POST(request: Request): Promise<Response> {
  if (!checkSameOrigin(request)) return jsonError(403, 'bad_origin')
  await endSession()
  return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
}
