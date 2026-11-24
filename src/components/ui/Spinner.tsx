import type React from 'react'
import { cx } from './cx'
import styles from './Spinner.module.scss'

export interface SpinnerProps {
  /** Accessible label; also the static fallback under reduced motion. */
  label?: string
  className?: string
}

/** A rotating ring; under reduced motion a static "…" (plan 7.7). */
export function Spinner({ label = 'Loading', className }: SpinnerProps): React.JSX.Element {
  return (
    <span role="status" aria-label={label} className={cx(styles.spinner, className)} data-spinner="">
      <span aria-hidden="true" className={styles.ring} />
      <span aria-hidden="true" className={styles.dots}>…</span>
    </span>
  )
}
