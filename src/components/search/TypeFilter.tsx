import Link from 'next/link'
import type React from 'react'
import { ENTITY_TYPE_LABELS } from '@/components/ui/TypeBadge'
import type { SearchResponse } from '@/lib/search/schema'
import { filterChips } from './search-text'
import styles from './SearchResults.module.scss'

export interface TypeFilterProps {
  response: Pick<SearchResponse, 'q' | 'type' | 'facets'>
}

/** Row of link chips ("All 7", "Ship system 2", …). State lives in the URL only. */
export function TypeFilter({ response }: TypeFilterProps): React.JSX.Element | null {
  const chips = filterChips(response, ENTITY_TYPE_LABELS)
  if (chips.length === 0) return null
  return (
    <nav className={styles.filter} aria-label="Filter by type">
      <ul className={styles.chips}>
        {chips.map((chip) => (
          <li key={chip.key}>
            <Link
              href={chip.href}
              prefetch={false}
              className={styles.chip}
              aria-current={chip.active ? 'page' : undefined}
              data-active={chip.active ? '' : undefined}
            >
              <span>{chip.label}</span>
              <span className={styles.chipCount}>{chip.count}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
