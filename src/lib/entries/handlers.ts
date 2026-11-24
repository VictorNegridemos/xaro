// Route handler logic for POST /api/entries, PUT and DELETE /api/entries/[id] (plan 9.3, 5.8). The
// route files bind these to requireApiAuth and the data layer, so the handlers are tested with doubles.
import { jsonError, parseId, readJsonBody } from '../http'
import type { EntityInput } from '../data/types'
import { MAX_ENTRY_REQUEST_BYTES } from './limits'
import { checkEntry } from './schema'

export interface EntryDeps {
  /** requireApiAuth: null = allowed, otherwise the 401/403 response. Always called first. */
  requireAuth: (request: Request) => Promise<Response | null>
  create: (input: EntityInput) => Promise<{ id: number; slug: string }>
  update: (id: number, input: EntityInput) => Promise<{ id: number; slug: string } | null>
  remove: (id: number) => Promise<boolean>
  /** revalidatePath('/', 'layout') */
  revalidate: () => void
  logError?: (message: string) => void
}

const noStore = { 'Cache-Control': 'no-store' }

function failure(deps: EntryDeps, what: string, error: unknown): Response {
  deps.logError?.(`entry ${what} failed: ${error instanceof Error ? error.name : 'error'}`)
  return jsonError(503, 'database_unavailable')
}

async function readEntry(request: Request): Promise<{ ok: true; input: EntityInput } | { ok: false; response: Response }> {
  const body = await readJsonBody(request, MAX_ENTRY_REQUEST_BYTES)
  if (!body.ok) return body
  const check = checkEntry(body.data)
  if (!check.ok) return { ok: false, response: jsonError(400, 'invalid_body', { fields: check.fields }) }
  return check
}

export function createEntryHandlers(deps: EntryDeps) {
  async function POST(request: Request): Promise<Response> {
    const denied = await deps.requireAuth(request)
    if (denied) return denied
    const entry = await readEntry(request)
    if (!entry.ok) return entry.response
    try {
      const created = await deps.create(entry.input)
      deps.revalidate()
      return Response.json(created, { status: 201, headers: noStore })
    } catch (error) {
      return failure(deps, 'create', error)
    }
  }

  async function PUT(request: Request, idParam: string | undefined): Promise<Response> {
    const denied = await deps.requireAuth(request)
    if (denied) return denied
    const id = parseId(idParam)
    if (id === null) return jsonError(404, 'not_found')
    const entry = await readEntry(request)
    if (!entry.ok) return entry.response
    try {
      const updated = await deps.update(id, entry.input)
      if (updated === null) return jsonError(404, 'not_found')
      deps.revalidate()
      return Response.json(updated, { headers: noStore })
    } catch (error) {
      return failure(deps, 'update', error)
    }
  }

  async function DELETE(request: Request, idParam: string | undefined): Promise<Response> {
    const denied = await deps.requireAuth(request)
    if (denied) return denied
    const id = parseId(idParam)
    if (id === null) return jsonError(404, 'not_found')
    try {
      if (!(await deps.remove(id))) return jsonError(404, 'not_found')
      deps.revalidate()
      return Response.json({ deleted: true, id }, { headers: noStore })
    } catch (error) {
      return failure(deps, 'delete', error)
    }
  }

  return { POST, PUT, DELETE }
}
