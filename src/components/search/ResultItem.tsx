import Link from 'next/link'
import type React from 'react'
import { Highlight } from '@/components/ui/Highlight'
import { TypeBadge } from '@/components/ui/TypeBadge'
import { entryHref } from '@/lib/search/href'
import type { SearchResult } from '@/lib/search/schema'
import styles from './SearchResults.module.scss'

export interface ResultItemProps {
  result: SearchResult
}

/** One result: a single large link with type badge, name and the highlighted snippet. */
export function ResultItem({ result }: ResultItemProps): React.JSX.Element {
  return (
    <li className={styles.item}>
      <Link href={entryHref(result.slug)} className={styles.link} prefetch={false}>
        <span className={styles.itemHead}>
          <TypeBadge type={result.type} />
          <span className={styles.itemName}>{result.name}</span>
        </span>
        {result.snippet.length > 0 ? (
          <span className={styles.snippet}><Highlight segments={result.snippet} /></span>
        ) : result.summary ? (
          <span className={styles.snippet}>{result.summary}</span>
        ) : null}
      </Link>
    </li>
  )
}
