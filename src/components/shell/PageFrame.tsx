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
      {title === undefined ? null : kicker === undefined ? (
        <h1 className={styles.title}>{title}</h1>
      ) : (
        // The kicker is outside the <h1>, so the heading's accessible name is the title alone.
        <hgroup className={styles.title}>
          <p className={styles.kicker}>{kicker}</p>
          <h1 className={styles.heading}>{title}</h1>
        </hgroup>
      )}
      {children}
    </div>
  )
}
