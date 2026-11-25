import type React from 'react'
import type { EntityAttributes } from '@/lib/data/types'
import { InteractiveText } from './InteractiveText'
import { humanizeKey } from './interactive-text'
import styles from './EntryView.module.scss'

export interface AttributeTableProps {
  attributes: EntityAttributes
  entryName?: string
}

/** Key/value table; keys are humanised (`crew_rank` -> "Crew rank"), values are interactive text. */
export function AttributeTable({ attributes, entryName }: AttributeTableProps): React.JSX.Element | null {
  const rows = Object.entries(attributes).filter(([, value]) => typeof value === 'string' && value.trim() !== '')
  if (rows.length === 0) return null
  return (
    <table className={styles.attributes}>
      <caption className={styles.sectionTitle}>Attributes</caption>
      <tbody>
        {rows.map(([key, value]) => (
          <tr key={key}>
            <th scope="row">{humanizeKey(key)}</th>
            <td><InteractiveText text={value} entryName={entryName} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
