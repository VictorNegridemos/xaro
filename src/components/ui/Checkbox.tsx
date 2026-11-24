// STUB created by Foundation (Step 1): working and unstyled; props are final (plan 7.5).
import type React from 'react'

export type CheckboxProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'children'> & {
  /** Rendered to the right of the box, inside the same <label>. */
  label: React.ReactNode
  /** The "sealed" look of the weapon creator. Visual only: it does not disable the control. */
  locked?: boolean
  ref?: React.Ref<HTMLInputElement>
}

export function Checkbox({ label, locked, className, ...rest }: CheckboxProps): React.JSX.Element {
  return (
    <label className={className} data-checkbox="" data-locked={locked ? '' : undefined}>
      <input type="checkbox" {...rest} />
      <span>{label}</span>
    </label>
  )
}
