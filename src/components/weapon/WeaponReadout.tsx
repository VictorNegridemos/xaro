// Styled wrapper of the result: heading "Result:" and the five real lines (plan 8.1, 8.3).
import type React from 'react'

import type { WeaponState } from '@/lib/weapon/types'

import { ReadoutLines } from './ReadoutLines'
import styles from './weapon.module.scss'

export interface WeaponReadoutProps {
  state: WeaponState
  headingId: string
}

export function WeaponReadout({ state, headingId }: WeaponReadoutProps): React.JSX.Element {
  return (
    <section className={styles.result} aria-labelledby={headingId}>
      <h3 className={styles.resultHeading} id={headingId}>Result:</h3>
      <div className={styles.resultBody}>
        <ReadoutLines
          state={state}
          classNames={{
            stats: styles.stats,
            specialBox: styles.specialBox,
            line: styles.line,
            label: styles.lineLabel,
          }}
          specialCaption={<span className={styles.specialCaption} aria-hidden="true">Warning // special property</span>}
        />
      </div>
    </section>
  )
}
