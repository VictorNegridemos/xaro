// Route handler logic for POST /api/import and DELETE /api/import/[id] (plan 6.8, 5.8). The route files
// only bind these to the real auth check and data layer, so the handlers are tested with doubles.
// The upload only stores the text; it never calls Claude.
import { jsonError, parseId, readJsonBody } from '../http'
import type { ImportSourceSummary, ImportStatus } from '../data/types'
import { MAX_UPLOAD_REQUEST_BYTES, checkUpload } from './upload-schema'

export interface UploadDeps {
  /** requireApiAuth from src/lib/auth/session.ts: null = allowed, otherwise the 401/403 response. */
  requireAuth: (request: Request) => Promise<Response | null>
  enqueue: (input: { filename: string; content: string; origin: 'upload' }) => Promise<{ source: ImportSourceSummary; created: boolean }>
  revalidate: () => void
  logError?: (message: string) => void
}

export interface DeleteDeps {
  requireAuth: (request: Request) => Promise<Response | null>
  /** Removes the row only while it is pending or failed. */
  deleteQueued: (id: number) => Promise<boolean>
  /** The current status, or null when the row does not exist. */
  statusOf: (id: number) => Promise<ImportStatus | null>
  revalidate: () => void
  logError?: (message: string) => void
}

const noStore = { 'Cache-Control': 'no-store' }

export function createUploadHandler(deps: UploadDeps) {
  return async function POST(request: Request): Promise<Response> {
    const denied = await deps.requireAuth(request)
    if (denied) return denied

    const body = await readJsonBody(request, MAX_UPLOAD_REQUEST_BYTES)
    if (!body.ok) return body.response
    const check = checkUpload(body.data)
    if (!check.ok) return jsonError(check.status, check.code, { fields: check.fields })

    try {
      const { source, created } = await deps.enqueue({ filename: check.filename, content: check.content, origin: 'upload' })
      deps.revalidate()
      return Response.json({ created, source }, { status: created ? 201 : 200, headers: noStore })
    } catch (error) {
      deps.logError?.(`import upload failed: ${error instanceof Error ? error.name : 'error'}`)
      return jsonError(503, 'database_unavailable')
    }
  }
}

export function createDeleteHandler(deps: DeleteDeps) {
  return async function DELETE(request: Request, idParam: string | undefined): Promise<Response> {
    const denied = await deps.requireAuth(request)
    if (denied) return denied

    const id = parseId(idParam)
    if (id === null) return jsonError(404, 'not_found')
    try {
      if (await deps.deleteQueued(id)) {
        deps.revalidate()
        return Response.json({ deleted: true, id }, { headers: noStore })
      }
      const status = await deps.statusOf(id)
      if (status === null) return jsonError(404, 'not_found')
      return jsonError(409, 'not_removable', { status })
    } catch (error) {
      deps.logError?.(`import delete failed: ${error instanceof Error ? error.name : 'error'}`)
      return jsonError(503, 'database_unavailable')
    }
  }
}
