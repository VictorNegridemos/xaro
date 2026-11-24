// Weapon creator types (plan 8.1). Types only in Step 1; the Weapon workstream owns src/lib/weapon in Step 2.
// The option values are the exact strings of the frozen data tables.

export type Proficiency =
  | 'simpleMelee1h'
  | 'simpleRanged1h'
  | 'martialMelee1h'
  | 'martialMelee2h'
  | 'martialRanged1h'
  | 'martialRanged2h'

export type Specialization = 'Heavy' | 'Reflex' | 'BCI' | 'Precognition' | 'Observer effect' | 'Devouring'

export type WeaponType =
  | 'Laser'
  | 'Plasma'
  | 'Kinetic'
  | 'Gravity'
  | 'Cryogenic'
  | 'Acidic'
  | 'Tesla'
  | 'Sonic'
  | 'Toxic'
  | 'Radiation'
  | 'Devouring'

export interface WeaponState {
  proficiency: Proficiency
  /** Free string on purpose: changing the proficiency leaves a stale style behind (quirk Q1). */
  style: string
  specialization: Specialization
  type: WeaponType
  smart: boolean
}

/** The five output lines, each including its label ("Attack: …"). */
export interface WeaponLines {
  attack: string
  damage: string
  range: string
  ammo: string
  special: string
}

export type WeaponAction =
  | { type: 'setProficiency'; value: Proficiency }
  | { type: 'setStyle'; value: string }
  | { type: 'setSpecialization'; value: Specialization }
  | { type: 'setType'; value: WeaponType }
  | { type: 'toggleSmart' }
