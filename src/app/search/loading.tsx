import type React from 'react'
import { StateBlock } from '@/components/ui/StateBlock'
import styles from '@/components/search/SearchResults.module.scss'

export default function SearchLoading(): React.JSX.Element {
  return (
    <main className={styles.page}>
      <StateBlock kind="loading" title="SCANNING ARCHIVE…" />
      <ol className={styles.skeleton} aria-hidden="true">
        <li />
        <li />
        <li />
      </ol>
    </main>
  )
}
