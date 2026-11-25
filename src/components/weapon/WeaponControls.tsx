'use client'

// The input matrix: four selects and the Smart checkbox, each with an associated label (plan 8.1, 8.3).
// Owner decision O3 (plan 13): while the specialization is Devouring the type select and the Smart
// checkbox carry the `disabled` attribute, so neither pointer nor keyboard can operate them.
import type React from 'react'
import { useId, type ChangeEvent, type Dispatch } from 'react'

import { Checkbox } from '@/components/ui/Checkbox'
import { Select } from '@/components/ui/Select'
import {
  controlsLocked, proficiencyOptions, specializationOptions, styleOptions, typeOptions,
} from '@/lib/weapon/selectors'
import type { Proficiency, Specialization, WeaponAction, WeaponState, WeaponType } from '@/lib/weapon/types'

import styles from './weapon.module.scss'

export interface WeaponControlsProps {
  state: WeaponState
  dispatch: Dispatch<WeaponAction>
}

interface FieldProps {
  index: string
  /** Decorative technical caption; never read out. */
  caption?: string
  label: string
  htmlFor: string
  sealed?: boolean
  sealedId?: string
  children: React.ReactNode
}

function Field({ index, caption, label, htmlFor, sealed = false, sealedId, children }: FieldProps) {
  return (
    <div className={styles.field} data-sealed={sealed ? '' : undefined}>
      <div className={styles.fieldHead}>
        <label className={styles.fieldLabel} htmlFor={htmlFor}>{label}</label>
        <span className={styles.fieldCaption} aria-hidden="true">
          {caption === undefined ? index : `${index} // ${caption}`}
        </span>
      </div>
      <div className={styles.fieldControl}>{children}</div>
      {sealed ? <p className={styles.sealedTag} id={sealedId}>Sealed by organism</p> : null}
    </div>
  )
}

export function WeaponControls({ state, dispatch }: WeaponControlsProps): React.JSX.Element {
  const id = useId()
  const locked = controlsLocked(state)
  const ids = {
    proficiency: `${id}-proficiency`,
    style: `${id}-style`,
    specialization: `${id}-specialization`,
    type: `${id}-type`,
    smart: `${id}-smart`,
    typeSealed: `${id}-type-sealed`,
    smartSealed: `${id}-smart-sealed`,
  }

  return (
    <div className={styles.controls}>
      <div className={styles.controlsHead} aria-hidden="true">
        <span>Input matrix</span>
        <span>{locked ? 'Override' : '5 ch open'}</span>
      </div>
      <Field index="01" caption="FRAME" label="Proficiency" htmlFor={ids.proficiency}>
        <Select
          id={ids.proficiency}
          name="proficiency"
          value={state.proficiency}
          onChange={(event: ChangeEvent<HTMLSelectElement>) =>
            dispatch({ type: 'setProficiency', value: event.target.value as Proficiency })}
        >
          {proficiencyOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </Select>
      </Field>

      <Field index="02" caption="PATTERN" label="Weapon style" htmlFor={ids.style}>
        {/* Controlled by the raw state on purpose: with a stale style the browser shows the first option (Q1). */}
        <Select
          id={ids.style}
          name="style"
          value={state.style}
          onChange={(event: ChangeEvent<HTMLSelectElement>) => dispatch({ type: 'setStyle', value: event.target.value })}
        >
          {styleOptions(state).map((style) => <option key={style} value={style}>{style}</option>)}
        </Select>
      </Field>

      <Field index="03" caption="BOND" label="Specialization" htmlFor={ids.specialization}>
        <Select
          id={ids.specialization}
          name="specialization"
          value={state.specialization}
          onChange={(event: ChangeEvent<HTMLSelectElement>) =>
            dispatch({ type: 'setSpecialization', value: event.target.value as Specialization })}
        >
          {specializationOptions.map((spec) => <option key={spec} value={spec}>{spec}</option>)}
        </Select>
      </Field>

      <Field index="04" caption="PAYLOAD" label="Weapon type" htmlFor={ids.type} sealed={locked} sealedId={ids.typeSealed}>
        <Select
          id={ids.type}
          name="type"
          value={state.type}
          disabled={locked}
          locked={locked}
          className={styles.sealedSelect}
          aria-describedby={locked ? ids.typeSealed : undefined}
          onChange={(event: ChangeEvent<HTMLSelectElement>) =>
            dispatch({ type: 'setType', value: event.target.value as WeaponType })}
        >
          {typeOptions.map((type) => <option key={type} value={type}>{type}</option>)}
        </Select>
      </Field>

      <div className={`${styles.field} ${styles.fieldCheck}`} data-sealed={locked ? '' : undefined}>
        <div className={styles.fieldHead}>
          <span className={styles.fieldCaption} aria-hidden="true">05 // SMART LINK</span>
        </div>
        <div className={styles.fieldControl}>
          <Checkbox
            id={ids.smart}
            name="smart"
            label="Smart"
            checked={state.smart}
            disabled={locked}
            locked={locked}
            aria-describedby={locked ? ids.smartSealed : undefined}
            onChange={() => dispatch({ type: 'toggleSmart' })}
          />
        </div>
        {locked ? <p className={styles.sealedTag} id={ids.smartSealed}>Sealed by organism</p> : null}
      </div>
    </div>
  )
}
