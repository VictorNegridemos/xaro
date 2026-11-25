// GET /api/search?q=&type=&page= — public, read-only (plan 4). Replaces the legacy POST handler.
import { jsonError } from '@/lib/http'
import { search } from '@/lib/search/query'
import { SearchInputError, type SearchResponse } from '@/lib/search/schema'

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams
  let response: SearchResponse
  try {
    response = await search({
      q: params.get('q') ?? undefined,
      type: params.get('type') ?? undefined,
      page: params.get('page') ?? undefined,
    })
  } catch (error) {
    if (error instanceof SearchInputError) return jsonError(400, error.code)
    // Never echo the error: it could carry connection details.
    console.error(`GET /api/search failed: ${error instanceof Error ? error.name : 'unknown error'}`)
    return jsonError(500, 'search_failed')
  }
  return Response.json(response, { headers: { 'Cache-Control': 'no-store' } })
}
