// Test helper: loads the golden reference in place (plan 8.2, K29). The file is read-only: it is never
// edited or regenerated. Not imported by application code.
import { readFileSync } from 'node:fs'
import path from 'node:path'

import type { Proficiency, Specialization, WeaponLines, WeaponState, WeaponType } from './types'

export const GOLDEN_PATH = path.join(process.cwd(), 'docs', 'overhaul', 'baseline', 'weapon-creator-golden.json')

export type LineKey = keyof WeaponLines
export const LINE_KEYS: readonly LineKey[] = ['attack', 'damage', 'range', 'ammo', 'special']
export const RAW_KEYS = ['attack', 'damage', 'range', 'ammo'] as const

export interface CoreState {
  proficiency: Proficiency
  specialization: Specialization
  type: WeaponType
  smart: boolean
}

export interface GoldenEntry {
  /** The five control values as read back from the DOM (style = what the select shows). */
  input: WeaponState
  reach: 'pointer' | 'keyboard-only'
  styleVia: 'change-event' | 'initial-state' | 'implicit-first-option'
  ui: { typeSelectDisabledClass: boolean; smartCheckboxDisabledClass: boolean }
  /** textContent of the five lines, whitespace collapsed. */
  output: WeaponLines
  /** Exact textContent of the four short lines. */
  raw: Record<(typeof RAW_KEYS)[number], string>
}

export interface GoldenStaleStyle {
  fromProficiency: Proficiency
  styleChosenThere: string
  toProficiency: Proficiency
  reactStyleStateAfter: string
  styleShownInSelectAfter: string
  styleOptionsAfter: string[]
  stateAfter: WeaponState
  output: WeaponLines
}

export interface Golden {
  counts: {
    entries: number
    pointerReachable: number
    keyboardOnly: number
    distinctStatesIgnoringStyle: number
    styleCount: number
    unreachableIgnoringStyle: number
    unreachableTimesStyles: number
    staleStyleSamples: number
  }
  initialState: WeaponState
  options: {
    proficiencies: Proficiency[]
    proficiencyLabels: Record<Proficiency, string>
    stylesByProficiency: Record<Proficiency, string[]>
    specializations: Specialization[]
    types: WeaponType[]
  }
  /** Collapsed "Special: ..." line -> exact textContent of that line. */
  specialRaw: Record<string, string>
  unreachable: CoreState[]
  staleStyle: GoldenStaleStyle[]
  entries: GoldenEntry[]
}

let cached: Golden | undefined

export function loadGolden(): Golden {
  cached ??= JSON.parse(readFileSync(GOLDEN_PATH, 'utf8')) as Golden
  return cached
}

/** What a browser shows: runs of whitespace become one space, trimmed. */
export const collapse = (text: string): string => text.replace(/\s+/g, ' ').trim()

/** Identity of a state ignoring style (style never affects output). */
export const coreKey = (state: CoreState): string =>
  [state.proficiency, state.specialization, state.type, String(state.smart)].join('|')

/** One golden entry per distinct state ignoring style, in file order. */
export function distinctEntries(entries: readonly GoldenEntry[]): GoldenEntry[] {
  const seen = new Map<string, GoldenEntry>()
  for (const entry of entries) {
    const key = coreKey(entry.input)
    if (!seen.has(key)) seen.set(key, entry)
  }
  return [...seen.values()]
}
