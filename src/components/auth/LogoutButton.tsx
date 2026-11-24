'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'

/**
 * Ghost button for the shell nav (plan 5.11): posts to /api/auth/logout, then refreshes the route so the
 * server renders the logged-out UI. The shell renders it only when logged in.
 */
export function LogoutButton(): React.JSX.Element | null {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)

  async function logout(): Promise<void> {
    if (pending) return
    setPending(true)
    setFailed(false)
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' })
      if (!response.ok) throw new Error(`logout failed: ${response.status}`)
      router.refresh()
    } catch {
      setFailed(true)
    } finally {
      setPending(false)
    }
  }

  return (
    <Button variant="ghost" pending={pending} onClick={() => void logout()} data-logout="">
      {failed ? 'Logout failed — retry' : 'Logout'}
    </Button>
  )
}
