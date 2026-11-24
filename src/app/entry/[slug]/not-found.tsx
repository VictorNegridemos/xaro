import type { Metadata } from 'next'
import type React from 'react'
import { Button } from '@/components/ui/Button'
import { StateBlock } from '@/components/ui/StateBlock'
import { PageFrame } from '@/components/shell/PageFrame'

// Same title and heading code as the root not-found page (src/app/not-found.tsx).
export const metadata: Metadata = { title: 'Record not found — X\'aro' }

export default function EntryNotFound(): React.JSX.Element {
  return (
    <PageFrame width="measure">
      <StateBlock
        kind="empty"
        title="RECORD NOT FOUND — the archive holds no entry under that designation."
        action={<Button href="/search">Search the archive</Button>}
      >
        <p>It may have been renamed, purged, or never filed.</p>
      </StateBlock>
    </PageFrame>
  )
}
