import type React from 'react'
import styles from './controls.module.scss'
import { cx } from './cx'

export type TextAreaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  /** Sets aria-invalid; the error text itself is rendered by <Field>. */
  invalid?: boolean
  ref?: React.Ref<HTMLTextAreaElement>
}

/** Resizes vertically only. */
export function TextArea({ invalid, className, ...rest }: TextAreaProps): React.JSX.Element {
  return <textarea aria-invalid={invalid || undefined} className={cx(styles.textarea, className)} {...rest} />
}
