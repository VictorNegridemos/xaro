import type React from 'react'
import { cx } from './cx'
import styles from './surfaces.module.scss'

export interface StateBlockProps {
  kind: 'empty' | 'loading' | 'error' | 'denied'
  /** In the voice of the ship's computer, e.g. "NO SIGNAL — the archive holds nothing for that query." */
  title: React.ReactNode
  children?: React.ReactNode
  /** Usually one <Button>. */
  action?: React.ReactNode
  className?: string
}

type Kind = StateBlockProps['kind']

const KIND_CLASS: Readonly<Record<Kind, string | undefined>> = {
  empty: styles.stateEmpty,
  loading: styles.stateLoading,
  error: styles.stateError,
  denied: styles.stateDenied,
}

// A text marker per kind, so the state is never carried by colour alone.
const KIND_TAG: Readonly<Record<Kind, string>> = {
  empty: '[ -- ]',
  loading: '[ .. ]',
  error: '[ !! ]',
  denied: '[ XX ]',
}

/** The one pattern for empty, loading, error and access-denied states. */
export function StateBlock({ kind, title, children, action, className }: StateBlockProps): React.JSX.Element {
  return (
    <div
      className={cx(styles.state, KIND_CLASS[kind], className)}
      data-state-block=""
      data-kind={kind}
      role={kind === 'error' ? 'alert' : 'status'}
      aria-busy={kind === 'loading' || undefined}
    >
      <span className={styles.stateTag} aria-hidden="true">{KIND_TAG[kind]}</span>
      <p className={styles.stateTitle} data-state-title="">{title}</p>
      {children ? <div className={styles.stateBody} data-state-body="">{children}</div> : null}
      {action ? <div className={styles.stateAction} data-state-action="">{action}</div> : null}
    </div>
  )
}
