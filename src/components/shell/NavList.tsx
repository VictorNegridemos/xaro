'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LogoutButton } from '@/components/auth/LogoutButton'
import { cx } from '@/components/ui/cx'
import { Icon } from '@/components/ui/icons'
import { NAV_ITEMS, type NavItem } from '@/lib/nav'
import { DrawerToggle } from './DrawerToggle'
import styles from './NavList.module.scss'
import { useShell } from './shell-context'
import { useDrawerSwipe } from './useDrawerSwipe'

function item(id: NavItem['id']): NavItem {
  const found = NAV_ITEMS.find((entry) => entry.id === id)
  if (found === undefined) throw new Error(`nav item ${id} missing`)
  return found
}

function isCurrent(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`)
}

export function NavLink({ entry, className }: { entry: NavItem; className?: string }): React.JSX.Element {
  const pathname = usePathname()
  return (
    <Link
      href={entry.href}
      className={cx(styles.item, className)}
      aria-current={isCurrent(pathname, entry.href) ? 'page' : undefined}
      title={entry.label}
    >
      <Icon name={entry.icon} className={styles.icon} />
      <span className={styles.label}>{entry.label}</span>
    </Link>
  )
}

/** Login link or Logout control, whichever applies. */
export function AuthControl({ loggedIn, className }: { loggedIn: boolean; className?: string }): React.JSX.Element {
  return loggedIn ? (
    <div className={cx(styles.logout, className)}><LogoutButton /></div>
  ) : (
    <NavLink entry={item('login')} className={className} />
  )
}

/**
 * The main navigation (plan 7.4). One list for the three layouts; CSS shows and orders the items:
 * desktop  — vertical list under the crew rail: Weapon creator, Add entry*, Import*, Login / Logout;
 * landscape — left icon rail: Home, Crew, Weapon creator, Add entry*, Import*;
 * portrait — bottom row of five: Crew, Location, Home, Weapon creator, Menu.
 * Everything hidden in one layout is reachable another way there (ship bar, right rail, menu sheet).
 */
export function NavList({ loggedIn }: { loggedIn: boolean }): React.JSX.Element {
  const { layout, open, openDrawer } = useShell()
  // Portrait bottom row: swipe right opens Crew, left opens Location, up opens Menu.
  const swipe = useDrawerSwipe({
    enabled: layout === 'portrait' && open === null,
    onRight: () => openDrawer('crew'),
    onLeft: () => openDrawer('location'),
    onUp: () => openDrawer('menu'),
  })

  return (
    <nav className={styles.nav} aria-label="Main" {...swipe}>
      <ul className={styles.list}>
        <li className={cx(styles.li, styles.home)}><NavLink entry={item('home')} /></li>
        <li className={cx(styles.li, styles.crew)}><DrawerToggle drawer="crew" label="Crew" icon="crew" /></li>
        <li className={cx(styles.li, styles.location)}><DrawerToggle drawer="location" label="Location" icon="location" /></li>
        <li className={cx(styles.li, styles.weapon)}><NavLink entry={item('weapon')} /></li>
        {loggedIn ? (
          <>
            <li className={cx(styles.li, styles.secondary)}><NavLink entry={item('new-entry')} /></li>
            <li className={cx(styles.li, styles.secondary)}><NavLink entry={item('import')} /></li>
          </>
        ) : null}
        <li className={cx(styles.li, styles.auth)}><AuthControl loggedIn={loggedIn} /></li>
        <li className={cx(styles.li, styles.menu)}><DrawerToggle drawer="menu" label="Menu" icon="menu" /></li>
      </ul>
    </nav>
  )
}

/** Landscape right rail: Location and Login / Logout. */
export function RightRail({ loggedIn }: { loggedIn: boolean }): React.JSX.Element {
  return (
    <div className={styles.railR}>
      <DrawerToggle drawer="location" label="Location" icon="location" />
      <AuthControl loggedIn={loggedIn} className={styles.railAuth} />
    </div>
  )
}

/** Portrait menu sheet: Add entry*, Import*, Login / Logout. */
export function MenuList({ loggedIn }: { loggedIn: boolean }): React.JSX.Element {
  return (
    <ul className={styles.menuList}>
      {loggedIn ? (
        <>
          <li><NavLink entry={item('new-entry')} className={styles.menuItem} /></li>
          <li><NavLink entry={item('import')} className={styles.menuItem} /></li>
        </>
      ) : null}
      <li><AuthControl loggedIn={loggedIn} className={styles.menuItem} /></li>
    </ul>
  )
}
