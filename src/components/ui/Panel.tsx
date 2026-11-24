// STUB created by Foundation (Step 1): unstyled; props are final (plan 7.5).
import type React from 'react'

export interface PanelProps {
  title?: React.ReactNode
  /** Controls shown in the title bar (e.g. a Back button). */
  actions?: React.ReactNode
  tone?: 'default' | 'accent' | 'danger'
  as?: 'section' | 'div' | 'article' | 'aside'
  className?: string
  children: React.ReactNode
}

export function Panel({ title, actions, tone = 'default', as: Tag = 'section', className, children }: PanelProps): React.JSX.Element {
  return (
    <Tag className={className} data-panel="" data-tone={tone}>
      {title !== undefined || actions !== undefined ? (
        <header data-panel-header="">
          {title !== undefined ? <h2>{title}</h2> : null}
          {actions}
        </header>
      ) : null}
      <div data-panel-body="">{children}</div>
    </Tag>
  )
}
