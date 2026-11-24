'use client'

// The persistent app shell (plan 7.4). Rendered once by the root layout, so drawer state, the
// expanded crew member and the search text survive navigation. One CSS grid, three layouts.
import { usePathname } from 'next/navigation'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { cx } from '@/components/ui/cx'
import type { ShellData } from '@/lib/data/types'
import styles from './AppShell.module.scss'
import { CrewPanel } from './CrewPanel'
import { Drawer } from './Drawer'
import { LocationPanel } from './LocationPanel'
import { MenuList, NavList, RightRail } from './NavList'
import { SearchBox } from './SearchBox'
import { ShellContext, type DrawerId, type ShellControls } from './shell-context'
import { ShipBar } from './ShipBar'
import { SystemsDrawer } from './SystemsDrawer'
import { useDrawerSwipe } from './useDrawerSwipe'
import { useLayoutMode } from './useLayoutMode'

export interface AppShellProps {
  loggedIn: boolean
  shell: ShellData
  children: ReactNode
}

export function AppShell({ loggedIn, shell, children }: AppShellProps): React.JSX.Element {
  const pathname = usePathname()
  const layout = useLayoutMode()
  // The drawer remembers the path it was opened on: navigating elsewhere closes it, with no effect.
  const [drawer, setDrawer] = useState<{ id: DrawerId; path: string } | null>(null)
  const [selectedSystemId, setSelectedSystemId] = useState<number | null>(null)
  const [expandedCrewId, setExpandedCrewId] = useState<number | null>(null)
  const openerRef = useRef<HTMLElement | null>(null)

  const open = drawer !== null && drawer.path === pathname ? drawer.id : null
  // On desktop crew and location are static rails: nothing to cover with a scrim.
  const overlayOpen = open !== null && !(layout === 'desktop' && (open === 'crew' || open === 'location'))

  const openDrawer = useCallback((id: DrawerId, opener?: HTMLElement | null) => {
    openerRef.current = opener ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null)
    setDrawer({ id, path: pathname })
  }, [pathname])

  const close = useCallback((restoreFocus = false) => {
    setDrawer(null)
    const opener = openerRef.current
    openerRef.current = null
    if (restoreFocus && opener !== null && opener.isConnected) opener.focus({ preventScroll: true })
  }, [])

  const toggle = useCallback((id: DrawerId, opener?: HTMLElement | null) => {
    if (open === id) close(true)
    else openDrawer(id, opener)
  }, [open, close, openDrawer])

  const selectSystem = useCallback((id: number, opener?: HTMLElement | null) => {
    if (open === 'systems' && selectedSystemId === id) {
      close(true)
      return
    }
    setSelectedSystemId(id)
    if (open !== 'systems') openDrawer('systems', opener)
  }, [open, selectedSystemId, close, openDrawer])

  const toggleSystemRow = useCallback((id: number) => {
    setSelectedSystemId((current) => (current === id ? null : id))
  }, [])

  const toggleCrew = useCallback((id: number) => {
    setExpandedCrewId((current) => (current === id ? null : id))
  }, [])

  // Escape closes the open drawer and returns focus to the control that opened it.
  useEffect(() => {
    if (open === null) return
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape' && !event.defaultPrevented) close(true)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, close])

  const controls = useMemo<ShellControls>(() => ({
    open, layout, toggle, openDrawer, close, selectedSystemId, selectSystem, toggleSystemRow, expandedCrewId, toggleCrew,
  }), [open, layout, toggle, openDrawer, close, selectedSystemId, selectSystem, toggleSystemRow, expandedCrewId, toggleCrew])

  // Portrait only: 16px strips in the side gutters of the content; swipe inward opens a drawer.
  const gutterLeft = useDrawerSwipe({ enabled: layout === 'portrait' && open === null, onRight: () => openDrawer('crew') })
  const gutterRight = useDrawerSwipe({ enabled: layout === 'portrait' && open === null, onLeft: () => openDrawer('location') })

  return (
    <ShellContext value={controls}>
      <div className={styles.shell} data-drawer-open={open ?? undefined}>
        <a href="#content" className={styles.skip}>Skip to content</a>

        <ShipBar tiles={shell.barSystems} ok={shell.ok} />

        <NavList loggedIn={loggedIn} />

        <main id="content" tabIndex={-1} className={styles.main}>
          <div className={styles.frame}>{children}</div>
        </main>
        {/* One short flicker of the content frame on every route change (motion-ok only). */}
        <div key={pathname} className={styles.flicker} aria-hidden="true" />

        <Suspense fallback={<div role="search" className={styles.searchFallback} />}>
          <SearchBox />
        </Suspense>

        <CrewPanel crew={shell.crew} ok={shell.ok} className={styles.crewArea} />
        <LocationPanel className={styles.locArea} />
        <RightRail loggedIn={loggedIn} />

        <SystemsDrawer systems={shell.systems} ok={shell.ok} />

        <Drawer id="menu" edge="bottom" title="Menu">
          <MenuList loggedIn={loggedIn} />
        </Drawer>

        <div className={cx(styles.gutter, styles.gutterLeft)} aria-hidden="true" {...gutterLeft} />
        <div className={cx(styles.gutter, styles.gutterRight)} aria-hidden="true" {...gutterRight} />

        <button
          type="button"
          className={cx(styles.scrim, open === 'systems' && styles.scrimUnderBar)}
          data-visible={overlayOpen ? '' : undefined}
          aria-label="Close panel"
          tabIndex={overlayOpen ? 0 : -1}
          aria-hidden={overlayOpen ? undefined : true}
          onClick={() => close(true)}
        />

        <div className={styles.fx} aria-hidden="true" />
      </div>
    </ShellContext>
  )
}
