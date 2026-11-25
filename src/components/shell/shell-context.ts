'use client'

import { createContext, useContext } from 'react'
import type { LayoutMode } from '@/lib/layout'

/** The four drawers of the shell; only one is open at a time (plan 7.4). */
export type DrawerId = 'crew' | 'location' | 'systems' | 'menu'

export interface ShellControls {
  open: DrawerId | null
  layout: LayoutMode | null
  /** Opens a drawer, or closes it when it is already open. `opener` gets the focus back on close. */
  toggle: (id: DrawerId, opener?: HTMLElement | null) => void
  openDrawer: (id: DrawerId, opener?: HTMLElement | null) => void
  close: (restoreFocus?: boolean) => void
  selectedSystemId: number | null
  /** Ship tile: opens the systems drawer with this system expanded; the same tile again closes it. */
  selectSystem: (id: number, opener?: HTMLElement | null) => void
  /** Accordion row inside the drawer: expands it, or collapses it when already expanded. */
  toggleSystemRow: (id: number) => void
  expandedCrewId: number | null
  toggleCrew: (id: number) => void
}

export const ShellContext = createContext<ShellControls | null>(null)

export function useShell(): ShellControls {
  const value = useContext(ShellContext)
  if (value === null) throw new Error('useShell() outside <AppShell>')
  return value
}

/** DOM id of a drawer, used by aria-controls on its toggles. */
export function drawerDomId(id: DrawerId): string {
  return `drawer-${id}`
}
