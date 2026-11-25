// The import queue (plan 3.8, 6.7, 6.8). Only stores and lists; processing is done by scripts/import.ts.
import { and, desc, eq, inArray } from 'drizzle-orm'
import { getDb, type DbOrTx } from '../db/client'
import { importSources } from '../db/schema'
import { normalizeNewlines, sha256Hex } from './text'
import type { ImportOrigin, ImportSourceSummary } from './types'

const summaryColumns = {
  id: importSources.id,
  filename: importSources.filename,
  contentHash: importSources.contentHash,
  byteSize: importSources.byteSize,
  origin: importSources.origin,
  status: importSources.status,
  error: importSources.error,
  result: importSources.result,
  attempts: importSources.attempts,
  createdAt: importSources.createdAt,
  startedAt: importSources.startedAt,
  processedAt: importSources.processedAt,
} as const

type SummaryRow = Omit<ImportSourceSummary, 'origin'> & { origin: string }

function toSummary(row: SummaryRow): ImportSourceSummary {
  return { ...row, origin: row.origin === 'cli' ? 'cli' : 'upload' }
}

/**
 * Stores a text as a pending source. The hash is SHA-256 of the newline-normalised text,
 * so the same content is found again whatever its filename (created: false).
 */
export async function enqueueImportSource(
  input: { filename: string; content: string; origin: ImportOrigin }, db: DbOrTx = getDb(),
): Promise<{ source: ImportSourceSummary; created: boolean }> {
  const content = normalizeNewlines(input.content)
  const contentHash = sha256Hex(content)
  const inserted = await db.insert(importSources).values({
    filename: input.filename,
    content,
    contentHash,
    byteSize: Buffer.byteLength(content, 'utf8'),
    origin: input.origin,
  }).onConflictDoNothing({ target: importSources.contentHash }).returning(summaryColumns)
  const row = inserted[0]
  if (row) return { source: toSummary(row), created: true }

  const existing = await db.select(summaryColumns).from(importSources)
    .where(eq(importSources.contentHash, contentHash)).limit(1)
  const found = existing[0]
  if (!found) throw new Error('Import source vanished between insert and select')
  return { source: toSummary(found), created: false }
}

/** Newest first. */
export async function listImportSources(limit = 50, db: DbOrTx = getDb()): Promise<ImportSourceSummary[]> {
  const rows = await db.select(summaryColumns).from(importSources)
    .orderBy(desc(importSources.createdAt), desc(importSources.id)).limit(limit)
  return rows.map(toSummary)
}

/** Removes a row only while it is pending or failed. */
export async function deleteQueuedImportSource(id: number, db: DbOrTx = getDb()): Promise<boolean> {
  const rows = await db.delete(importSources)
    .where(and(eq(importSources.id, id), inArray(importSources.status, ['pending', 'failed'])))
    .returning({ id: importSources.id })
  return rows.length > 0
}
