// The one Button (plan 7.5): variants primary, ghost, danger and icon, with rest, hover, active,
// focus-visible, disabled and pending states. The props are Foundation's and are final.
import Link from 'next/link'
import type React from 'react'
import styles from './Button.module.scss'
import { cx } from './cx'
import { Spinner } from './Spinner'

export type ButtonVariant = 'primary' | 'ghost' | 'danger' | 'icon'

type ButtonCommon = {
  variant?: ButtonVariant
  size?: 'md' | 'sm'
  pending?: boolean
  fullWidth?: boolean
  className?: string
  children: React.ReactNode
}
export type ButtonAsButton = ButtonCommon
  & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'>
  & { href?: undefined }
export type ButtonAsLink = ButtonCommon & {
  href: string
  prefetch?: boolean
  target?: string
  rel?: string
  'aria-current'?: 'page'
  'aria-label'?: string
  disabled?: never
}
export type ButtonProps = ButtonAsButton | ButtonAsLink

/** A real <button type="button"> by default, or a next/link when href is given. Never <a href="#">. */
export function Button(props: ButtonProps): React.JSX.Element {
  const { variant = 'ghost', size = 'md', pending = false, fullWidth = false, className, children } = props
  const classes = cx(
    styles.button,
    styles[variant],
    size === 'sm' && styles.sm,
    fullWidth && styles.fullWidth,
    className,
  )
  const data = {
    'data-variant': variant,
    'data-size': size,
    'data-full-width': fullWidth ? '' : undefined,
    'data-pending': pending ? '' : undefined,
  }
  const content = (
    <>
      {pending ? <Spinner /> : null}
      <span className={styles.label}>{children}</span>
    </>
  )

  if (props.href !== undefined) {
    return (
      <Link
        href={props.href}
        prefetch={props.prefetch}
        target={props.target}
        rel={props.rel}
        aria-current={props['aria-current']}
        aria-label={props['aria-label']}
        aria-busy={pending || undefined}
        tabIndex={pending ? -1 : undefined}
        className={classes}
        {...data}
      >
        {content}
      </Link>
    )
  }

  const {
    variant: _variant, size: _size, pending: _pending, fullWidth: _fullWidth, className: _className,
    children: _children, href: _href, type = 'button', disabled, ...rest
  } = props
  void [_variant, _size, _pending, _fullWidth, _className, _children, _href]
  return (
    <button type={type} disabled={disabled || pending} aria-busy={pending || undefined} className={classes} {...data} {...rest}>
      {content}
    </button>
  )
}
