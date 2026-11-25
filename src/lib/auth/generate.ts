// Password and session-secret generation (plan 5.4).
import { randomBytes, randomInt } from 'node:crypto'

/** 31 symbols: no i, l, o, 0, 1; no capitals or symbols, so a phone keyboard needs no shift. */
export const PASSWORD_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'
export const PASSWORD_LENGTH = 24
export const PASSWORD_GROUP = 4

/** 24 random characters (about 119 bits), shown as six groups of four separated by hyphens. */
export function generatePassword(): string {
  let raw = ''
  for (let i = 0; i < PASSWORD_LENGTH; i += 1) raw += PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)]
  return raw.match(new RegExp(`.{${PASSWORD_GROUP}}`, 'g'))?.join('-') ?? raw
}

/** 64 hex characters (32 random bytes). */
export function generateSessionSecret(): string {
  return randomBytes(32).toString('hex')
}
