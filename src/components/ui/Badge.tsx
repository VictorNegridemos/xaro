// STUB created by Foundation (Step 1): unstyled; props are final (plan 7.5).
import type React from 'react'

export type BadgeTone = 'neutral' | 'ok' | 'warn' | 'danger' | 'info'

export interface BadgeProps {
  tone?: BadgeTone
  className?: string
  children: React.ReactNode
}

/** Small label. Status is always text plus colour, never colour alone. */
export function Badge({ tone = 'neutral', className, children }: BadgeProps): React.JSX.Element {
  return <span className={className} data-badge="" data-tone={tone}>{children}</span>
}
