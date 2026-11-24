// STUB created by Foundation (Step 1). The Design workstream moves the inline style into a module.
import type React from 'react'

const hidden: React.CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: 'hidden',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
  border: 0,
}

export interface VisuallyHiddenProps {
  as?: 'span' | 'div' | 'p' | 'h2' | 'h3'
  children: React.ReactNode
}

/** Text for screen readers only. */
export function VisuallyHidden({ as: Tag = 'span', children }: VisuallyHiddenProps): React.JSX.Element {
  return <Tag style={hidden}>{children}</Tag>
}
