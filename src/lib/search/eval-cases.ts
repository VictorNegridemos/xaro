// The test queries of plan 4.4 (V4), based on the rows copied from the legacy tables. Case 27
// (`test13`, duplicate test records) was removed after the O1 clean-up (plan 4.4, fix round 1);
// cases 35-38 were added in fix round 1 (F1 repeated / many words, F3 noise token).
// Run by `npm run search:eval` (scripts/search-eval.ts), which only reads the database.
import type { EntityType } from '../data/types'
import type { SearchInputErrorCode } from './schema'

export interface EvalInput {
  q?: string
  type?: string
  page?: string
}

export type Expectation =
  /** The first results have exactly these names, in this order. */
  | { kind: 'top'; names: readonly string[] }
  /** The first results have exactly these slugs, in this order. */
  | { kind: 'topSlugs'; slugs: readonly string[] }
  /** The first N results are these N names, in any order. */
  | { kind: 'firstSet'; names: readonly string[] }
  /** All names are on the page; with `within`, among the first `within` results. */
  | { kind: 'includes'; names: readonly string[]; within?: number }
  /** No result named in `lower` ranks above any result named in `upper`. */
  | { kind: 'noneAbove'; upper: readonly string[]; lower: readonly string[] }
  | { kind: 'count'; exactly?: number; atLeast?: number }
  | { kind: 'allOfType'; type: EntityType }
  | { kind: 'noneOfType'; type: EntityType }
  | { kind: 'orderedByName' }
  /** search() throws SearchInputError with this code (the API answers 400). */
  | { kind: 'inputError'; code: SearchInputErrorCode }
  /** Same result ids in the same order as another case. */
  | { kind: 'sameResultsAs'; caseId: number }
  /** Same `total` as another case. */
  | { kind: 'sameTotalAs'; caseId: number }

export interface EvalCase {
  id: number
  kind: string
  /** One case may run several inputs (case 30); every input must meet every expectation. */
  inputs: readonly EvalInput[]
  expect: readonly Expectation[]
  /**
   * Slugs of legacy test rows the case relies on. After the owner's clean-up of the test and
   * duplicate entries (plan 13, O1) these are gone, and the case is reported as skipped.
   */
  needsSlugs?: readonly string[]
}

const ONLINE = ['Warp', 'Alpha tempora monolayer', 'Warp drone matrix', 'Core'] as const
const OFFLINE = ['Fusion drive', 'Thrusters', 'Rail cannon', 'Inertia wave emitter'] as const

export const EVAL_CASES: readonly EvalCase[] = [
  { id: 1, kind: 'exact name', inputs: [{ q: 'Ereshkigal' }], expect: [{ kind: 'top', names: ['Ereshkigal'] }, { kind: 'topSlugs', slugs: ['ereshkigal'] }] },
  { id: 2, kind: 'exact multi-word name', inputs: [{ q: 'Jagoda Migdal' }], expect: [{ kind: 'top', names: ['Jagoda Migdal'] }] },
  { id: 3, kind: 'alias', inputs: [{ q: 'jagoda' }], expect: [{ kind: 'top', names: ['Jagoda Migdal'] }] },
  { id: 4, kind: 'alias (category)', inputs: [{ q: 'ftl' }], expect: [{ kind: 'top', names: ['Warp'] }] },
  { id: 5, kind: 'alias shared by two', inputs: [{ q: 'weapons' }], expect: [{ kind: 'firstSet', names: ['Rail cannon', 'Inertia wave emitter'] }] },
  { id: 6, kind: 'partial word', inputs: [{ q: 'eresh' }], expect: [{ kind: 'top', names: ['Ereshkigal'] }] },
  { id: 7, kind: 'partial word', inputs: [{ q: 'thrust' }], expect: [{ kind: 'top', names: ['Thrusters'] }] },
  { id: 8, kind: 'partial alphanumeric', inputs: [{ q: 'k82' }], expect: [{ kind: 'top', names: ['K82ACA'] }] },
  { id: 9, kind: 'two-character query', inputs: [{ q: 'ka' }], expect: [{ kind: 'top', names: ["Kal O'Dun"] }] },
  { id: 10, kind: 'typo (missing letter)', inputs: [{ q: 'Ereshkigl' }], expect: [{ kind: 'top', names: ['Ereshkigal'] }] },
  { id: 11, kind: 'typo', inputs: [{ q: 'napnes' }], expect: [{ kind: 'top', names: ['Napones'] }] },
  { id: 12, kind: 'typo (wrong vowel)', inputs: [{ q: 'yaroslav' }], expect: [{ kind: 'top', names: ['Yaraslav'] }] },
  { id: 13, kind: 'plural / stemming', inputs: [{ q: 'cannons' }], expect: [{ kind: 'top', names: ['Rail cannon'] }] },
  { id: 14, kind: 'multi-word', inputs: [{ q: 'rail cannon' }], expect: [{ kind: 'top', names: ['Rail cannon'] }] },
  { id: 15, kind: 'multi-word, body text', inputs: [{ q: 'queen of lies' }], expect: [{ kind: 'top', names: ['Ereshkigal'] }] },
  { id: 16, kind: 'multi-word, stop word in name', inputs: [{ q: 'joy eater' }], expect: [{ kind: 'top', names: ['The Joy Eater'] }] },
  { id: 17, kind: 'apostrophe', inputs: [{ q: "o'dun" }], expect: [{ kind: 'top', names: ["Kal O'Dun"] }] },
  { id: 18, kind: 'apostrophe omitted', inputs: [{ q: 'odun' }], expect: [{ kind: 'top', names: ["Kal O'Dun"] }] },
  { id: 19, kind: 'apostrophe omitted', inputs: [{ q: 'irhtelekmari' }], expect: [{ kind: 'top', names: ["Ir'Htelekmari"] }] },
  { id: 20, kind: 'apostrophe omitted, body-only term', inputs: [{ q: 'xaro' }], expect: [{ kind: 'count', atLeast: 3 }, { kind: 'includes', names: ['Rail cannon', 'Inertia wave emitter'] }] },
  { id: 21, kind: 'attribute value', inputs: [{ q: 'captain' }], expect: [{ kind: 'firstSet', names: ['Jagoda Migdal', 'Triple Blink'] }] },
  { id: 22, kind: 'attribute value', inputs: [{ q: 'botany' }], expect: [{ kind: 'top', names: ['Jagoda Migdal'] }] },
  { id: 23, kind: 'attribute value', inputs: [{ q: 'Online' }], expect: [{ kind: 'includes', names: ONLINE }, { kind: 'noneAbove', upper: ONLINE, lower: OFFLINE }] },
  { id: 24, kind: 'type filter', inputs: [{ q: 'organic', type: 'character' }], expect: [{ kind: 'count', exactly: 6 }, { kind: 'allOfType', type: 'character' }] },
  { id: 25, kind: 'ranking', inputs: [{ q: 'warp' }], expect: [{ kind: 'top', names: ['Warp', 'Warp drone matrix'] }] },
  { id: 26, kind: 'type filter', inputs: [{ q: 'warp', type: 'record' }], expect: [{ kind: 'noneOfType', type: 'ship_system' }] },
  { id: 28, kind: 'natural language', inputs: [{ q: 'who is the captain' }], expect: [{ kind: 'includes', names: ['Jagoda Migdal'], within: 2 }] },
  { id: 29, kind: 'no match', inputs: [{ q: 'zzqqxx' }], expect: [{ kind: 'count', exactly: 0 }] },
  { id: 30, kind: 'former wildcards', inputs: [{ q: '%' }, { q: '_' }], expect: [{ kind: 'count', exactly: 0 }] },
  { id: 31, kind: 'too long', inputs: [{ q: 'a'.repeat(201) }], expect: [{ kind: 'inputError', code: 'query_too_long' }] },
  { id: 32, kind: 'browse', inputs: [{ type: 'ship_system' }], expect: [{ kind: 'count', exactly: 8 }, { kind: 'allOfType', type: 'ship_system' }, { kind: 'orderedByName' }] },
  { id: 33, kind: 'leading minus', inputs: [{ q: '-warp' }], expect: [{ kind: 'sameResultsAs', caseId: 25 }] },
  { id: 34, kind: 'page past the end', inputs: [{ q: 'warp', page: '50' }], expect: [{ kind: 'count', exactly: 0 }, { kind: 'sameTotalAs', caseId: 25 }] },
  // Repeated words are de-duplicated before anything is bound ($1 = 'warp'); see searchTerms().
  { id: 35, kind: 'repeated word (F1)', inputs: [{ q: 'warp '.repeat(40).trim() }], expect: [{ kind: 'top', names: ['Warp', 'Warp drone matrix'] }, { kind: 'sameResultsAs', caseId: 25 }] },
  { id: 36, kind: 'repeated word, mixed case and hyphens (F1)', inputs: [{ q: 'Warp WARP warp-warp wArP' }], expect: [{ kind: 'sameResultsAs', caseId: 25 }] },
  { id: 37, kind: 'many distinct words, capped at 8 (F1)', inputs: [{ q: 'tell me everything about the rail cannon and how far it can shoot please' }], expect: [{ kind: 'top', names: ['Rail cannon'] }] },
  { id: 38, kind: 'emoji + word (F3)', inputs: [{ q: '🚀 warp' }], expect: [{ kind: 'top', names: ['Warp', 'Warp drone matrix'] }, { kind: 'sameResultsAs', caseId: 25 }] },
]
