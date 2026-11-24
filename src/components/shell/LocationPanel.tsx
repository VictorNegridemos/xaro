'use client'

import { cx } from '@/components/ui/cx'
import { LOCATION_READOUT } from '@/lib/ship-constants'
import { Drawer } from './Drawer'
import styles from './panels.module.scss'

/** Static location readout (no star map, [O2]): right rail on desktop, drawer elsewhere (plan 7.4, 7.6). */
export function LocationPanel({ className }: { className?: string }): React.JSX.Element {
  return (
    <Drawer id="location" edge="right" title="Current location" staticOnDesktop as="aside" className={className}>
      <dl className={styles.location}>
        {LOCATION_READOUT.map((row) => (
          <div key={row.label} className={cx(styles.kv, styles.locationRow, row.emphasis && styles.emphasis)}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
      <p className={styles.locationFoot} aria-hidden="true">
        <span>NAV LOCK</span><span>— — —</span><span>DRIFT</span>
      </p>
    </Drawer>
  )
}
