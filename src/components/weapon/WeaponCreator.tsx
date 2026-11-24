'use client'

// The Kodning weapon creator: a forbidden fabrication console (plan 8.3). All behaviour lives in
// src/lib/weapon (reducer, derive, selectors) and is guarded by the golden-file tests; this file is layout.
import { useRouter } from 'next/navigation'
import type React from 'react'
import { useId, useReducer } from 'react'

import { Button } from '@/components/ui/Button'
import { Panel } from '@/components/ui/Panel'
import { initialWeaponState, weaponReducer } from '@/lib/weapon/reducer'
import { controlsLocked, isDevouringLook } from '@/lib/weapon/selectors'

import { WeaponControls } from './WeaponControls'
import { WeaponReadout } from './WeaponReadout'
import { WeaponSchematic } from './WeaponSchematic'
import styles from './weapon.module.scss'

export function WeaponCreator(): React.JSX.Element {
  const [state, dispatch] = useReducer(weaponReducer, initialWeaponState)
  const router = useRouter()
  const resultHeadingId = useId()
  const devouring = isDevouringLook(state)

  // Q14: Back is router.back(); when the page was opened directly there is nothing to go back to.
  const goBack = () => {
    if (window.history.length > 1) router.back()
    else router.push('/')
  }

  return (
    <div
      className={styles.console}
      data-type={state.type.toLowerCase()}
      data-devouring={devouring ? '' : undefined}
      data-sealed={controlsLocked(state) ? '' : undefined}
    >
      <Panel
        className={styles.panel}
        tone={devouring ? 'danger' : 'default'}
        title="Kodning Weapon Creator"
        actions={<Button variant="ghost" size="sm" onClick={goBack}>Back</Button>}
      >
        <div className={styles.inner}>
          <span className={styles.pulse} aria-hidden="true" />
          <div className={styles.strap} aria-hidden="true">
            <span className={styles.hatch} />
            <span className={styles.strapText}>Kodning fabrication // unsanctioned</span>
            <span className={styles.strapStatus}>{devouring ? 'Organism in the loop' : `Payload: ${state.type}`}</span>
          </div>
          <div className={styles.layout}>
            <div className={styles.controlsArea}>
              <WeaponControls state={state} dispatch={dispatch} />
            </div>
            <div className={styles.resultArea}>
              <WeaponReadout state={state} headingId={resultHeadingId} />
            </div>
            <div className={styles.schematicArea}>
              <WeaponSchematic state={state} />
            </div>
          </div>
        </div>
      </Panel>
    </div>
  )
}
