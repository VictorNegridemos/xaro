import { createHash } from 'node:crypto'

/** CRLF and lone CR become LF. */
export function normalizeNewlines(s: string): string {
  return s.replace(/\r\n?/g, '\n')
}

export function sha256Hex(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex')
}
