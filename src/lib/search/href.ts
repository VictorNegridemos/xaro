// URLs of the search page. Pure: used by server components and by tests.
import type { EntityType } from '../data/types'

export interface SearchHrefParams {
  q?: string
  type?: EntityType | null
  page?: number
}

/** `/search?q=…&type=…&page=…`; every value goes through encodeURIComponent, defaults are left out. */
export function searchHref({ q = '', type = null, page = 1 }: SearchHrefParams): string {
  const parts: string[] = []
  if (q !== '') parts.push(`q=${encodeURIComponent(q)}`)
  if (type) parts.push(`type=${encodeURIComponent(type)}`)
  if (page > 1) parts.push(`page=${encodeURIComponent(String(page))}`)
  return parts.length ? `/search?${parts.join('&')}` : '/search'
}

export function entryHref(slug: string): string {
  return `/entry/${encodeURIComponent(slug)}`
}
