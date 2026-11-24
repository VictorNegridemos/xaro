'use client'
// Create and edit form of an entry (plan 9.3 task 1). POST /api/entries or PUT /api/entries/[id];
// the server checks the session and validates with zod. On success: go to the entry and refresh.
import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Field, fieldDescribedBy } from '@/components/ui/Field'
import { Select } from '@/components/ui/Select'
import { TextArea } from '@/components/ui/TextArea'
import { TextInput } from '@/components/ui/TextInput'
import { ENTITY_TYPE_LABELS } from '@/components/ui/TypeBadge'
import type { EntityInput, EntityType } from '@/lib/data/types'
import { MAX_BODY_CHARS, MAX_NAME_CHARS, MAX_SUMMARY_CHARS } from '@/lib/entries/limits'
import { AttributeEditor } from './AttributeEditor'
import { buildBody, initialValues, saveFailure, type EntryFormValues } from './form-state'
import styles from './EntryForm.module.scss'

const TYPES = Object.keys(ENTITY_TYPE_LABELS) as EntityType[]

export interface EntryFormProps {
  /** Present when editing. */
  entity?: EntityInput & { id: number; slug: string }
}

export function EntryForm({ entity }: EntryFormProps): React.JSX.Element {
  const router = useRouter()
  const [values, setValues] = useState<EntryFormValues>(() => initialValues(entity))
  const [fields, setFields] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const set = <K extends keyof EntryFormValues>(key: K, value: EntryFormValues[K]) => setValues((v) => ({ ...v, [key]: value }))
  const cancelHref = entity ? `/entry/${entity.slug}` : '/'

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (pending) return
    const built = buildBody(values)
    if (!built.ok) {
      setFields(built.fields)
      setMessage(saveFailure(400))
      return
    }
    setPending(true)
    setFields({})
    setMessage(null)
    try {
      const response = await fetch(entity ? `/api/entries/${entity.id}` : '/api/entries', {
        method: entity ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(built.body),
      })
      const data: unknown = await response.json().catch(() => null)
      if (response.ok && data && typeof data === 'object' && 'slug' in data && typeof data.slug === 'string') {
        router.push(`/entry/${data.slug}`)
        router.refresh()
        return // stay pending until the navigation replaces the form
      }
      if (data && typeof data === 'object' && 'fields' in data && data.fields && typeof data.fields === 'object') {
        setFields(data.fields as Record<string, string>)
      }
      setMessage(saveFailure(response.status))
    } catch {
      setMessage(saveFailure(0))
    }
    setPending(false)
  }

  const err = (key: string) => fields[key]
  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate data-entry-form="">
      <div className={styles.row}>
        <Field label="Name" htmlFor="entry-name-input" required error={err('name')} className={styles.grow}>
          <TextInput
            id="entry-name-input"
            name="name"
            value={values.name}
            onChange={(e) => set('name', e.target.value)}
            maxLength={MAX_NAME_CHARS}
            required
            invalid={Boolean(err('name'))}
            aria-describedby={fieldDescribedBy('entry-name-input', { error: Boolean(err('name')) })}
            autoComplete="off"
          />
        </Field>
        <Field label="Type" htmlFor="entry-type" error={err('type')}>
          <Select
            id="entry-type"
            name="type"
            value={values.type}
            onChange={(e) => set('type', e.target.value as EntityType)}
            invalid={Boolean(err('type'))}
            aria-describedby={fieldDescribedBy('entry-type', { error: Boolean(err('type')) })}
          >
            {TYPES.map((type) => <option key={type} value={type}>{ENTITY_TYPE_LABELS[type]}</option>)}
          </Select>
        </Field>
      </div>

      <Field label="Aliases" htmlFor="entry-aliases" hint="One per line." error={err('aliases')}>
        <TextArea
          id="entry-aliases"
          name="aliases"
          rows={2}
          value={values.aliases}
          onChange={(e) => set('aliases', e.target.value)}
          invalid={Boolean(err('aliases'))}
          aria-describedby={fieldDescribedBy('entry-aliases', { hint: true, error: Boolean(err('aliases')) })}
        />
      </Field>

      <Field label="Summary" htmlFor="entry-summary" hint={`One or two sentences, at most ${MAX_SUMMARY_CHARS} characters.`} error={err('summary')}>
        <TextArea
          id="entry-summary"
          name="summary"
          rows={2}
          value={values.summary}
          onChange={(e) => set('summary', e.target.value)}
          maxLength={MAX_SUMMARY_CHARS}
          invalid={Boolean(err('summary'))}
          aria-describedby={fieldDescribedBy('entry-summary', { hint: true, error: Boolean(err('summary')) })}
        />
      </Field>

      <Field label="Text" htmlFor="entry-body" error={err('body')}>
        <TextArea
          id="entry-body"
          name="body"
          rows={10}
          value={values.body}
          onChange={(e) => set('body', e.target.value)}
          maxLength={MAX_BODY_CHARS}
          invalid={Boolean(err('body'))}
          aria-describedby={fieldDescribedBy('entry-body', { error: Boolean(err('body')) })}
          className={styles.body}
        />
      </Field>

      <AttributeEditor rows={values.attributes} onChange={(rows) => set('attributes', rows)} error={err('attributes')} disabled={pending} />

      {err('_form') ? <p role="alert" className={styles.error}>{err('_form')}</p> : null}
      <p className={styles.message} role="status" aria-live="polite" data-entry-message="">{message ?? ''}</p>

      <div className={styles.actions}>
        <Button type="submit" variant="primary" pending={pending}>
          {pending ? 'Saving' : entity ? 'Save changes' : 'Create entry'}
        </Button>
        <Button href={cancelHref} variant="ghost">Cancel</Button>
      </div>
    </form>
  )
}
