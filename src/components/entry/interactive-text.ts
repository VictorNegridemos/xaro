// "Click a word in the text to search for it" (plan 4.3, M15) — the pure part, shared by
// <InteractiveText> and its test.
import { searchHref } from '../../lib/search/href'

/** The 51-word stop list of the old site (src/utils/data_functions.js), unchanged. */
export const STOP_WORDS: readonly string[] = [
  'were', 'been', 'have', 'does', 'doing', 'where', 'what', 'than', 'that', 'which', 'takes', 'other', 'become',
  'becomes', 'becoming', 'until', 'travel', 'while', 'day', 'days', 'week', 'weeks', 'month', 'months', 'year',
  'years', 'hour', 'hours', 'minute', 'minutes', 'second', 'seconds', 'then', 'thus', 'being', 'away', 'from',
  'further', 'more', 'less', 'most', 'least', 'some', 'none', 'itself', 'with', 'each', 'every', 'either',
  'neither', 'both',
]
const STOP_SET: ReadonlySet<string> = new Set(STOP_WORDS)

/** Words: letters and digits, with inner apostrophes and hyphens ("X'aro", "semi-organic"). */
export const WORD_PATTERN = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu

/** Longer than 3 characters, not a stop word, and not the name of the entry being shown. */
export function isWordInteractive(word: string, entryName?: string): boolean {
  if (word.length <= 3) return false
  const lower = word.toLowerCase()
  if (STOP_SET.has(lower)) return false
  return entryName === undefined || lower !== entryName.toLowerCase()
}

/** The link target of a word: the results page, with the word encoded by encodeURIComponent. */
export function wordSearchHref(word: string): string {
  return searchHref({ q: word })
}

export interface TextToken {
  t: string
  /** null = plain text (whitespace, punctuation, newlines and non-interactive words). */
  href: string | null
}

/** Splits a text into plain runs and linked words. Joining every `t` gives the text back. */
export function tokenizeInteractive(text: string, entryName?: string): TextToken[] {
  const tokens: TextToken[] = []
  let plain = ''
  let last = 0
  for (const match of text.matchAll(WORD_PATTERN)) {
    const word = match[0]
    plain += text.slice(last, match.index)
    last = match.index + word.length
    if (isWordInteractive(word, entryName)) {
      if (plain !== '') tokens.push({ t: plain, href: null })
      plain = ''
      tokens.push({ t: word, href: wordSearchHref(word) })
    } else {
      plain += word
    }
  }
  plain += text.slice(last)
  if (plain !== '') tokens.push({ t: plain, href: null })
  return tokens
}

/** `crew_rank` -> "Crew rank". */
export function humanizeKey(key: string): string {
  const words = key.replace(/[_-]+/g, ' ').trim()
  return words === '' ? key : words.charAt(0).toUpperCase() + words.slice(1)
}
