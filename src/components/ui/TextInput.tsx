// STUB created by Foundation (Step 1): working and unstyled; props are final (plan 7.5).
import type React from 'react'

export type TextInputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  /** Sets aria-invalid; the error text itself is rendered by <Field>. */
  invalid?: boolean
  ref?: React.Ref<HTMLInputElement>
}

export function TextInput({ invalid, type = 'text', ...rest }: TextInputProps): React.JSX.Element {
  return <input type={type} aria-invalid={invalid || undefined} {...rest} />
}
