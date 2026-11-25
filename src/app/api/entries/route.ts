// POST /api/entries — create an entry (plan 9.3). Session required: the handler's first step is
// requireApiAuth (same-origin check, then the session); then Content-Type, size and zod.
import { entryHandlers } from '@/lib/entries/routes'

export async function POST(request: Request): Promise<Response> {
  return entryHandlers.POST(request)
}
