import type React from 'react'
import { Button } from '@/components/ui/Button'
import { StateBlock } from '@/components/ui/StateBlock'
import styles from '@/components/entry/EntryView.module.scss'

export default function EntryNotFound(): React.JSX.Element {
  return (
    <main className={styles.page}>
      <StateBlock
        kind="empty"
        title="NO RECORD — the archive holds no entry under that designation."
        action={<Button href="/search">Search the archive</Button>}
      >
        <p>It may have been renamed, purged, or never filed.</p>
      </StateBlock>
    </main>
  )
}
