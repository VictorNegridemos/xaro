// STUB created by Foundation (Step 1): unstyled; props are final (plan 7.5).
import type React from 'react'

export interface StateBlockProps {
  kind: 'empty' | 'loading' | 'error' | 'denied'
  /** In the voice of the ship's computer, e.g. "NO SIGNAL — the archive holds nothing for that query." */
  title: React.ReactNode
  children?: React.ReactNode
  /** Usually one <Button>. */
  action?: React.ReactNode
  className?: string
}

/** The one pattern for empty, loading, error and access-denied states. */
export function StateBlock({ kind, title, children, action, className }: StateBlockProps): React.JSX.Element {
  return (
    <div
      className={className}
      data-state-block=""
      data-kind={kind}
      role={kind === 'error' ? 'alert' : 'status'}
      aria-busy={kind === 'loading' || undefined}
    >
      <p data-state-title="">{title}</p>
      {children ? <div data-state-body="">{children}</div> : null}
      {action ? <div data-state-action="">{action}</div> : null}
    </div>
  )
}
