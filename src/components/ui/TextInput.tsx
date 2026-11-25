import type React from 'react'
import styles from './controls.module.scss'
import { cx } from './cx'

export type TextInputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  /** Sets aria-invalid; the error text itself is rendered by <Field>. */
  invalid?: boolean
  ref?: React.Ref<HTMLInputElement>
}

export function TextInput({ invalid, type = 'text', className, ...rest }: TextInputProps): React.JSX.Element {
  return <input type={type} aria-invalid={invalid || undefined} className={cx(styles.input, className)} {...rest} />
}
