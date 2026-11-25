'use client'

import { Button } from '@/components/ui/Button'
import { StateBlock } from '@/components/ui/StateBlock'
import { FaultFrame } from '@/components/shell/FaultFrame'

// Route error boundary: rendered inside the shell, so navigation still works.
export default function RouteError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <FaultFrame code={error.digest ? `FAULT ${error.digest.slice(0, 8)}` : 'FAULT'}>
      <StateBlock
        kind="error"
        title="FAULT — subsystem did not respond. Retry?"
        action={(
          <>
            <Button variant="primary" onClick={() => retry()}>Retry</Button>
            <Button variant="ghost" href="/">Return to bridge</Button>
          </>
        )}
      >
        <p>The request was lost somewhere in the hull. Nothing was changed.</p>
      </StateBlock>
    </FaultFrame>
  )
}
