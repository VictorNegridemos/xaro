// npm run db:copy-legacy [-- --dry-run] — copies every legacy row that has no copy yet into entities
// (plan 3.3). Idempotent: a second run inserts 0. Reads the legacy tables, never writes to them.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { printCopyOutcome, runLegacyCopy, type CopyOutcome } from './lib/copy-legacy'
import { runScript } from './lib/env'
import { BACKUPS_DIR, assertLegacyMatchesLatestBackup, type LegacyChecksums } from './lib/legacy'
import { IntentionalRollback, openScriptDb } from './lib/script-db'

const COPY_LOG = path.join(BACKUPS_DIR, 'copy-log.json')

interface CopyLogEntry {
  legacy_table: string
  legacy_id: number
  row_md5: string
  entity_id: number
  slug: string
  copied_at: string
}

function appendCopyLog(outcome: CopyOutcome, checksums: LegacyChecksums): void {
  const existing: CopyLogEntry[] = existsSync(COPY_LOG) ? JSON.parse(readFileSync(COPY_LOG, 'utf8')) as CopyLogEntry[] : []
  const copiedAt = new Date().toISOString()
  for (const row of outcome.inserted) {
    const md5 = checksums.rows[row.legacy_table]?.find((r) => r.id === row.legacy_id)?.md5 ?? ''
    existing.push({
      legacy_table: row.legacy_table, legacy_id: row.legacy_id, row_md5: md5,
      entity_id: row.id, slug: row.slug, copied_at: copiedAt,
    })
  }
  writeFileSync(COPY_LOG, `${JSON.stringify(existing, null, 2)}\n`)
}

async function main(): Promise<void> {
  const isDryRun = process.argv.includes('--dry-run')
  const { sql, close } = openScriptDb()
  try {
    const checksums = await assertLegacyMatchesLatestBackup(sql, 'before the copy')
    let outcome: CopyOutcome | undefined
    try {
      await sql.begin(async (tx) => {
        outcome = await runLegacyCopy(tx)
        if (isDryRun) throw new IntentionalRollback()
      })
    } catch (error) {
      if (!(error instanceof IntentionalRollback)) {
        const e = error as { code?: string; constraint_name?: string; detail?: string }
        if (e.code === '23505') {
          console.error(`Unique violation on ${e.constraint_name ?? 'a constraint'}: ${e.detail ?? ''}`)
          console.error('Nothing was written. Resolve the conflicting slug by hand (plan 3.3) and run the copy again.')
        }
        throw error
      }
    }
    if (!outcome) throw new Error('The copy produced no result')
    printCopyOutcome(outcome)
    if (isDryRun) {
      console.log('DRY RUN — rolled back, nothing was written.')
      return
    }
    if (outcome.inserted.length > 0) {
      appendCopyLog(outcome, checksums)
      console.log(`backups/copy-log.json: ${outcome.inserted.length} entries appended`)
    }
    await assertLegacyMatchesLatestBackup(sql, 'after the copy')
  } finally {
    await close()
  }
}

runScript(main)
