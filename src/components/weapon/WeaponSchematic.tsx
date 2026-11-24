// Decorative schematic of the weapon being fabricated (plan 8.3). Everything here duplicates information
// that the controls and the result already carry, so the whole block is aria-hidden.
import Image from 'next/image'
import type React from 'react'

import tendrils from '@/assets/tendrils.webp'
import { weaponProficiencies } from '@/lib/weapon/data'
import { clipExpression, deriveWeaponParts } from '@/lib/weapon/derive'
import { displayedStyle, isDevouringLook } from '@/lib/weapon/selectors'
import type { Proficiency, WeaponState } from '@/lib/weapon/types'

import styles from './weapon.module.scss'

type Silhouette = 'melee1h' | 'melee2h' | 'sidearm' | 'rifle'

const SILHOUETTE: Record<Proficiency, Silhouette> = {
  simpleMelee1h: 'melee1h',
  martialMelee1h: 'melee1h',
  martialMelee2h: 'melee2h',
  simpleRanged1h: 'sidearm',
  martialRanged1h: 'sidearm',
  martialRanged2h: 'rifle',
}

/** Outline, detail lines, the payload core position and the measured length (x1..x2) per silhouette. */
const SHAPES: Record<Silhouette, { outline: string[]; detail: string[]; core: [number, number]; span: [number, number] }> = {
  melee1h: {
    outline: [
      'M52 82 h66 v16 h-66 z',
      'M118 62 h10 v56 h-10 z',
      'M128 78 H372 L414 90 L372 102 H128 z',
    ],
    detail: ['M140 90 H360', 'M64 82 v16 M78 82 v16 M92 82 v16 M106 82 v16', 'M372 78 v24'],
    core: [44, 90],
    span: [38, 414],
  },
  melee2h: {
    outline: [
      'M30 83 h104 v14 h-104 z',
      'M134 48 h12 v84 h-12 z',
      'M146 72 H404 L456 90 L404 108 H146 z',
    ],
    detail: ['M160 90 H392', 'M160 80 H380 M160 100 H380', 'M46 83 v14 M62 83 v14 M78 83 v14 M94 83 v14 M110 83 v14', 'M404 72 v36'],
    core: [22, 90],
    span: [16, 456],
  },
  sidearm: {
    outline: [
      'M132 56 H330 V72 H346 V84 H330 V92 H132 z',
      'M150 92 H204 L186 150 H134 z',
      'M204 92 q8 30 36 26 V92',
    ],
    detail: ['M146 66 H318', 'M238 56 v36 M262 56 v36 M286 56 v36', 'M150 110 H198 M146 124 H194 M142 138 H190', 'M346 78 H372'],
    core: [170, 74],
    span: [132, 346],
  },
  rifle: {
    outline: [
      'M20 74 L108 62 V104 L20 116 z',
      'M108 60 H272 V104 H108 z',
      'M272 70 H444 V88 H272 z',
      'M444 74 h14 v10 h-14 z',
      'M150 104 H186 L176 150 H140 z',
      'M206 104 H250 V134 H206 z',
      'M136 40 H232 V54 H136 z',
    ],
    detail: ['M150 54 v6 M218 54 v6', 'M286 79 H432', 'M300 70 v18 M330 70 v18 M360 70 v18 M390 70 v18', 'M120 72 H196', 'M36 80 L96 72'],
    core: [228, 82],
    span: [20, 458],
  },
}

const TICKS = Array.from({ length: 23 }, (_, i) => 20 + i * 20)

export function WeaponSchematic({ state }: { state: WeaponState }): React.JSX.Element {
  const parts = deriveWeaponParts(state)
  const silhouette = SILHOUETTE[state.proficiency]
  const shape = SHAPES[silhouette]
  const [x1, x2] = shape.span
  const devouring = isDevouringLook(state)
  const plates = [
    { key: 'ATK', value: `${parts.bonus === undefined ? '' : `${parts.bonus} `}${parts.attribute}` },
    { key: 'DMG', value: `${parts.dice} ${parts.damageType}` },
    { key: 'RNG', value: `${parts.range} ft` },
    { key: 'AMMO', value: parts.clip === 'unlimited' ? 'unlimited' : `${clipExpression(parts).replace('reload after ', '')} / ${parts.total}` },
  ]

  return (
    <div className={styles.schematic} aria-hidden="true" data-silhouette={silhouette}>
      <span className={styles.scan} />
      {/* key: a new payload sweeps its colour across the bench once */}
      <span key={state.type} className={styles.typeFlash} />
      {devouring ? (
        <Image className={styles.tendrils} src={tendrils} alt="" fill loading="eager" sizes="(width >= 1000px) 50vw, 100vw" />
      ) : null}
      <div className={styles.schematicHead}>
        <span className={styles.schematicStyle}>{displayedStyle(state)}</span>
        <span className={styles.schematicMeta}>{weaponProficiencies[state.proficiency]}</span>
        <span className={styles.schematicMeta}>{`${state.type} // ${state.specialization}`}</span>
      </div>
      {/* key: a new outline replays the draw-in */}
      <svg key={silhouette} className={styles.drawing} viewBox="0 0 480 180" role="presentation" focusable="false">
        <g className={styles.ticks}>
          <path d="M20 166 H460" />
          {TICKS.map((x) => <path key={x} d={`M${x} 166 v${x % 100 === 20 ? -9 : -5}`} />)}
          <path d={`M${x1} 24 V${silhouette === 'melee2h' ? 44 : 36} M${x2} 24 V${silhouette === 'melee2h' ? 44 : 36} M${x1} 28 H${x2}`} />
          <path d={`M${x1} 28 l7 -3 v6 z M${x2} 28 l-7 -3 v6 z`} className={styles.tickFill} />
        </g>
        <g className={styles.outline}>
          {shape.outline.map((d) => <path key={d} d={d} pathLength={1} />)}
        </g>
        <g className={styles.detail}>
          {shape.detail.map((d) => <path key={d} d={d} />)}
        </g>
        <g className={styles.core}>
          <circle cx={shape.core[0]} cy={shape.core[1]} r="9" />
          <circle cx={shape.core[0]} cy={shape.core[1]} r="3.5" className={styles.coreDot} />
        </g>
      </svg>
      <dl className={styles.plates}>
        {plates.map((plate) => (
          <div key={plate.key} className={styles.plate}>
            <dt>{plate.key}</dt>
            <dd>{plate.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
