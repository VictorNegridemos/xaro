import type React from 'react'
import styles from './controls.module.scss'
import { cx } from './cx'

export type CheckboxProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'children'> & {
  /** Rendered to the right of the box, inside the same <label>. */
  label: React.ReactNode
  /** The "sealed" look of the weapon creator. Visual only: it does not disable the control. */
  locked?: boolean
  ref?: React.Ref<HTMLInputElement>
}

/** A native checkbox drawn as a 24px framed box inside a 44px hit area (the whole label). */
export function Checkbox({ label, locked, className, ...rest }: CheckboxProps): React.JSX.Element {
  return (
    <label
      className={cx(styles.checkbox, locked && styles.checkboxLocked, className)}
      data-checkbox=""
      data-locked={locked ? '' : undefined}
    >
      <input type="checkbox" className={styles.box} {...rest} />
      <span>{label}</span>
    </label>
  )
}
