// Home (plan 7.6): the hull drawing, a status block and the five latest records. Server component.
import Image from 'next/image'
import Link from 'next/link'
import hull from '@/assets/xaro-hull.png'
import { Panel } from '@/components/ui/Panel'
import { StateBlock } from '@/components/ui/StateBlock'
import { cx } from '@/components/ui/cx'
import type { EntityRef, ShellData } from '@/lib/data/types'
import { KODNING_RESERVE } from '@/lib/ship-constants'
import styles from './HomeView.module.scss'

export interface HomeViewProps {
  shell: ShellData
  /** null when the archive could not be read. */
  recent: EntityRef[] | null
}

export function HomeView({ shell, recent }: HomeViewProps): React.JSX.Element {
  const online = shell.systems.filter((system) => system.isOnline).length
  const total = shell.systems.length
  const degraded = total > 0 && online < total

  return (
    <div className={styles.home}>
      {/* The kicker is outside the <h1>, so the heading's accessible name is "X'aro" alone. */}
      <hgroup className={styles.title}>
        <p className={styles.titleKicker}>Ship computer</p>
        <h1 className={styles.titleText}>X&apos;aro</h1>
      </hgroup>

      <figure className={styles.hull}>
        <Image
          src={hull}
          alt="Line drawing of the hull of the X'aro, seen from above"
          sizes="(width >= 1000px) 28rem, 70vw"
          loading="eager"
          quality={75}
          className={styles.hullImage}
        />
        <span className={styles.noise} aria-hidden="true" />
        <figcaption className={styles.caption}>
          <span>HULL SCAN</span>
          <span>{shell.ok ? 'INTEGRITY: UNVERIFIED' : 'NO SIGNAL'}</span>
        </figcaption>
      </figure>

      <div className={styles.side}>
        <Panel title="Status" tone={degraded || !shell.ok ? 'danger' : 'default'}>
          {shell.ok ? (
            <dl className={styles.status}>
              <div className={styles.stat}>
                <dt>Crew aboard</dt>
                <dd>{shell.crew.length}</dd>
              </div>
              <div className={cx(styles.stat, degraded && styles.statBad)}>
                <dt>Systems online</dt>
                <dd>{online}<span className={styles.of}> / {total}</span></dd>
              </div>
              <div className={cx(styles.stat, styles.statBad)}>
                <dt>Kodning reserve</dt>
                <dd>{KODNING_RESERVE}</dd>
              </div>
            </dl>
          ) : (
            <StateBlock kind="error" title="NO SIGNAL — archive unreachable">
              <p>The ship systems did not answer. The weapon creator still works.</p>
            </StateBlock>
          )}
        </Panel>

        <Panel title="Latest records">
          {recent === null ? (
            <StateBlock kind="error" title="NO SIGNAL — archive unreachable" />
          ) : recent.length === 0 ? (
            <StateBlock kind="empty" title="NO SIGNAL — the archive holds no records yet." />
          ) : (
            <ol className={styles.records}>
              {recent.map((record, index) => (
                <li key={record.id}>
                  <Link href={`/entry/${encodeURIComponent(record.slug)}`} className={styles.record}>
                    <span className={styles.recordIndex} aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                    <span className={styles.recordName}>{record.name}</span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>
    </div>
  )
}
