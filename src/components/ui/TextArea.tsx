// STUB created by Foundation (Step 1): working and unstyled; props are final (plan 7.5).
import type React from 'react'

export type TextAreaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  /** Sets aria-invalid; the error text itself is rendered by <Field>. */
  invalid?: boolean
  ref?: React.Ref<HTMLTextAreaElement>
}

export function TextArea({ invalid, ...rest }: TextAreaProps): React.JSX.Element {
  return <textarea aria-invalid={invalid || undefined} {...rest} />
}
