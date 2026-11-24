// Golden-file tests 1-5 (plan 8.2) plus the data check of task 9.2 E.1 and the O3 reachability proof.
// Reference: docs/overhaul/baseline/weapon-creator-golden.json, produced by rendering the pre-overhaul
// component. Test 6 (DOM assembly) is src/components/weapon/readout.test.tsx.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { specialEffects, weaponProficiencies, weaponSpecializations, weaponStyles, weaponTypes } from './data'
import { deriveWeapon } from './derive'
import { LINE_KEYS, RAW_KEYS, collapse, coreKey, distinctEntries, loadGolden, type CoreState } from './golden-fixture'
import { initialWeaponState, weaponReducer } from './reducer'
import {
  controlsLocked, displayedStyle, isDevouringLook, proficiencyOptions, specializationOptions, styleOptions, typeOptions,
} from './selectors'
import type { WeaponAction, WeaponState } from './types'

const golden = loadGolden()
const { entries } = golden

const goldenKeys = (filter: (reach: string) => boolean): Set<string> =>
  new Set(entries.filter((entry) => filter(entry.reach)).map((entry) => coreKey(entry.input)))
const sorted = (set: Set<string>): string[] => [...set].sort()

/** Every action with every option value that the given state offers. */
function allActions(state: WeaponState): WeaponAction[] {
  return [
    ...proficiencyOptions.map(([value]): WeaponAction => ({ type: 'setProficiency', value })),
    ...styleOptions(state).map((value): WeaponAction => ({ type: 'setStyle', value })),
    ...specializationOptions.map((value): WeaponAction => ({ type: 'setSpecialization', value })),
    ...typeOptions.map((value): WeaponAction => ({ type: 'setType', value })),
    { type: 'toggleSmart' },
  ]
}

/** Breadth-first search over full states (style included). Returns the reached states. */
function reach(respectDisabledControls: boolean): Map<string, WeaponState> {
  const fullKey = (state: WeaponState) => `${coreKey(state)}|${state.style}`
  const seen = new Map<string, WeaponState>([[fullKey(initialWeaponState), initialWeaponState]])
  const queue: WeaponState[] = [initialWeaponState]
  for (let state = queue.shift(); state !== undefined; state = queue.shift()) {
    for (const action of allActions(state)) {
      // A control with the `disabled` attribute fires no event, by pointer or by keyboard (O3).
      if (respectDisabledControls && controlsLocked(state) && (action.type === 'setType' || action.type === 'toggleSmart')) continue
      const next = weaponReducer(state, action)
      const key = fullKey(next)
      if (!seen.has(key)) {
        seen.set(key, next)
        queue.push(next)
      }
    }
  }
  return seen
}

const coreKeysOf = (states: Map<string, WeaponState>): Set<string> => new Set([...states.values()].map(coreKey))
/** The five control values as the DOM would report them (style = what the select shows). */
const domInputKey = (state: WeaponState): string => `${coreKey(state)}|${displayedStyle(state)}`

describe('golden file shape', () => {
  test('counts: 5612 entries, 4646 pointer + 966 keyboard-only, 732 / 606 distinct states, 60 unreachable, 30 stale-style samples', () => {
    assert.equal(entries.length, 5612)
    assert.equal(golden.counts.entries, 5612)
    assert.equal(entries.filter((entry) => entry.reach === 'pointer').length, 4646)
    assert.equal(entries.filter((entry) => entry.reach === 'keyboard-only').length, 966)
    assert.equal(goldenKeys(() => true).size, 732)
    assert.equal(goldenKeys((r) => r === 'pointer').size, 606)
    assert.equal(goldenKeys((r) => r === 'keyboard-only').size, 126)
    assert.equal(golden.unreachable.length, 60)
    assert.equal(golden.staleStyle.length, 30)
    assert.equal(Object.keys(golden.specialRaw).length, 20)
  })

  test('a state is never both pointer-reachable and keyboard-only', () => {
    const pointer = goldenKeys((r) => r === 'pointer')
    for (const key of goldenKeys((r) => r === 'keyboard-only')) assert.ok(!pointer.has(key), key)
  })
})

describe('data tables (task E.1)', () => {
  test('every specialEffects value equals the golden raw special text after the "Special: " prefix', () => {
    const rawTexts = new Set(Object.values(golden.specialRaw))
    const values = Object.entries(specialEffects)
    assert.equal(values.length, 22)
    for (const [key, text] of values) assert.ok(rawTexts.has(`Special: ${text}`), `specialEffects.${key}`)
    assert.equal(new Set(values.map(([, text]) => text)).size, 20)
    // ...and the other way round: every golden raw text is one of the table values.
    const tableTexts = new Set(values.map(([, text]) => `Special: ${text}`))
    for (const raw of rawTexts) assert.ok(tableTexts.has(raw), raw.slice(0, 60))
  })

  test('special effect keys are <damage type><1h|2h> for every damage type', () => {
    const expected = Object.keys(weaponTypes).flatMap((damageType) => [`${damageType}1h`, `${damageType}2h`])
    assert.deepEqual(Object.keys(specialEffects), expected)
  })
})

describe('1. outputs for all 5612 golden entries', () => {
  test('deriveWeapon equals the golden output (collapsed and raw), and style never affects it', () => {
    let compared = 0
    for (const entry of entries) {
      const lines = deriveWeapon(entry.input)
      const where = JSON.stringify(entry.input)
      for (const key of LINE_KEYS) assert.equal(collapse(lines[key]), entry.output[key], `${key} ${where}`)
      for (const key of RAW_KEYS) assert.equal(lines[key], entry.raw[key], `raw ${key} ${where}`)
      assert.equal(lines.special, golden.specialRaw[entry.output.special], `raw special ${where}`)
      assert.deepEqual(deriveWeapon({ ...entry.input, style: 'a style that does not exist' }), lines, `style ${where}`)
      compared += 1
    }
    assert.equal(compared, 5612)
  })

  test('the entries are exactly proficiency x valid style x the 122 reachable (specialization, type, smart) combinations', () => {
    const keys = new Set(entries.map((entry) => `${coreKey(entry.input)}|${entry.input.style}`))
    assert.equal(keys.size, 5612)
    for (const entry of entries) {
      assert.ok(golden.options.stylesByProficiency[entry.input.proficiency].includes(entry.input.style))
    }
  })
})

describe('2. options', () => {
  test('proficiency values, labels and order', () => {
    assert.deepEqual(proficiencyOptions.map(([value]) => value), golden.options.proficiencies)
    assert.deepEqual(Object.fromEntries(proficiencyOptions), golden.options.proficiencyLabels)
    assert.deepEqual(Object.keys(weaponProficiencies), golden.options.proficiencies)
  })

  test('styles by proficiency', () => {
    assert.deepEqual(JSON.parse(JSON.stringify(weaponStyles)), golden.options.stylesByProficiency)
    for (const proficiency of golden.options.proficiencies) {
      assert.deepEqual([...styleOptions({ proficiency })], golden.options.stylesByProficiency[proficiency])
    }
    assert.equal(Object.values(weaponStyles).flat().length, golden.counts.styleCount)
  })

  test('specializations and types', () => {
    assert.deepEqual([...specializationOptions], golden.options.specializations)
    assert.deepEqual(Object.values(weaponSpecializations), golden.options.specializations)
    assert.deepEqual([...typeOptions], golden.options.types)
    assert.deepEqual(Object.values(weaponTypes), golden.options.types)
  })

  test('initial state', () => {
    assert.deepEqual(initialWeaponState, golden.initialState)
  })
})

describe('3. transitions and reachability', () => {
  test('reducer alone (old handlers, controls operable): exactly the 732 golden states, none of the 60 unreachable', () => {
    const reached = reach(false)
    assert.deepEqual(sorted(coreKeysOf(reached)), sorted(goldenKeys(() => true)))
    assert.equal(coreKeysOf(reached).size, 732)
    const reachedKeys = coreKeysOf(reached)
    for (const state of golden.unreachable) assert.ok(!reachedKeys.has(coreKey(state)), coreKey(state))
    // With style: every golden entry is a reached DOM input and nothing else is.
    const inputs = new Set([...reached.values()].map(domInputKey))
    assert.deepEqual(sorted(inputs), sorted(new Set(entries.map((entry) => `${coreKey(entry.input)}|${entry.input.style}`))))
    assert.equal(inputs.size, 5612)
  })

  test('UI under O3 (type select and Smart disabled when locked): exactly the 606 pointer states / 4646 pointer entries', () => {
    const reached = reach(true)
    const reachedKeys = coreKeysOf(reached)
    assert.deepEqual(sorted(reachedKeys), sorted(goldenKeys((r) => r === 'pointer')))
    assert.equal(reachedKeys.size, 606)
    const inputs = new Set([...reached.values()].map(domInputKey))
    const pointerInputs = new Set(
      entries.filter((entry) => entry.reach === 'pointer').map((entry) => `${coreKey(entry.input)}|${entry.input.style}`))
    assert.deepEqual(sorted(inputs), sorted(pointerInputs))
    assert.equal(inputs.size, 4646)
    for (const state of golden.unreachable) assert.ok(!reachedKeys.has(coreKey(state)), coreKey(state))
  })

  test('O3 removes exactly the 966 keyboard-only entries (126 states): Devouring with another type and/or smart', () => {
    const all = coreKeysOf(reach(false))
    const ui = coreKeysOf(reach(true))
    const lost = new Set([...all].filter((key) => !ui.has(key)))
    assert.deepEqual(sorted(lost), sorted(goldenKeys((r) => r === 'keyboard-only')))
    assert.equal(lost.size, 126)
    for (const entry of entries) {
      const { specialization, type, smart } = entry.input
      const keyboardOnlyShape = specialization === 'Devouring' && (type !== 'Devouring' || smart)
      assert.equal(entry.reach === 'keyboard-only', keyboardOnlyShape, JSON.stringify(entry.input))
    }
  })

  test('under O3 every locked state is (Devouring, Devouring, not smart)', () => {
    for (const state of reach(true).values()) {
      if (!controlsLocked(state)) continue
      assert.equal(state.type, 'Devouring')
      assert.equal(state.smart, false)
    }
  })

  test('the quirks of the old handlers (Q1, Q7, Q8)', () => {
    const smartPlasma: WeaponState = { ...initialWeaponState, type: 'Plasma', smart: true }
    const viaSpec = weaponReducer(smartPlasma, { type: 'setSpecialization', value: 'Devouring' })
    assert.deepEqual(viaSpec, { ...smartPlasma, specialization: 'Devouring', type: 'Devouring', smart: false })
    const viaType = weaponReducer(smartPlasma, { type: 'setType', value: 'Devouring' })
    assert.deepEqual(viaType, viaSpec)
    const left = weaponReducer(viaSpec, { type: 'setSpecialization', value: 'BCI' })
    assert.deepEqual(left, { ...smartPlasma, specialization: 'BCI', type: 'Laser', smart: false })
    const otherSpec = weaponReducer(smartPlasma, { type: 'setSpecialization', value: 'Reflex' })
    assert.deepEqual(otherSpec, { ...smartPlasma, specialization: 'Reflex' })
    const awayByKeyboard = weaponReducer(viaSpec, { type: 'setType', value: 'Sonic' })
    assert.deepEqual(awayByKeyboard, { ...viaSpec, type: 'Sonic' })
    const proficiency = weaponReducer(smartPlasma, { type: 'setProficiency', value: 'martialRanged2h' })
    assert.deepEqual(proficiency, { ...smartPlasma, proficiency: 'martialRanged2h' })
  })
})

describe('4. UI flags', () => {
  test('controlsLocked equals both disabled-class flags of every entry', () => {
    for (const entry of entries) {
      const locked = controlsLocked(entry.input)
      assert.equal(locked, entry.ui.typeSelectDisabledClass, JSON.stringify(entry.input))
      assert.equal(locked, entry.ui.smartCheckboxDisabledClass, JSON.stringify(entry.input))
    }
  })

  test('isDevouringLook is true exactly when the specialization or the type is Devouring', () => {
    const core: CoreState = { proficiency: 'simpleMelee1h', specialization: 'Heavy', type: 'Laser', smart: false }
    assert.equal(isDevouringLook(core), false)
    assert.equal(isDevouringLook({ ...core, specialization: 'Devouring' }), true)
    assert.equal(isDevouringLook({ ...core, type: 'Devouring' }), true)
  })
})

describe('5. stale style (Q1), 30 samples', () => {
  test('state keeps the old style; the select shows the first option of the new list', () => {
    let checked = 0
    for (const sample of golden.staleStyle) {
      let state = weaponReducer(initialWeaponState, { type: 'setProficiency', value: sample.fromProficiency })
      // As in the generator: a native select fires no change event when the option it already shows is
      // chosen (the one-style proficiencies), so the state then still holds the initial "Club".
      if (displayedStyle(state) !== sample.styleChosenThere) {
        state = weaponReducer(state, { type: 'setStyle', value: sample.styleChosenThere })
      }
      state = weaponReducer(state, { type: 'setProficiency', value: sample.toProficiency })
      const where = `${sample.fromProficiency} -> ${sample.toProficiency}`
      assert.equal(state.style, sample.reactStyleStateAfter, where)
      assert.equal(displayedStyle(state), sample.styleShownInSelectAfter, where)
      assert.deepEqual([...styleOptions(state)], sample.styleOptionsAfter, where)
      assert.deepEqual({ ...state, style: displayedStyle(state) }, sample.stateAfter, where)
      const lines = deriveWeapon(state)
      for (const key of LINE_KEYS) assert.equal(collapse(lines[key]), sample.output[key], `${key} ${where}`)
      // Going back re-selects the remembered style.
      const back = weaponReducer(state, { type: 'setProficiency', value: sample.fromProficiency })
      assert.equal(displayedStyle(back), sample.styleChosenThere, where)
      checked += 1
    }
    assert.equal(checked, 30)
  })

  test('displayedStyle equals the style for every golden entry, and the stale default shows the first option', () => {
    for (const entry of entries) assert.equal(displayedStyle(entry.input), entry.input.style)
    for (const entry of distinctEntries(entries)) {
      const stale = { ...entry.input, style: 'Club' }
      const expected = entry.input.proficiency === 'simpleMelee1h' ? 'Club' : golden.options.stylesByProficiency[entry.input.proficiency][0]
      assert.equal(displayedStyle(stale), expected)
    }
  })
})
