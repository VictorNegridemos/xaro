'use client'

import { FaultFrame } from '@/components/shell/FaultFrame'
import { Button } from '@/components/ui/Button'
import { StateBlock } from '@/components/ui/StateBlock'
import { FONT_CLASSES } from '@/fonts'

import './globals.scss'

// Replaces the root layout when the layout itself fails, so it has no shell and its own <html>.
export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en" className={FONT_CLASSES}>
      <body>
        <main id="content" style={{ minBlockSize: '100dvh', padding: '1.5rem' }}>
          <FaultFrame code="CORE FAULT">
            <StateBlock
              kind="error"
              title="FAULT — the ship computer did not respond. Retry?"
              action={(
                <>
                  <Button variant="primary" onClick={() => retry()}>Retry</Button>
                  <Button variant="ghost" href="/">Reboot to bridge</Button>
                </>
              )}
            >
              <p>Every subsystem went dark at once. Nothing was changed.</p>
            </StateBlock>
          </FaultFrame>
        </main>
      </body>
    </html>
  )
}
