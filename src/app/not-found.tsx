import type { Metadata } from 'next'
import { Button } from '@/components/ui/Button'
import { StateBlock } from '@/components/ui/StateBlock'
import { FaultFrame } from '@/components/shell/FaultFrame'

export const metadata: Metadata = { title: 'Record not found — X\'aro' }

export default function NotFound() {
  return (
    <FaultFrame code="404">
      <StateBlock
        kind="empty"
        title="RECORD NOT FOUND — it may never have existed."
        action={<Button variant="primary" href="/">Return to bridge</Button>}
      >
        <p>The archive has no entry at this address. Ask X&apos;aro below, or return to the bridge.</p>
      </StateBlock>
    </FaultFrame>
  )
}
