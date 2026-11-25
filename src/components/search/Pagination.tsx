import type React from 'react'
import { Button } from '@/components/ui/Button'
import type { SearchResponse } from '@/lib/search/schema'
import { pageLinks } from './search-text'
import styles from './SearchResults.module.scss'

export interface PaginationProps {
  response: Pick<SearchResponse, 'q' | 'type' | 'page' | 'pageSize' | 'total'>
}

/** Previous / Next links; nothing when everything fits on one page. */
export function Pagination({ response }: PaginationProps): React.JSX.Element | null {
  const { pageCount, prev, next } = pageLinks(response)
  if (pageCount <= 1 && response.page <= 1) return null
  return (
    <nav className={styles.pagination} aria-label="Result pages">
      {prev ? <Button href={prev} prefetch={false}>Previous</Button> : <span />}
      <span className={styles.pageInfo}>Page {response.page} of {pageCount}</span>
      {next ? <Button href={next} prefetch={false}>Next</Button> : <span />}
    </nav>
  )
}
