'use client'
// Remove a pending or failed source from the queue (DELETE /api/import/[id]).
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import styles from './import.module.scss'

export interface RemoveSourceButtonProps { id: number; filename: string }

export function RemoveSourceButton({ id, filename }: RemoveSourceButtonProps): React.JSX.Element {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function remove(): Promise<void> {
    if (pending) return
    setPending(true)
    setError(null)
    try {
      const response = await fetch(`/api/import/${id}`, { method: 'DELETE', credentials: 'same-origin' })
      if (response.ok || response.status === 404) {
        router.refresh()
        return
      }
      setError(response.status === 409
        ? 'Not removed — the source is no longer pending or failed.'
        : response.status === 401 || response.status === 403
          ? 'Not removed — log in again.'
          : 'Not removed — the archive did not answer.')
    } catch {
      setError('Not removed — no connection.')
    } finally {
      setPending(false)
    }
  }

  return (
    <span className={styles.remove}>
      <Button variant="danger" size="sm" pending={pending} onClick={remove} aria-label={`Remove ${filename} from the queue`}>
        Remove
      </Button>
      {error ? <span role="alert" className={styles.removeError}>{error}</span> : null}
    </span>
  )
}
