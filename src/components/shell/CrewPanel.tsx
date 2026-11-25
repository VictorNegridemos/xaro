'use client'

import Link from 'next/link'
import { StateBlock } from '@/components/ui/StateBlock'
import { cx } from '@/components/ui/cx'
import { Icon } from '@/components/ui/icons'
import type { CrewCard } from '@/lib/data/types'
import { Drawer } from './Drawer'
import styles from './panels.module.scss'
import { useShell } from './shell-context'

export interface CrewPanelProps {
  crew: readonly CrewCard[]
  ok: boolean
  className?: string
}

const FIELDS: ReadonlyArray<[label: string, key: 'rank' | 'race' | 'composition' | 'status' | 'expertise']> = [
  ['Rank', 'rank'],
  ['Race', 'race'],
  ['Type', 'composition'],
  ['Status', 'status'],
  ['Expertise', 'expertise'],
]

/** Crew manifest: a static rail on desktop, a drawer from the left elsewhere (plan 7.4). */
export function CrewPanel({ crew, ok, className }: CrewPanelProps): React.JSX.Element {
  const { expandedCrewId, toggleCrew } = useShell()

  return (
    <Drawer id="crew" edge="left" title="Crew manifest" staticOnDesktop as="aside" className={className}>
      {!ok ? (
        <StateBlock kind="error" title="NO SIGNAL — archive unreachable" />
      ) : crew.length === 0 ? (
        <StateBlock kind="empty" title="NO SIGNAL — no crew aboard." />
      ) : (
        <ul className={styles.crewList}>
          {crew.map((member) => {
            const expanded = expandedCrewId === member.id
            const detailId = `crew-${member.id}-detail`
            return (
              <li key={member.id} className={cx(styles.crew, expanded && styles.crewOpen)}>
                <div className={styles.crewRow}>
                  <Link href={`/entry/${encodeURIComponent(member.slug)}`} className={styles.crewName}>
                    {member.name}
                  </Link>
                  <button
                    type="button"
                    className={styles.disclosure}
                    aria-expanded={expanded}
                    aria-controls={detailId}
                    aria-label={`${expanded ? 'Hide' : 'Show'} details of ${member.name}`}
                    onClick={() => toggleCrew(member.id)}
                  >
                    <Icon name="chevron" className={styles.chevron} />
                  </button>
                </div>
                <dl id={detailId} className={styles.crewDetail} hidden={!expanded}>
                  {FIELDS.map(([label, key]) => (
                    <div key={key} className={styles.kv}>
                      <dt>{label}</dt>
                      <dd>{member[key] || '—'}</dd>
                    </div>
                  ))}
                </dl>
              </li>
            )
          })}
        </ul>
      )}
    </Drawer>
  )
}
