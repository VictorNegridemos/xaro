// Safe highlighting (plan 4.2, H17, K21). ts_headline marks hits with the control characters
// U+0001 and U+0002; this parser turns the string into segments. No HTML string is ever built:
// <Highlight> renders the segments as text nodes and <mark> elements.
import type { SnippetSegment } from './schema'

export const HL_START = '\u0001'
export const HL_STOP = '\u0002'

/** The options string bound as $7 of the search statement. */
export const HEADLINE_OPTIONS =
  `StartSel="${HL_START}", StopSel="${HL_STOP}", MaxFragments=2, MaxWords=24, MinWords=8, ShortWord=2, FragmentDelimiter=" … "`

function push(segments: SnippetSegment[], t: string, h: boolean): void {
  if (t === '') return
  const last = segments[segments.length - 1]
  if (last && last.h === h) last.t += t
  else segments.push({ t, h })
}

/**
 * Splits a ts_headline result into segments. Unpaired markers are dropped: a start marker inside
 * an open highlight and a stop marker without a start are ignored, and text after a start marker
 * that is never closed stays plain. Everything else, "<b>" included, is ordinary text.
 */
export function parseHeadline(headline: string): SnippetSegment[] {
  const segments: SnippetSegment[] = []
  let buffer = ''
  let open = false
  for (const char of headline) {
    if (char === HL_START) {
      if (open) continue
      push(segments, buffer, false)
      buffer = ''
      open = true
    } else if (char === HL_STOP) {
      if (!open) continue
      push(segments, buffer, true)
      buffer = ''
      open = false
    } else {
      buffer += char
    }
  }
  push(segments, buffer, false)
  return segments
}

/** A plain text as one unhighlighted segment (browse mode: snippet = summary). */
export function plainSnippet(text: string): SnippetSegment[] {
  const clean = text.replaceAll(HL_START, '').replaceAll(HL_STOP, '')
  return clean === '' ? [] : [{ t: clean, h: false }]
}
