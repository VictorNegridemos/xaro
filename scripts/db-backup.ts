// npm run db:backup — exports the three legacy tables to backups/<UTC timestamp>/ (git-ignored)
// with checksums and a restore.sql. Read-only: one REPEATABLE READ READ ONLY transaction (plan 3.4).
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { runScript } from './lib/env'
import { BACKUPS_DIR, LEGACY_TABLES, computeLegacyChecksums, utcStamp } from './lib/legacy'
import {
  FIXTURE_TABLE, QUOTING_FIXTURE, buildRestoreSelect, buildSetvalLine, insertLineToSelect,
} from './lib/restore-sql'
import { openScriptDb, type TxSql } from './lib/script-db'

/** Applies the restore template to strings with ', \, newline and $$ and reads the literals back. */
async function selfTestQuoting(tx: TxSql): Promise<void> {
  const select = buildRestoreSelect(FIXTURE_TABLE, '(VALUES (1, $1::text, $2::text, $3::text, $4::text)) AS f(id, a, b, c, d)')
  const produced = await tx.unsafe(select, [...QUOTING_FIXTURE])
  const line = String(produced[0]?.line ?? '')
  const back = (await tx.unsafe(insertLineToSelect(line)))[0]
  const values = back ? [back.a, back.b, back.c, back.d] : []
  QUOTING_FIXTURE.forEach((expected, i) => {
    if (values[i] !== expected) {
      throw new Error(`restore.sql quoting self-test failed for fixture value ${i + 1}; no backup was written`)
    }
  })
}

async function assertColumnsMatch(tx: TxSql): Promise<void> {
  for (const table of LEGACY_TABLES) {
    const rows = await tx`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ${table.name} ORDER BY ordinal_position`
    const live = rows.map((r) => String(r.column_name))
    if (live.join(',') !== table.columns.join(',')) {
      throw new Error(`${table.name}: live columns [${live.join(', ')}] differ from the expected list; update scripts/lib/legacy.ts`)
    }
  }
}

async function main(): Promise<void> {
  const { sql, close } = openScriptDb()
  try {
    const stamp = utcStamp()
    const dir = path.join(BACKUPS_DIR, stamp)

    const snapshot = await sql.begin('isolation level repeatable read read only', async (tx) => {
      await assertColumnsMatch(tx)
      await selfTestQuoting(tx)
      const version = String((await tx`SELECT version() AS v`)[0]?.v ?? '')
      const tables: Record<string, unknown[]> = {}
      const restore: string[] = []
      for (const table of LEGACY_TABLES) {
        tables[table.name] = [...(await tx.unsafe(`SELECT * FROM public.${table.name} ORDER BY id`))]
        const lines = await tx.unsafe(buildRestoreSelect(table))
        restore.push(`-- ${table.name}: ${lines.length} rows`, ...lines.map((r) => String(r.line)), buildSetvalLine(table), '')
      }
      const checksums = await computeLegacyChecksums(tx)
      return { version, tables, restore, checksums }
    })

    mkdirSync(dir, { recursive: true })
    for (const table of LEGACY_TABLES) {
      writeFileSync(path.join(dir, `${table.name}.json`), `${JSON.stringify(snapshot.tables[table.name], null, 2)}\n`)
    }
    writeFileSync(path.join(dir, 'checksums.json'), `${JSON.stringify(snapshot.checksums, null, 2)}\n`)
    writeFileSync(path.join(dir, 'restore.sql'), [
      '-- DISASTER RECOVERY ONLY — never executed by the overhaul.',
      `-- Backup of the three legacy tables taken at ${stamp}. Literals were quoted by Postgres (format %L).`,
      '-- To restore into EMPTY tables of the original shape: psql -f restore.sql',
      'BEGIN;',
      '',
      ...snapshot.restore,
      'COMMIT;',
      '',
    ].join('\n'))
    writeFileSync(path.join(dir, 'manifest.json'), `${JSON.stringify({
      takenAt: stamp,
      serverVersion: snapshot.version,
      rowCounts: Object.fromEntries(snapshot.checksums.tables.map((t) => [t.tbl, t.n])),
    }, null, 2)}\n`)
    writeFileSync(path.join(BACKUPS_DIR, 'LATEST'), `${stamp}\n`)

    console.log(`Backup written to backups/${stamp}/ (restore.sql quoting self-test passed)`)
    for (const t of snapshot.checksums.tables) console.log(`  ${t.tbl}: ${t.n} rows, md5 ${t.md5}`)
  } finally {
    await close()
  }
}

runScript(main)
