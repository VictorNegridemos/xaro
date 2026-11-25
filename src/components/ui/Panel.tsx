import type React from 'react'
import { cx } from './cx'
import styles from './surfaces.module.scss'

export interface PanelProps {
  title?: React.ReactNode
  /** Controls shown in the title bar (e.g. a Back button). */
  actions?: React.ReactNode
  tone?: 'default' | 'accent' | 'danger'
  as?: 'section' | 'div' | 'article' | 'aside'
  className?: string
  children: React.ReactNode
}

/** Thin hard-edged frame with a notched corner and a title bar in the display font. */
export function Panel({ title, actions, tone = 'default', as: Tag = 'section', className, children }: PanelProps): React.JSX.Element {
  return (
    <Tag
      className={cx(styles.panel, tone === 'accent' && styles.panelAccent, tone === 'danger' && styles.panelDanger, className)}
      data-panel=""
      data-tone={tone}
    >
      {title !== undefined || actions !== undefined ? (
        <header className={styles.panelHeader} data-panel-header="">
          {title !== undefined ? <h2 className={styles.panelTitle}>{title}</h2> : null}
          {actions !== undefined ? <div className={styles.panelActions}>{actions}</div> : null}
        </header>
      ) : null}
      <div className={styles.panelBody} data-panel-body="">{children}</div>
    </Tag>
  )
}
