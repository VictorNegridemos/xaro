import type React from 'react'
import styles from './controls.module.scss'
import { cx } from './cx'

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  invalid?: boolean
  /** The "sealed" look of the weapon creator. Visual only: it does not disable the control. */
  locked?: boolean
  ref?: React.Ref<HTMLSelectElement>
}

/** Native <select> with a drawn chevron: the most reliable picker on touch and with a keyboard. */
export function Select({ invalid, locked, className, children, ...rest }: SelectProps): React.JSX.Element {
  return (
    <select
      aria-invalid={invalid || undefined}
      data-locked={locked ? '' : undefined}
      className={cx(styles.select, locked && styles.locked, className)}
      {...rest}
    >
      {children}
    </select>
  )
}
