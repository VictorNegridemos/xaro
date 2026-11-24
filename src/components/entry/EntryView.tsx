// The detail view of one entry (plan 4.3). Server component.
import type React from 'react'
import type { EntityDetail } from '@/lib/data/types'
import { Button } from '@/components/ui/Button'
import { TypeBadge } from '@/components/ui/TypeBadge'
import { entryHref } from '@/lib/search/href'
import { AttributeTable } from './AttributeTable'
import { BackButton } from './BackButton'
import { InteractiveText } from './InteractiveText'
import { RelationList } from './RelationList'
import styles from './EntryView.module.scss'

export interface EntryViewProps {
  entity: EntityDetail
  /** True when logged in: shows the Edit link. The server checks the session again on every write. */
  canEdit: boolean
  /** Further controls for logged-in users (Step 3: Delete). Rendered only when canEdit is true. */
  actions?: React.ReactNode
}

function DateStamp({ date }: { date: Date }): React.JSX.Element {
  const iso = date.toISOString()
  return <time dateTime={iso}>{iso.slice(0, 10)}</time>
}

export function EntryView({ entity, canEdit, actions }: EntryViewProps): React.JSX.Element {
  return (
    <article className={styles.entry} aria-labelledby="entry-name">
      <header className={styles.header}>
        <TypeBadge type={entity.type} />
        <h1 id="entry-name" className={styles.name}>{entity.name}</h1>
        {entity.aliases.length > 0 ? (
          <p className={styles.aliases}>
            <span className={styles.label}>Also known as</span> {entity.aliases.join(' · ')}
          </p>
        ) : null}
        {entity.summary ? (
          <p className={styles.summary}><InteractiveText text={entity.summary} entryName={entity.name} /></p>
        ) : null}
      </header>

      <AttributeTable attributes={entity.attributes} entryName={entity.name} />

      {entity.body ? (
        <div className={styles.body}><InteractiveText text={entity.body} entryName={entity.name} /></div>
      ) : null}

      <RelationList relations={entity.relations} />

      <footer className={styles.meta}>
        {entity.source ? <p><span className={styles.label}>Source:</span> {entity.source.filename}</p> : null}
        <p>
          <span className={styles.label}>Filed</span> <DateStamp date={entity.createdAt} />
          {' · '}
          <span className={styles.label}>Updated</span> <DateStamp date={entity.updatedAt} />
        </p>
      </footer>

      <div className={styles.actions}>
        <BackButton />
        {canEdit ? <Button href={`${entryHref(entity.slug)}/edit`} variant="primary">Edit</Button> : null}
        {/* entry actions: Step 3 adds Delete */}
        {canEdit ? actions : null}
      </div>
    </article>
  )
}
