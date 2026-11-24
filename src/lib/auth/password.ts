// Password hashing with Node's scrypt (plan 5.3). Pure: Node `crypto` only, no environment access.
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'

export const SCRYPT_N = 32768
export const SCRYPT_R = 8
export const SCRYPT_P = 1
export const KEY_LENGTH = 64
export const SALT_LENGTH = 16
/** Node's default limit (32 MiB) is too low for N = 32768, r = 8. */
const MAX_MEM = 64 * 1024 * 1024
const MIN_N = 2 ** 14
const MAX_N = 2 ** 17

export interface ParsedHash {
  N: number
  r: number
  p: number
  salt: Buffer
  hash: Buffer
}

/**
 * NFKC, then every whitespace character and hyphen/dash removed, so the generated password can be
 * typed with or without its group separators. Case is significant.
 */
export function canonicalPassword(input: string): string {
  return input.normalize('NFKC').replace(/[\s\p{Pd}]/gu, '')
}

function derive(password: string, salt: Buffer, N: number, r: number, p: number, keyLength: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(canonicalPassword(password), salt, keyLength, { N, r, p, maxmem: MAX_MEM }, (error, key) => {
      if (error) reject(error)
      else resolve(key)
    })
  })
}

/** `scrypt:32768:8:1:<salt, 32 hex>:<hash, 128 hex>`. Contains no `$`. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH)
  const key = await derive(password, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P, KEY_LENGTH)
  return `scrypt:${SCRYPT_N}:${SCRYPT_R}:${SCRYPT_P}:${salt.toString('hex')}:${key.toString('hex')}`
}

/** null for anything that is not exactly the format written by hashPassword(). */
export function parseHash(value: string | undefined | null): ParsedHash | null {
  if (typeof value !== 'string') return null
  const fields = value.split(':')
  if (fields.length !== 6) return null
  const [scheme, nText, rText, pText, saltHex, hashHex] = fields as [string, string, string, string, string, string]
  if (scheme !== 'scrypt') return null
  if (!/^[1-9]\d{4,5}$/.test(nText) || rText !== String(SCRYPT_R) || pText !== String(SCRYPT_P)) return null
  const N = Number(nText)
  if (N < MIN_N || N > MAX_N || (N & (N - 1)) !== 0) return null
  if (!/^[0-9a-f]+$/i.test(saltHex) || saltHex.length !== SALT_LENGTH * 2) return null
  if (!/^[0-9a-f]+$/i.test(hashHex) || hashHex.length !== KEY_LENGTH * 2) return null
  return { N, r: SCRYPT_R, p: SCRYPT_P, salt: Buffer.from(saltHex, 'hex'), hash: Buffer.from(hashHex, 'hex') }
}

/** Derives with the stored parameters and compares in constant time. Never throws. */
export async function verifyPassword(password: string, stored: ParsedHash): Promise<boolean> {
  try {
    const key = await derive(password, stored.salt, stored.N, stored.r, stored.p, stored.hash.length)
    return key.length === stored.hash.length && timingSafeEqual(key, stored.hash)
  } catch {
    return false
  }
}
