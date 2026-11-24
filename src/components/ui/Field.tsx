import type React from 'react'
import styles from './controls.module.scss'
import { cx } from './cx'

export interface FieldProps {
  /** Always visible. */
  label: React.ReactNode
  /** id of the control inside; the hint and error ids are derived from it. */
  htmlFor: string
  hint?: React.ReactNode
  /** Rendered in a role="alert" line. */
  error?: React.ReactNode
  required?: boolean
  className?: string
  children: React.ReactNode
}

/** ids to pass to the control as aria-describedby (the Field cannot reach into its child). */
export function fieldDescribedBy(htmlFor: string, parts: { hint?: boolean; error?: boolean }): string | undefined {
  const ids = [parts.hint ? `${htmlFor}-hint` : null, parts.error ? `${htmlFor}-error` : null].filter(Boolean)
  return ids.length > 0 ? ids.join(' ') : undefined
}

export function Field({ label, htmlFor, hint, error, required, className, children }: FieldProps): React.JSX.Element {
  const hasError = error !== undefined && error !== null && error !== false && error !== ''
  return (
    <div
      className={cx(styles.field, hasError && styles.fieldInvalid, className)}
      data-field=""
      data-invalid={hasError ? '' : undefined}
    >
      <label htmlFor={htmlFor} className={styles.fieldLabel}>
        {label}
        {required ? <span aria-hidden="true" className={styles.required}> *</span> : null}
      </label>
      {children}
      {hint ? <p id={`${htmlFor}-hint`} className={styles.hint} data-field-hint="">{hint}</p> : null}
      {hasError ? <p id={`${htmlFor}-error`} role="alert" className={styles.error} data-field-error="">{error}</p> : null}
    </div>
  )
}
