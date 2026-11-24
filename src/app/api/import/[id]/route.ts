// DELETE /api/import/[id] — removes a queued source while it is pending or failed (409 otherwise).
import { revalidatePath } from 'next/cache'
import { requireApiAuth } from '@/lib/auth/session'
import { deleteQueuedImportSource } from '@/lib/data/imports'
import { createDeleteHandler } from '@/lib/import/handlers'
import { getImportSourceStatus } from '@/lib/import/queue'

const handle = createDeleteHandler({
  requireAuth: requireApiAuth,
  deleteQueued: (id) => deleteQueuedImportSource(id),
  statusOf: (id) => getImportSourceStatus(id),
  revalidate: () => revalidatePath('/import'),
  logError: (message) => console.error(message),
})

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params
  return handle(request, id)
}
