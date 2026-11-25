'use client'

import Link from 'next/link'
import { cx } from '@/components/ui/cx'
import type { ShipSystemCard } from '@/lib/data/types'
import { KODNING_RESERVE } from '@/lib/ship-constants'
import styles from './ShipBar.module.scss'
import { drawerDomId, useShell } from './shell-context'
import { useDrawerSwipe } from './useDrawerSwipe'

const ABBREVIATIONS: Readonly<Record<string, string>> = {
  ftl: 'FTL',
  propulsion: 'PROP',
  weapons: 'WEAP',
  shields: 'SHLD',
  sensors: 'SENS',
  core: 'CORE',
}

/** FTL, PROP, WEAP, SHLD, SENS, CORE; an unknown category gets its first four letters. */
export function abbreviateCategory(category: string): string {
  const key = category.trim().toLowerCase()
  return ABBREVIATIONS[key] ?? (key.slice(0, 4).toUpperCase() || '----')
}

export interface ShipBarProps {
  tiles: readonly ShipSystemCard[]
  ok: boolean
}

/**
 * The ship bar (plan 7.4): home link, six system tiles with status, the Kodning reserve.
 * A tile opens the systems drawer with that system expanded; the same tile again closes it.
 */
export function ShipBar({ tiles, ok }: ShipBarProps): React.JSX.Element {
  const { open, layout, selectedSystemId, selectSystem, openDrawer } = useShell()
  const swipe = useDrawerSwipe({
    enabled: layout !== 'desktop' && open === null,
    onDown: () => openDrawer('systems'),
  })
  const reserve = Number.parseFloat(KODNING_RESERVE)
  const reserveWidth = Number.isFinite(reserve) ? `${Math.min(100, Math.max(0, reserve))}%` : '0%'

  return (
    <header className={styles.bar} data-ship-bar="" {...swipe}>
      <Link href="/" className={styles.brand} aria-label="X'aro — home">
        <span aria-hidden="true" className={styles.brandMark}>X&apos;ARO</span>
        <span aria-hidden="true" className={styles.brandSub}>ship computer</span>
      </Link>

      {ok && tiles.length > 0 ? (
        <ul className={styles.tiles} aria-label="Ship systems">
          {tiles.map((tile) => {
            const expanded = open === 'systems' && selectedSystemId === tile.id
            return (
              <li key={tile.id} className={styles.tileItem}>
                <button
                  type="button"
                  className={cx(styles.tile, tile.isOnline ? styles.online : styles.offline)}
                  aria-expanded={expanded}
                  aria-controls={drawerDomId('systems')}
                  data-online={tile.isOnline ? '' : undefined}
                  onClick={(event) => selectSystem(tile.id, event.currentTarget)}
                >
                  <span className={styles.full}>{tile.category || tile.name}</span>
                  <span className={styles.abbr} aria-hidden="true">{abbreviateCategory(tile.category || tile.name)}</span>
                  <span className={styles.status}>
                    <span className={styles.glyph} aria-hidden="true">{tile.isOnline ? '▲' : '✕'}</span>
                    <span className={styles.statusText}>{tile.isOnline ? 'Online' : 'Offline'}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className={styles.noSignal} role="status">NO SIGNAL — archive unreachable</p>
      )}

      <div className={styles.reserve}>
        <span className={styles.reserveLabel}>Kodning reserve</span>
        <span
          className={styles.reserveTrack}
          role="meter"
          aria-label="Kodning reserve"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Number.isFinite(reserve) ? reserve : 0}
          aria-valuetext={`${KODNING_RESERVE} of 100%`}
        >
          <span className={styles.reserveFill} style={{ inlineSize: reserveWidth }} />
        </span>
        <span className={styles.reserveValue}>{KODNING_RESERVE} / 100%</span>
      </div>
    </header>
  )
}
