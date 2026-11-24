// Pure derivation of the five output lines (plan 8.1). Every branch mirrors the pre-overhaul component
// (commit 7b0afe7, WeaponCreator.js); the quirks Q3-Q6, Q9 and Q10 of 01-investigation-weapon-creator.md
// are intentional and guarded by the golden-file tests. Do not "fix" anything here.
import { specialEffects, weaponSpecializations, weaponTypes } from './data'
import type { Proficiency, WeaponLines, WeaponState } from './types'

export type Attribute = keyof typeof weaponSpecializations
export type DamageType = keyof typeof weaponTypes
type SpecialEffectKey = keyof typeof specialEffects

export interface WeaponParts {
  /** '2 +' or '3 +' for Laser, otherwise undefined (the attack line then has two spaces, Q5). */
  bonus: '2 +' | '3 +' | undefined
  attribute: Attribute
  dice: string
  damageType: DamageType
  range: string
  /** 'unlimited', a number as text, or '' for a state the UI can never reach (type Devouring without the specialization). */
  clip: string
  total: string
  /** The special text exactly as in the data table, template-literal whitespace included. */
  special: string
}

function attributeOf(state: WeaponState): Attribute {
  const keys = Object.keys(weaponSpecializations) as Attribute[]
  return keys.find((key) => weaponSpecializations[key] === state.specialization) as Attribute
}

function damageTypeOf(state: WeaponState): DamageType {
  const keys = Object.keys(weaponTypes) as DamageType[]
  return keys.find((key) => weaponTypes[key] === state.type) as DamageType
}

function attackBonus({ type, proficiency }: WeaponState): WeaponParts['bonus'] {
  if (type === 'Laser') {
    if (proficiency === 'martialRanged2h' || proficiency === 'martialMelee2h') {
      return '3 +'
    } else {
      return '2 +'
    }
  }
  return undefined
}

function totalAmmo({ proficiency, specialization }: WeaponState): string {
  if (proficiency === 'martialRanged2h' && specialization !== 'Devouring') {
    return '11'
  } else if ((proficiency === 'martialRanged1h' || proficiency === 'simpleRanged1h') && specialization !== 'Devouring') {
    return '9'
  } else {
    return 'unlimited'
  }
}

function clipSize({ proficiency, specialization, type }: WeaponState): string {
  let clip = ''

  if ((proficiency === 'simpleRanged1h' || proficiency === 'martialRanged1h') && specialization !== 'Devouring') {
    if (type === 'Gravity') {
      clip = '3'
    } else if (type === 'Tesla' || type === 'Toxic') {
      clip = '4'
    } else if (type === 'Laser' || type === 'Plasma' || type === 'Kinetic' || type === 'Cryogenic' || type === 'Acidic') {
      clip = '5'
    } else if (type === 'Radiation' || type === 'Sonic') {
      clip = '6'
    }
  } else if (proficiency === 'martialRanged2h' && specialization !== 'Devouring') {
    if (type === 'Gravity') {
      clip = '4'
    } else if (type === 'Tesla' || type === 'Toxic') {
      clip = '5'
    } else if (type === 'Laser' || type === 'Plasma' || type === 'Kinetic' || type === 'Cryogenic' || type === 'Acidic') {
      clip = '6'
    } else if (type === 'Radiation' || type === 'Sonic') {
      clip = '7'
    }
  } else {
    clip = 'unlimited'
  }

  return clip
}

function rangeOf(proficiency: Proficiency): string {
  if (proficiency === 'martialRanged2h') {
    return '150/600'
  } else if (proficiency === 'simpleRanged1h' || proficiency === 'martialRanged1h') {
    return '30/60'
  } else if (proficiency === 'martialMelee2h') {
    return '10'
  } else {
    return '5'
  }
}

function damageDice({ proficiency, specialization, smart }: WeaponState): string {
  let damage = ''

  if (proficiency === 'simpleMelee1h') {
    if (specialization === 'Devouring') {
      damage = '2d10 / 1d10'
    } else {
      damage = '1d10'
    }
  } else if (proficiency === 'simpleRanged1h') {
    if (specialization === 'Devouring') {
      damage = '4d4 / 2d4'
    } else {
      damage = '2d4'
    }
  } else if (proficiency === 'martialMelee1h') {
    if (specialization === 'Devouring') {
      damage = '4d10 / 2d10'
    } else if (smart) {
      damage = '3d4'
    } else {
      damage = '2d10'
    }
  } else if (proficiency === 'martialMelee2h') {
    if (specialization === 'Devouring') {
      damage = '6d10 / 3d10'
    } else if (smart) {
      damage = '2d10'
    } else {
      damage = '3d10'
    }
  } else if (proficiency === 'martialRanged1h') {
    if (specialization === 'Devouring') {
      damage = '8d4 / 4d4'
    } else if (smart) {
      damage = '3d4'
    } else {
      damage = '4d4'
    }
  } else if (proficiency === 'martialRanged2h') {
    if (specialization === 'Devouring') {
      damage = '6d6 / 3d6'
    } else if (smart) {
      damage = '4d4'
    } else {
      damage = '3d6'
    }
  }

  return damage
}

/** The individual values behind the five lines. `state.style` is never read: style affects no output. */
export function deriveWeaponParts(state: WeaponState): WeaponParts {
  const damageType = damageTypeOf(state)
  const effectKey = (damageType + state.proficiency.slice(-2)) as SpecialEffectKey
  return {
    bonus: attackBonus(state),
    attribute: attributeOf(state),
    dice: damageDice(state),
    damageType,
    range: rangeOf(state.proficiency),
    clip: clipSize(state),
    total: totalAmmo(state),
    special: specialEffects[effectKey],
  }
}

/** The damage value as the old JSX printed it between "Damage:" and the damage type. */
export function damageExpression(parts: WeaponParts, smart: boolean): string {
  return smart ? parts.dice : `${parts.dice} + ${parts.attribute} modifier`
}

/** The ammo clause as the old JSX printed it before the comma. */
export function clipExpression(parts: WeaponParts): string {
  return parts.clip === 'unlimited' ? 'unlimited' : `reload after ${parts.clip} uses`
}

/** The five lines exactly as the old JSX produced DOM text (label included, whitespace not collapsed). */
export function deriveWeapon(state: WeaponState): WeaponLines {
  const parts = deriveWeaponParts(state)
  return {
    attack: `Attack: ${parts.bonus ?? ''} ${parts.attribute} modifier + proficiency bonus`,
    damage: `Damage: ${damageExpression(parts, state.smart)} ${parts.damageType}`,
    range: `Range: ${parts.range} feet`,
    ammo: `Ammo: ${clipExpression(parts)}, ${parts.total} total ammo`,
    special: `Special: ${parts.special}`,
  }
}
