import type React from 'react'
import { PageFrame } from '@/components/shell/PageFrame'
import { StateBlock } from '@/components/ui/StateBlock'
import styles from '@/components/search/SearchResults.module.scss'

export default function SearchLoading(): React.JSX.Element {
  return (
    <PageFrame width="measure">
      <StateBlock kind="loading" title="SCANNING ARCHIVE…" />
      <ol className={styles.skeleton} aria-hidden="true">
        <li />
        <li />
        <li />
      </ol>
    </PageFrame>
  )
}
