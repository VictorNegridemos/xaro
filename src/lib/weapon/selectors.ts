// Read-only helpers for the UI (plan 8.1).
import { weaponProficiencies, weaponSpecializations, weaponStyles, weaponTypes } from './data'
import type { Proficiency, Specialization, WeaponState, WeaponType } from './types'

/** Proficiency options in rendered order: [value, label]. */
export const proficiencyOptions = Object.entries(weaponProficiencies) as ReadonlyArray<readonly [Proficiency, string]>

/** Specialization options in rendered order (value = label). */
export const specializationOptions: readonly Specialization[] = Object.values(weaponSpecializations)

/** Weapon type options in rendered order (value = label). */
export const typeOptions: readonly WeaponType[] = Object.values(weaponTypes)

/** The style list of the current proficiency, in rendered order. */
export function styleOptions(state: Pick<WeaponState, 'proficiency'>): readonly string[] {
  return weaponStyles[state.proficiency]
}

/**
 * What the style select shows. After a proficiency change the state may hold a style that is not in the
 * new list (Q1); a controlled native <select> then shows its first option. Anything that displays the
 * style must use this, never `state.style`.
 */
export function displayedStyle(state: Pick<WeaponState, 'proficiency' | 'style'>): string {
  const options = styleOptions(state)
  return options.includes(state.style) ? state.style : (options[0] ?? '')
}

/**
 * True when the type select and the Smart checkbox are sealed. The condition is on the specialization
 * only, as in the old component. Owner decision O3: the UI gives both controls the `disabled` attribute.
 */
export function controlsLocked(state: Pick<WeaponState, 'specialization'>): boolean {
  return state.specialization === 'Devouring'
}

/** The Devouring look of the console: the specialization or the type is Devouring. */
export function isDevouringLook(state: Pick<WeaponState, 'specialization' | 'type'>): boolean {
  return state.specialization === 'Devouring' || state.type === 'Devouring'
}
