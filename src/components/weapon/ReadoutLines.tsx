// The five result lines: markup only, no stylesheet import, so the golden test can render it with
// react-dom/server (plan 8.1, 8.2 test 6). The text of each <p data-line> is exactly the line that the
// pre-overhaul JSX produced; all decoration lives outside these elements.
import type React from 'react'

import { deriveWeapon } from '@/lib/weapon/derive'
import type { WeaponLines, WeaponState } from '@/lib/weapon/types'

export const READOUT_LABELS = {
  attack: 'Attack:',
  damage: 'Damage:',
  range: 'Range:',
  ammo: 'Ammo:',
  special: 'Special:',
} as const satisfies Record<keyof WeaponLines, string>

const SHORT_LINES = ['attack', 'damage', 'range', 'ammo'] as const

export interface ReadoutClassNames {
  /** Wrapper of the four short lines. */
  stats?: string
  /** Wrapper of the special line (and its caption). */
  specialBox?: string
  /** Every <p data-line>. */
  line?: string
  /** The <span> holding the label. */
  label?: string
}

export interface ReadoutLinesProps {
  state: WeaponState
  classNames: ReadoutClassNames
  /** Decoration rendered above the special line, outside its <p>. Must be aria-hidden. */
  specialCaption?: React.ReactNode
}

function Line({ name, text, classNames }: { name: keyof WeaponLines; text: string; classNames: ReadoutClassNames }) {
  const label = READOUT_LABELS[name]
  // The line always starts with its label; the rest keeps its leading space (and the double space of Q5).
  return (
    <p data-line={name} className={classNames.line}>
      <span className={classNames.label}>{label}</span>
      {text.slice(label.length)}
    </p>
  )
}

export function ReadoutLines({ state, classNames, specialCaption }: ReadoutLinesProps): React.JSX.Element {
  const lines = deriveWeapon(state)
  return (
    <>
      <div className={classNames.stats}>
        {/* key = text: a changed line is re-mounted, which replays the "re-print" flicker */}
        {SHORT_LINES.map((name) => (
          <Line key={`${name}:${lines[name]}`} name={name} text={lines[name]} classNames={classNames} />
        ))}
      </div>
      <div className={classNames.specialBox}>
        {specialCaption}
        <Line key={`special:${lines.special}`} name="special" text={lines.special} classNames={classNames} />
      </div>
    </>
  )
}
