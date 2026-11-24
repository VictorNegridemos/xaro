// The results list of /search (plan 4.3). Server component; the state lives in the URL only.
import Link from 'next/link'
import type React from 'react'
import { Button } from '@/components/ui/Button'
import { StateBlock } from '@/components/ui/StateBlock'
import { ENTITY_TYPE_LABELS } from '@/components/ui/TypeBadge'
import { entryHref, searchHref } from '@/lib/search/href'
import type { SearchResponse } from '@/lib/search/schema'
import { Pagination } from './Pagination'
import { ResultItem } from './ResultItem'
import { TypeFilter } from './TypeFilter'
import { countLine } from './search-text'
import styles from './SearchResults.module.scss'

export interface SearchResultsProps {
  response: SearchResponse
}

function Suggestions({ response }: SearchResultsProps): React.JSX.Element | null {
  if (response.suggestions.length === 0) return null
  return (
    <p className={styles.suggestions}>
      Closest known designations:{' '}
      {response.suggestions.map((s, i) => (
        <span key={s.slug}>
          {i > 0 ? ', ' : null}
          <Link href={entryHref(s.slug)} prefetch={false} className={styles.suggestion}>{s.name}</Link>
        </span>
      ))}
    </p>
  )
}

export function SearchResults({ response }: SearchResultsProps): React.JSX.Element {
  const { q, type, results, total } = response
  const pastTheEnd = results.length === 0 && total > 0

  return (
    <section className={styles.results} aria-labelledby="search-heading">
      <h1 id="search-heading" className={styles.heading}>Query result</h1>
      <p className={styles.count} role="status" aria-live="polite">{countLine(response, ENTITY_TYPE_LABELS)}</p>

      {total > 0 || type !== null ? <TypeFilter response={response} /> : null}

      {results.length > 0 ? (
        <ol className={styles.list}>
          {results.map((result) => <ResultItem key={result.id} result={result} />)}
        </ol>
      ) : pastTheEnd ? (
        <StateBlock
          kind="empty"
          title="END OF TRANSMISSION — there are no more signals on this page."
          action={<Button href={searchHref({ q, type })}>First page</Button>}
        />
      ) : (
        <StateBlock kind="empty" title={`NO SIGNAL — the archive holds nothing for ‘${q}’${type ? ` in ${ENTITY_TYPE_LABELS[type]}` : ''}.`}>
          <p>Check the spelling, use fewer words, or try a name, a place or a system.</p>
          <Suggestions response={response} />
          {type ? <p><Link href={searchHref({ q })} className={styles.suggestion}>Search every type</Link></p> : null}
        </StateBlock>
      )}

      {pastTheEnd ? null : <Pagination response={response} />}
    </section>
  )
}
