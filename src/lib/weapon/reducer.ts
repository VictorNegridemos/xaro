// State transitions of the weapon creator (plan 8.1). One action per user event, exactly as the old
// handlers behaved (quirks Q1, Q7, Q8, Q13). The reducer does not know about disabled controls: under
// Devouring the UI never dispatches setType or toggleSmart (owner decision O3, see selectors.controlsLocked).
import type { WeaponAction, WeaponState } from './types'

export const initialWeaponState: WeaponState = {
  proficiency: 'simpleMelee1h',
  style: 'Club',
  specialization: 'Heavy',
  type: 'Laser',
  smart: false,
}

export function weaponReducer(state: WeaponState, action: WeaponAction): WeaponState {
  switch (action.type) {
    case 'setProficiency':
      // Q1: the style is NOT reset; it may now be a value that the new list does not contain.
      return { ...state, proficiency: action.value }
    case 'setStyle':
      return { ...state, style: action.value }
    case 'setSpecialization':
      if (action.value === 'Devouring') {
        // Q8: selecting Devouring forces the type and silently clears smart.
        return { ...state, specialization: action.value, type: 'Devouring', smart: false }
      } else if (state.type === 'Devouring') {
        // Q7: leaving Devouring resets the type to Laser (not to the previous type); smart stays as it is.
        return { ...state, specialization: action.value, type: 'Laser' }
      }
      return { ...state, specialization: action.value }
    case 'setType':
      if (action.value === 'Devouring') {
        return { ...state, type: action.value, specialization: 'Devouring', smart: false }
      }
      return { ...state, type: action.value }
    case 'toggleSmart':
      return { ...state, smart: !state.smart }
  }
}
