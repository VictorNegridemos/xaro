// POST /api/import — stores an uploaded .txt as a pending import source (plan 6.8). Session required
// (requireApiAuth: same-origin check, then the session). Never calls Claude: the queue is processed by
// `npm run import -- --pending` on the owner's PC.
import { revalidatePath } from 'next/cache'
import { requireApiAuth } from '@/lib/auth/session'
import { enqueueImportSource } from '@/lib/data/imports'
import { createUploadHandler } from '@/lib/import/handlers'

export const POST = createUploadHandler({
  requireAuth: requireApiAuth,
  enqueue: (input) => enqueueImportSource(input),
  revalidate: () => revalidatePath('/import'),
  logError: (message) => console.error(message),
})
