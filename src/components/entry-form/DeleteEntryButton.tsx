'use client'
// Login-protected Delete of an entry [O7]: danger button, native <dialog> confirmation naming the entry,
// DELETE /api/entries/[id]. The server checks the session; relations go with the entry (ON DELETE CASCADE).
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import styles from './EntryForm.module.scss'

export interface DeleteEntryButtonProps { id: number; name: string }

export function DeleteEntryButton({ id, name }: DeleteEntryButtonProps): React.JSX.Element {
  const router = useRouter()
  const dialog = useRef<HTMLDialogElement>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirmDelete(): Promise<void> {
    if (pending) return
    setPending(true)
    setError(null)
    try {
      const response = await fetch(`/api/entries/${id}`, { method: 'DELETE', credentials: 'same-origin' })
      if (response.ok || response.status === 404) {
        dialog.current?.close()
        router.push('/')
        router.refresh()
        return
      }
      setError(response.status === 401 || response.status === 403
        ? 'ACCESS DENIED — log in again. Nothing was deleted.'
        : 'ARCHIVE UNREACHABLE — nothing was deleted.')
    } catch {
      setError('NO CONNECTION — nothing was deleted.')
    }
    setPending(false)
  }

  return (
    <>
      <Button variant="danger" onClick={() => { setError(null); dialog.current?.showModal() }}>Delete</Button>
      <dialog ref={dialog} className={styles.dialog} aria-labelledby={`delete-${id}-title`}>
        <h2 id={`delete-${id}-title`} className={styles.dialogTitle}>Purge entry?</h2>
        <p>
          <strong>{name}</strong> will be removed from the archive, together with its links to other entries.
          This cannot be undone.
        </p>
        {error ? <p role="alert" className={styles.error}>{error}</p> : null}
        <div className={styles.actions}>
          <Button variant="danger" pending={pending} onClick={() => void confirmDelete()}>
            {pending ? 'Deleting' : `Delete ${name}`}
          </Button>
          <Button variant="ghost" onClick={() => dialog.current?.close()} disabled={pending}>Cancel</Button>
        </div>
      </dialog>
    </>
  )
}
