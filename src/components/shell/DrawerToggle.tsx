'use client'

import { cx } from '@/components/ui/cx'
import { Icon, type IconName } from '@/components/ui/icons'
import styles from './NavList.module.scss'
import { drawerDomId, useShell, type DrawerId } from './shell-context'

export interface DrawerToggleProps {
  drawer: DrawerId
  label: string
  icon: IconName
  className?: string
}

/** A nav control that opens or closes one drawer; aria-expanded mirrors the drawer state. */
export function DrawerToggle({ drawer, label, icon, className }: DrawerToggleProps): React.JSX.Element {
  const { open, toggle } = useShell()
  const expanded = open === drawer
  return (
    <button
      type="button"
      className={cx(styles.item, className)}
      aria-expanded={expanded}
      aria-controls={drawerDomId(drawer)}
      title={label}
      onClick={(event) => toggle(drawer, event.currentTarget)}
    >
      <Icon name={icon} className={styles.icon} />
      <span className={styles.label}>{label}</span>
    </button>
  )
}
