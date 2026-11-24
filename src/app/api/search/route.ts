import { NextResponse } from 'next/server';

// Step 1 only: the old POST search, answered from the new tables by a temporary ILIKE search.
// The Search workstream replaces this file with GET /api/search (plan 4).
import { legacySearch, type LegacySearchGroup } from "@/components/legacy/adapters";

export async function POST(request: Request) {
    const body = await request.json().catch(() => null) as { keyword?: unknown } | null;

    let searchResults: LegacySearchGroup[] = [];
    if(body && typeof body.keyword === 'string' && body.keyword.length && body.keyword.length <= 200) {
        searchResults = await legacySearch(body.keyword);
    }

    return NextResponse.json(searchResults);
}
