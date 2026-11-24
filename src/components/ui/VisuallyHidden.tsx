import type React from 'react'
import styles from './surfaces.module.scss'

export interface VisuallyHiddenProps {
  as?: 'span' | 'div' | 'p' | 'h2' | 'h3'
  children: React.ReactNode
}

/** Text for screen readers only. */
export function VisuallyHidden({ as: Tag = 'span', children }: VisuallyHiddenProps): React.JSX.Element {
  return <Tag className={styles.visuallyHidden}>{children}</Tag>
}
