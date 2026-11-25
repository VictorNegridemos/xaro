'use client'
// Refresh button for the queue, plus an automatic refresh when the window regains focus. No polling.
import { useRouter } from 'next/navigation'
import { useEffect, useTransition } from 'react'
import { Button } from '@/components/ui/Button'

export function QueueRefresh(): React.JSX.Element {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    const onFocus = () => startTransition(() => router.refresh())
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [router])

  return (
    <Button variant="ghost" size="sm" pending={pending} onClick={() => startTransition(() => router.refresh())}>
      Refresh
    </Button>
  )
}
