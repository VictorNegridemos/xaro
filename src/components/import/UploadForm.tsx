'use client'
// Upload of one .txt into the import queue (plan 6.8). The file is read in the browser with File.text()
// and posted as JSON; the server stores it as pending and never calls Claude.
import { useRouter } from 'next/navigation'
import { useRef, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Field, fieldDescribedBy } from '@/components/ui/Field'
import { MAX_UPLOAD_CONTENT_BYTES } from '@/lib/import/upload-schema'
import { uploadOutcome, type UploadOutcome } from './format'
import styles from './import.module.scss'

const FIELD_ID = 'import-file'
const HINT = 'Plain text (.txt), at most 1 MiB. Uploading stores the file in the queue only.'

export interface UploadFormProps {
  /** Test hook: the initial line of the live region. */
  initialOutcome?: UploadOutcome | null
}

export function UploadForm({ initialOutcome = null }: UploadFormProps): React.JSX.Element {
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState(false)
  const [outcome, setOutcome] = useState<UploadOutcome | null>(initialOutcome)
  const fieldError = outcome?.kind === 'error' ? outcome.message : undefined

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (pending) return
    const form = event.currentTarget
    const file = input.current?.files?.[0]
    if (!file) {
      setOutcome({ kind: 'error', message: 'NO FILE SELECTED — choose a .txt file first.' })
      return
    }
    if (!/\.txt$/i.test(file.name)) {
      setOutcome({ kind: 'error', message: 'TRANSMISSION REJECTED — only .txt files can be imported.' })
      return
    }
    if (file.size > MAX_UPLOAD_CONTENT_BYTES) {
      setOutcome(uploadOutcome(413, null))
      return
    }
    setPending(true)
    setOutcome(null)
    try {
      const content = await file.text()
      const response = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ filename: file.name, content }),
      })
      const data: unknown = await response.json().catch(() => null)
      const next = uploadOutcome(response.status, data)
      setOutcome(next)
      if (next.kind !== 'error') {
        form.reset()
        router.refresh()
      }
    } catch {
      setOutcome(uploadOutcome(0, null))
    } finally {
      setPending(false)
    }
  }

  return (
    <form className={styles.uploadForm} onSubmit={onSubmit} noValidate data-upload-form="">
      <Field label="Transmission file" htmlFor={FIELD_ID} hint={HINT} error={fieldError}>
        <input
          ref={input}
          id={FIELD_ID}
          name="file"
          type="file"
          accept=".txt,text/plain"
          className={styles.fileInput}
          aria-describedby={fieldDescribedBy(FIELD_ID, { hint: true, error: fieldError !== undefined })}
          aria-invalid={fieldError !== undefined || undefined}
          disabled={pending}
        />
      </Field>
      <div className={styles.uploadActions}>
        <Button type="submit" variant="primary" pending={pending}>
          {pending ? 'Uploading' : 'Upload to queue'}
        </Button>
      </div>
      <p className={styles.uploadStatus} aria-live="polite" data-upload-outcome={outcome?.kind ?? ''}>
        {outcome && outcome.kind !== 'error' ? outcome.message : ''}
      </p>
    </form>
  )
}
