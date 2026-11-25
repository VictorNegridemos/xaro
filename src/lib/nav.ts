// Navigation targets of the shell (plan 7.4). Owned by the Design workstream in Step 2.
// Drawer toggles (Crew, Location, Menu) and Logout are controls, not links, and are not listed here.
import type { IconName } from '@/components/ui/icons'

export interface NavItem {
  id: 'home' | 'weapon' | 'new-entry' | 'import' | 'login'
  label: string
  href: string
  /** 'any' = always shown, 'in' = only when logged in, 'out' = only when logged out. */
  auth: 'any' | 'in' | 'out'
  icon: IconName
}

export const NAV_ITEMS: ReadonlyArray<NavItem> = [
  { id: 'home', label: 'Home', href: '/', auth: 'any', icon: 'home' },
  { id: 'weapon', label: 'Weapon creator', href: '/kodning_weapon_creator', auth: 'any', icon: 'forge' },
  { id: 'new-entry', label: 'Add entry', href: '/entry/new', auth: 'in', icon: 'plus' },
  { id: 'import', label: 'Import', href: '/import', auth: 'in', icon: 'import' },
  { id: 'login', label: 'Login', href: '/login', auth: 'out', icon: 'login' },
]

/** The items to show for the current session state. */
export function navItemsFor(loggedIn: boolean): NavItem[] {
  return NAV_ITEMS.filter((item) => item.auth === 'any' || item.auth === (loggedIn ? 'in' : 'out'))
}
