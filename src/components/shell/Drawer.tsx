'use client'

import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { cx } from '@/components/ui/cx'
import { Icon } from '@/components/ui/icons'
import styles from './Drawer.module.scss'
import { drawerDomId, useShell, type DrawerId } from './shell-context'
import { useDrawerSwipe } from './useDrawerSwipe'

export type DrawerEdge = 'left' | 'right' | 'top' | 'bottom'

export interface DrawerProps {
  id: DrawerId
  edge: DrawerEdge
  title: ReactNode
  /** Crew and location: a static rail on desktop, never hidden or inert there. */
  staticOnDesktop?: boolean
  as?: 'aside' | 'div'
  className?: string
  children: ReactNode
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * One drawer of the shell (plan 7.4). Moves by transform only; closed it is visibility: hidden
 * (and inert after hydration), so it is neither focusable nor announced. Opening focuses the
 * heading, Tab stays inside, Escape and the scrim close it (handled by AppShell).
 */
export function Drawer({ id, edge, title, staticOnDesktop = false, as: Tag = 'div', className, children }: DrawerProps): React.JSX.Element {
  const { open, layout, close } = useShell()
  const isOpen = open === id
  const isStatic = staticOnDesktop && layout === 'desktop'
  const overlay = !isStatic
  const headingRef = useRef<HTMLHeadingElement>(null)
  const rootRef = useRef<HTMLElement | null>(null)
  const headingId = `${drawerDomId(id)}-title`

  useEffect(() => {
    if (isOpen && overlay) headingRef.current?.focus({ preventScroll: true })
  }, [isOpen, overlay])

  // Swipe toward the edge closes: on a side drawer the whole drawer, on a sheet its grab handle.
  const closeBySwipe = () => close(true)
  const sideSwipe = useDrawerSwipe({
    enabled: isOpen && overlay && (edge === 'left' || edge === 'right'),
    onLeft: edge === 'left' ? closeBySwipe : undefined,
    onRight: edge === 'right' ? closeBySwipe : undefined,
  })
  const handleSwipe = useDrawerSwipe({
    enabled: isOpen && overlay,
    onUp: edge === 'top' ? closeBySwipe : undefined,
    onDown: edge === 'bottom' ? closeBySwipe : undefined,
  })
  const { ref: sideSwipeRef, ...sideSwipeRest } = sideSwipe

  function setRoot(element: HTMLElement | null): void {
    rootRef.current = element
    sideSwipeRef(element)
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>): void {
    if (event.key !== 'Tab' || !isOpen || !overlay || rootRef.current === null) return
    const items = Array.from(rootRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
      .filter((el) => el.offsetParent !== null || el === document.activeElement)
    const first = items[0]
    const last = items[items.length - 1]
    if (first === undefined || last === undefined) return
    const active = document.activeElement
    if (event.shiftKey && (active === first || active === headingRef.current)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && active === last) {
      event.preventDefault()
      first.focus()
    }
  }

  // Closed overlay drawers are inert once the layout is known (CSS visibility covers the first paint).
  const inert = overlay && !isOpen && layout !== null

  return (
    <Tag
      ref={setRoot}
      id={drawerDomId(id)}
      className={cx(styles.drawer, styles[edge], staticOnDesktop && styles.staticDesktop, className)}
      data-drawer={id}
      data-open={isOpen ? '' : undefined}
      aria-labelledby={headingId}
      role={overlay && isOpen ? 'dialog' : undefined}
      aria-modal={overlay && isOpen ? true : undefined}
      inert={inert}
      onKeyDown={onKeyDown}
      {...(edge === 'left' || edge === 'right' ? sideSwipeRest : {})}
    >
      {edge === 'bottom' ? (
        <div className={styles.handle} {...handleSwipe} aria-hidden="true"><span /></div>
      ) : null}
      <header className={styles.header}>
        <h2 ref={headingRef} id={headingId} tabIndex={-1} className={styles.title}>{title}</h2>
        <Button
          variant="icon"
          aria-label="Close panel"
          className={styles.close}
          onClick={() => close(true)}
        >
          <Icon name="close" />
        </Button>
      </header>
      <div className={styles.body}>{children}</div>
      {edge === 'top' ? (
        <div className={styles.handle} {...handleSwipe} aria-hidden="true"><span /></div>
      ) : null}
    </Tag>
  )
}
