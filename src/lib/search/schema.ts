// Shared search types (plan 4.2 "Response shape"). Types only in Step 1; the Search workstream
// owns this file in Step 2 and adds the zod schema for the query string.
import type { EntityType } from '../data/types'

/** One piece of a snippet; h = highlighted (rendered as <mark>). Never HTML. */
export interface SnippetSegment {
  t: string
  h: boolean
}

export interface SearchResult {
  id: number
  type: EntityType
  name: string
  slug: string
  summary: string
  score: number
  snippet: SnippetSegment[]
}

export interface SearchSuggestion {
  name: string
  slug: string
}

export interface SearchResponse {
  q: string
  type: EntityType | null
  page: number
  pageSize: number
  total: number
  facets: Partial<Record<EntityType, number>>
  results: SearchResult[]
  suggestions: SearchSuggestion[]
}
