// Small queue read used by DELETE /api/import/[id] to tell 404 from 409. The queue writes themselves
// live in src/lib/data/imports.ts (frozen in Step 2).
import { eq } from 'drizzle-orm'
import { getDb, type DbOrTx } from '../db/client'
import { importSources } from '../db/schema'
import type { ImportStatus } from '../data/types'

export async function getImportSourceStatus(id: number, db: DbOrTx = getDb()): Promise<ImportStatus | null> {
  const rows = await db.select({ status: importSources.status }).from(importSources).where(eq(importSources.id, id)).limit(1)
  return rows[0]?.status ?? null
}
