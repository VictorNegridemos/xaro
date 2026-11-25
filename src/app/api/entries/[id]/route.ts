// PUT /api/entries/[id] — update; DELETE /api/entries/[id] — delete [O7]. Session required: each
// handler's first step is requireApiAuth. The slug and the legacy columns never change.
import { entryHandlers } from '@/lib/entries/routes'

type Context = { params: Promise<{ id: string }> }

export async function PUT(request: Request, { params }: Context): Promise<Response> {
  return entryHandlers.PUT(request, (await params).id)
}

export async function DELETE(request: Request, { params }: Context): Promise<Response> {
  return entryHandlers.DELETE(request, (await params).id)
}
