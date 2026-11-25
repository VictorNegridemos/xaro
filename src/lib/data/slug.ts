import { eq } from 'drizzle-orm'
import { getDb, type DbOrTx } from '../db/client'
import { entities } from '../db/schema'

/** Slugs that collide with a static route segment under /entry. */
export const RESERVED_SLUGS: readonly string[] = ['new']

/**
 * The slug rule of plan 3.3, identical to the SQL of the legacy copy for ASCII input:
 * every run of characters outside [A-Za-z0-9] becomes "-", lower-case, trim "-",
 * cut to 80 characters, trim "-" again. Diacritics are stripped first (NFKD).
 * Returns '' when nothing is left; the caller supplies the fallback.
 */
export function slugBase(name: string): string {
  const trimDashes = (s: string) => s.replace(/^-+|-+$/g, '')
  const ascii = name.normalize('NFKD').replace(/\p{M}+/gu, '')
  return trimDashes(trimDashes(ascii.replace(/[^A-Za-z0-9]+/g, '-').toLowerCase()).slice(0, 80))
}

/** The type as a slug fragment: "ship_system" -> "ship-system". */
export function typeSlug(type: string): string {
  return type.replace(/_/g, '-')
}

/**
 * First free slug for create and import: base (or fallback when base is empty),
 * then base-2, base-3, ... Reserved words are never returned. A slug never changes
 * after creation (K10), so this is only called for new rows.
 */
export async function uniqueSlug(base: string, fallback: string, db: DbOrTx = getDb()): Promise<string> {
  const root = base !== '' ? base : fallback
  for (let n = 1; n < 10_000; n += 1) {
    const candidate = n === 1 ? root : `${root}-${n}`
    if (RESERVED_SLUGS.includes(candidate)) continue
    const taken = await db.select({ id: entities.id }).from(entities).where(eq(entities.slug, candidate)).limit(1)
    if (taken.length === 0) return candidate
  }
  throw new Error(`No free slug for "${root}"`)
}
