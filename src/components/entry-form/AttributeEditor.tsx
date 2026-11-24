'use client'
// Attributes as key/value rows (plan 9.3, M23). Every stored attribute is shown with its stored string,
// so saving an unchanged entry sends the same attributes back.
import { Button } from '@/components/ui/Button'
import { TextInput } from '@/components/ui/TextInput'
import { ATTRIBUTE_KEY_PATTERN, MAX_ATTRIBUTES, MAX_ATTRIBUTE_VALUE_CHARS } from '@/lib/entries/limits'
import type { AttributeRow } from './form-state'
import styles from './EntryForm.module.scss'

export interface AttributeEditorProps {
  rows: AttributeRow[]
  onChange: (rows: AttributeRow[]) => void
  error?: string
  disabled?: boolean
}

export function AttributeEditor({ rows, onChange, error, disabled }: AttributeEditorProps): React.JSX.Element {
  const update = (id: number, patch: Partial<AttributeRow>) => onChange(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)))
  const add = () => onChange([...rows, { id: Math.max(0, ...rows.map((row) => row.id)) + 1, key: '', value: '' }])
  const remove = (id: number) => onChange(rows.filter((row) => row.id !== id))

  return (
    <fieldset className={styles.attributes} aria-describedby={error ? 'entry-attributes-error' : 'entry-attributes-hint'} disabled={disabled}>
      <legend className={styles.legend}>Attributes</legend>
      <p id="entry-attributes-hint" className={styles.hint}>
        Keys: lower-case letters, digits and _ (for example <code>crew_rank</code>). Values are text. At most {MAX_ATTRIBUTES}.
      </p>
      {rows.length === 0 ? <p className={styles.none}>No attributes.</p> : null}
      <ul className={styles.attributeRows}>
        {rows.map((row, index) => (
          <li key={row.id} className={styles.attributeRow} data-attribute-row="">
            <TextInput
              aria-label={`Key ${index + 1}`}
              name={`attr-key-${row.id}`}
              value={row.key}
              onChange={(event) => update(row.id, { key: event.target.value })}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              maxLength={40}
              invalid={row.key !== '' && !ATTRIBUTE_KEY_PATTERN.test(row.key.trim())}
              className={styles.attributeKey}
            />
            <TextInput
              aria-label={`Value ${index + 1}`}
              name={`attr-value-${row.id}`}
              value={row.value}
              onChange={(event) => update(row.id, { value: event.target.value })}
              maxLength={MAX_ATTRIBUTE_VALUE_CHARS}
              className={styles.attributeValue}
            />
            <Button variant="ghost" size="sm" onClick={() => remove(row.id)} aria-label={`Remove attribute ${row.key || index + 1}`}>
              Remove
            </Button>
          </li>
        ))}
      </ul>
      {error ? <p id="entry-attributes-error" role="alert" className={styles.error}>{error}</p> : null}
      <div>
        <Button variant="ghost" size="sm" onClick={add} disabled={rows.length >= MAX_ATTRIBUTES}>Add attribute</Button>
      </div>
    </fieldset>
  )
}
