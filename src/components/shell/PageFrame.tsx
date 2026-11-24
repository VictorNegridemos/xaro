// The common frame of every content page inside the shell's main#content (Step 3): width, rhythm and an
// optional page heading. Pages never render their own <main>; the shell provides it.
import type React from 'react'
import { cx } from '@/components/ui/cx'
import styles from './PageFrame.module.scss'

export interface PageFrameProps {
  /** narrow: login; measure: reading pages (entry, search); wide: forms and the import queue. */
  width?: 'narrow' | 'measure' | 'wide'
  /** The page's <h1>. Omit when the content renders its own. */
  title?: React.ReactNode
  /** Small line above the title, e.g. "Archive · write access". */
  kicker?: React.ReactNode
  className?: string
  children: React.ReactNode
}

export function PageFrame({ width = 'measure', title, kicker, className, children }: PageFrameProps): React.JSX.Element {
  return (
    <div className={cx(styles.page, styles[width], className)} data-page-frame={width}>
      {title !== undefined ? (
        <h1 className={styles.title}>
          {kicker !== undefined ? <span className={styles.kicker}>{kicker}</span> : null}
          {title}
        </h1>
      ) : null}
      {children}
    </div>
  )
}
