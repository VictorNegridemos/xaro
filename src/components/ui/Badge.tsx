import type React from 'react'
import { cx } from './cx'
import styles from './surfaces.module.scss'

export type BadgeTone = 'neutral' | 'ok' | 'warn' | 'danger' | 'info'

export interface BadgeProps {
  tone?: BadgeTone
  className?: string
  children: React.ReactNode
}

const TONE_CLASS: Readonly<Record<BadgeTone, string | undefined>> = {
  neutral: undefined,
  ok: styles.badgeOk,
  warn: styles.badgeWarn,
  danger: styles.badgeDanger,
  info: styles.badgeInfo,
}

/** Small label. Status is always text plus colour, never colour alone. */
export function Badge({ tone = 'neutral', className, children }: BadgeProps): React.JSX.Element {
  return (
    <span className={cx(styles.badge, TONE_CLASS[tone], className)} data-badge="" data-tone={tone}>
      {children}
    </span>
  )
}
