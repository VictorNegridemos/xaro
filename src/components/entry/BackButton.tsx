'use client'

import { useRouter } from 'next/navigation'
import type React from 'react'
import { Button } from '@/components/ui/Button'

/** Back in history; when the page was opened directly there is nothing to go back to, so go home. */
export function BackButton(): React.JSX.Element {
  const router = useRouter()
  return (
    <Button
      onClick={() => {
        if (window.history.length > 1) router.back()
        else router.push('/')
      }}
    >
      Back
    </Button>
  )
}
