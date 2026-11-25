// Splits a source text into chunks for the Claude calls (plan 6.5). Pure.
import { normalizeNewlines } from '../data/text'

export const CHUNK_CHARS = 24_000

const SENTENCE_ENDS = ['. ', '! ', '? ', '\n'] as const

/** Cuts one over-long paragraph at the last sentence end before the limit, or hard at the limit. */
function splitParagraph(paragraph: string, limit: number): string[] {
  const pieces: string[] = []
  let rest = paragraph
  while (rest.length > limit) {
    const window = rest.slice(0, limit)
    let cut = 0
    for (const end of SENTENCE_ENDS) {
      const at = window.lastIndexOf(end)
      if (at >= 0) cut = Math.max(cut, at + end.length)
    }
    if (cut === 0) cut = limit
    const piece = rest.slice(0, cut).trim()
    if (piece !== '') pieces.push(piece)
    rest = rest.slice(cut).trim()
  }
  if (rest !== '') pieces.push(rest)
  return pieces
}

/**
 * - newlines are normalised;
 * - a text of at most `limit` characters is one chunk;
 * - otherwise whole paragraphs (separated by blank lines) are packed greedily up to the limit;
 * - a single paragraph over the limit is cut at a sentence end.
 * No overlap, no empty chunk. Joining the chunks with blank lines reproduces the text
 * apart from whitespace at the cut points.
 */
export function chunkText(text: string, limit: number = CHUNK_CHARS): string[] {
  if (!Number.isInteger(limit) || limit < 1) throw new Error('chunkText: limit must be a positive integer')
  const normalised = normalizeNewlines(text)
  if (normalised.trim() === '') return []
  if (normalised.length <= limit) return [normalised]

  const units = normalised.split(/\n[ \t]*(?:\n[ \t]*)+/)
    .map((paragraph) => paragraph.replace(/^\n+|\s+$/g, ''))
    .filter((paragraph) => paragraph.trim() !== '')
    .flatMap((paragraph) => (paragraph.length > limit ? splitParagraph(paragraph, limit) : [paragraph]))

  const chunks: string[] = []
  let current = ''
  for (const unit of units) {
    if (current === '') {
      current = unit
    } else if (current.length + 2 + unit.length <= limit) {
      current = `${current}\n\n${unit}`
    } else {
      chunks.push(current)
      current = unit
    }
  }
  if (current !== '') chunks.push(current)
  return chunks
}
