// STUB created by Foundation (Step 1): unstyled; props are final (plan 7.5).
import type React from 'react'

export interface SpinnerProps {
  /** Accessible label; also the static fallback under reduced motion. */
  label?: string
  className?: string
}

export function Spinner({ label = 'Loading', className }: SpinnerProps): React.JSX.Element {
  return (
    <span role="status" aria-label={label} className={className} data-spinner="">
      <span aria-hidden="true">…</span>
    </span>
  )
}
