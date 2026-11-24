// STUB created by Foundation (Step 1): working and unstyled; props are final (plan 7.5).
import type React from 'react'

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  invalid?: boolean
  /** The "sealed" look of the weapon creator. Visual only: it does not disable the control. */
  locked?: boolean
  ref?: React.Ref<HTMLSelectElement>
}

/** Native <select>: the most reliable picker on touch and with a keyboard. */
export function Select({ invalid, locked, children, ...rest }: SelectProps): React.JSX.Element {
  return (
    <select aria-invalid={invalid || undefined} data-locked={locked ? '' : undefined} {...rest}>
      {children}
    </select>
  )
}
