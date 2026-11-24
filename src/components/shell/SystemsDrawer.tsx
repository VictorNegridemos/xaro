'use client'

import Link from 'next/link'
import { StateBlock } from '@/components/ui/StateBlock'
import { cx } from '@/components/ui/cx'
import { Icon } from '@/components/ui/icons'
import type { ShipSystemCard } from '@/lib/data/types'
import { Drawer } from './Drawer'
import styles from './panels.module.scss'
import { useShell } from './shell-context'

export interface SystemsDrawerProps {
  systems: readonly ShipSystemCard[]
  ok: boolean
}

/** All eight ship systems as an accordion: a popover on desktop, a top sheet elsewhere (plan 7.4). */
export function SystemsDrawer({ systems, ok }: SystemsDrawerProps): React.JSX.Element {
  const { selectedSystemId, toggleSystemRow } = useShell()

  return (
    <Drawer id="systems" edge="top" title="Ship subsystems">
      {!ok ? (
        <StateBlock kind="error" title="NO SIGNAL — archive unreachable" />
      ) : systems.length === 0 ? (
        <StateBlock kind="empty" title="NO SIGNAL — no subsystem answers." />
      ) : (
        <ul className={styles.systemList}>
          {systems.map((system) => {
            const expanded = selectedSystemId === system.id
            const detailId = `system-${system.id}-detail`
            return (
              <li key={system.id} className={cx(styles.system, expanded && styles.systemOpen)}>
                <button
                  type="button"
                  className={styles.systemRow}
                  aria-expanded={expanded}
                  aria-controls={detailId}
                  onClick={() => toggleSystemRow(system.id)}
                >
                  <span className={styles.systemCategory}>{system.category}</span>
                  <span className={styles.systemName}>{system.current}</span>
                  <span className={cx(styles.systemStatus, system.isOnline ? styles.ok : styles.bad)}>
                    <span aria-hidden="true">{system.isOnline ? '▲ ' : '✕ '}</span>
                    {system.isOnline ? 'Online' : 'Offline'}
                  </span>
                  <Icon name="chevron" className={styles.chevron} />
                </button>
                <div id={detailId} className={styles.systemDetail} hidden={!expanded}>
                  {system.value ? (
                    <p className={styles.readout}>
                      <span className={styles.readoutLabel}>Current capability</span>
                      <span className={styles.readoutValue}>{system.value}</span>
                    </p>
                  ) : null}
                  {system.details ? <p className={styles.prose}>{system.details}</p> : null}
                  <Link href={`/entry/${encodeURIComponent(system.slug)}`} className={styles.openEntry}>
                    Open entry <span aria-hidden="true">→</span>
                  </Link>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Drawer>
  )
}
