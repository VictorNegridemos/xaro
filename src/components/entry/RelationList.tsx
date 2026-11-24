import Link from 'next/link'
import type React from 'react'
import type { RelatedEntity } from '@/lib/data/types'
import { entryHref } from '@/lib/search/href'
import { TypeBadge } from '@/components/ui/TypeBadge'
import { humanizeKey } from './interactive-text'
import styles from './EntryView.module.scss'

export interface RelationListProps {
  relations: readonly RelatedEntity[]
}

/** Related entities grouped by kind; each is a link, with its direction and note. */
export function RelationList({ relations }: RelationListProps): React.JSX.Element | null {
  if (relations.length === 0) return null
  const groups = new Map<string, RelatedEntity[]>()
  for (const relation of relations) {
    const group = groups.get(relation.kind)
    if (group) group.push(relation)
    else groups.set(relation.kind, [relation])
  }
  return (
    <section className={styles.relations} aria-labelledby="entry-relations">
      <h2 id="entry-relations" className={styles.sectionTitle}>Linked entries</h2>
      {[...groups.entries()].map(([kind, items]) => (
        <div key={kind} className={styles.relationGroup}>
          <h3 className={styles.relationKind}>{humanizeKey(kind)}</h3>
          <ul className={styles.relationItems}>
            {items.map((item) => (
              <li key={`${item.direction}-${item.id}`}>
                <Link href={entryHref(item.slug)} className={styles.relationLink}>
                  <TypeBadge type={item.type} />
                  <span className={styles.relationName}>{item.name}</span>
                  <span className={styles.relationDirection}>
                    {item.direction === 'out' ? 'outbound link' : 'inbound link'}
                  </span>
                </Link>
                {item.note ? <p className={styles.relationNote}>{item.note}</p> : null}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}
