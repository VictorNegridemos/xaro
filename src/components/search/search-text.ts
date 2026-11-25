// Pure text and URL helpers of the results page (plan 4.3), shared by the components and the test.
import type { EntityType } from '../../lib/data/types'
import { ENTITY_TYPES } from '../../lib/db/schema'
import type { SearchResponse } from '../../lib/search/schema'
import { MAX_PAGE } from '../../lib/search/schema'
import { searchHref } from '../../lib/search/href'

/** ENTITY_TYPE_LABELS of components/ui/TypeBadge, passed in so that this module stays free of styles. */
export type TypeLabels = Readonly<Record<EntityType, string>>

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** The count line, e.g. "7 signals for 'warp'" or "8 entries filed as Ship system". */
export function countLine(response: Pick<SearchResponse, 'q' | 'type' | 'total'>, labels: TypeLabels): string {
  const { q, type, total } = response
  if (q === '') return type ? `${plural(total, 'entry', 'entries')} filed as ${labels[type]}` : ''
  const base = `${plural(total, 'signal', 'signals')} for ‘${q}’`
  return type ? `${base} in ${labels[type]}` : base
}

export interface FilterChip {
  key: string
  label: string
  count: number
  href: string
  active: boolean
}

/**
 * "All" (only with a query) and one chip per type that has hits, in the order of ENTITY_TYPES.
 * The active type is always shown, even with no hit. Every chip keeps `q` and resets the page.
 */
export function filterChips(response: Pick<SearchResponse, 'q' | 'type' | 'facets'>, labels: TypeLabels): FilterChip[] {
  const { q, type, facets } = response
  const chips: FilterChip[] = []
  if (q !== '') {
    const all = Object.values(facets).reduce((sum, n) => sum + n, 0)
    chips.push({ key: 'all', label: 'All', count: all, href: searchHref({ q }), active: type === null })
  }
  for (const t of ENTITY_TYPES as readonly EntityType[]) {
    const count = facets[t] ?? 0
    if (count === 0 && t !== type) continue
    chips.push({ key: t, label: labels[t], count, href: searchHref({ q, type: t }), active: t === type })
  }
  return chips
}

export interface PageLinks {
  pageCount: number
  prev: string | null
  next: string | null
}

export function pageLinks(response: Pick<SearchResponse, 'q' | 'type' | 'page' | 'pageSize' | 'total'>): PageLinks {
  const { q, type, page, pageSize, total } = response
  const pageCount = Math.min(MAX_PAGE, Math.max(1, Math.ceil(total / pageSize)))
  return {
    pageCount,
    prev: page > 1 ? searchHref({ q, type, page: Math.min(page - 1, pageCount) }) : null,
    next: page < pageCount ? searchHref({ q, type, page: page + 1 }) : null,
  }
}
