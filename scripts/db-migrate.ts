// npm run db:migrate [-- --dry-run] — the only way migrations are applied (plan 3.5, 3.6).
//   --dry-run : every unapplied migration + the legacy copy + smoke queries inside BEGIN … ROLLBACK.
//   (default) : guard, checksum check, then the Drizzle migrator (all pending files in ONE transaction,
//               see node_modules/drizzle-orm/pg-core/dialect.js `migrate`).
// Never touches the legacy tables; they are only read for checksums.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { printCopyOutcome, runLegacyCopy } from './lib/copy-legacy'
import { runScript } from './lib/env'
import { assertLegacyMatchesLatestBackup, computeLegacyChecksums, diffChecksums } from './lib/legacy'
import { STATEMENT_BREAKPOINT, assertMigrationsAreSafe } from './lib/migration-guard'
import { IntentionalRollback, openScriptDb, type Sql, type TxSql } from './lib/script-db'

const MIGRATIONS_FOLDER = path.join(process.cwd(), 'drizzle')
const SEARCH_SQL_FILE = path.join(process.cwd(), 'scripts', 'sql', 'search-smoke.sql')
const NEW_TABLES = ['import_sources', 'entities', 'entity_relations', 'auth_throttle'] as const
const HL_OPTIONS = 'StartSel="\u0001", StopSel="\u0002", MaxFragments=2, MaxWords=24, MinWords=8, ShortWord=2, FragmentDelimiter=" … "'

interface JournalEntry { idx: number; when: number; tag: string }

function readJournal(): JournalEntry[] {
  const journal = JSON.parse(readFileSync(path.join(MIGRATIONS_FOLDER, 'meta', '_journal.json'), 'utf8')) as { entries: JournalEntry[] }
  return [...journal.entries].sort((a, b) => a.idx - b.idx)
}

/** Journal entries newer than the last applied migration (the migrator's own rule). */
async function pendingMigrations(sql: Sql): Promise<JournalEntry[]> {
  const journal = readJournal()
  const exists = (await sql`SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS present`)[0]?.present === true
  if (!exists) return journal
  const last = (await sql`SELECT created_at FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1`)[0]
  if (!last) return journal
  return journal.filter((entry) => entry.when > Number(last.created_at))
}

async function newTableCounts(sql: Sql | TxSql): Promise<Record<string, number | null>> {
  const counts: Record<string, number | null> = {}
  for (const table of NEW_TABLES) {
    const present = (await sql`SELECT to_regclass(${`public.${table}`}) IS NOT NULL AS present`)[0]?.present === true
    counts[table] = present ? Number((await sql.unsafe(`SELECT count(*)::int AS n FROM public.${table}`))[0]?.n) : null
  }
  return counts
}

/** to_tsquery prefix string for a plain smoke-test word (plan 4.1). */
function prefixOf(q: string): string {
  return (q.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).map((token) => `${token}:*`).join(' & ')
}

async function smokeQueries(tx: TxSql): Promise<void> {
  console.log('\n— smoke: rows per type')
  for (const row of await tx`SELECT type::text AS type, count(*)::int AS n FROM public.entities GROUP BY type ORDER BY type`) {
    console.log(`  ${row.type}: ${row.n}`)
  }

  console.log('\n— smoke: slugs in copy order')
  const slugs = await tx`SELECT legacy_table, slug FROM public.entities WHERE legacy_table IS NOT NULL ORDER BY created_at, id`
  const groups = new Map<string, string[]>()
  for (const row of slugs) groups.set(String(row.legacy_table), [...(groups.get(String(row.legacy_table)) ?? []), String(row.slug)])
  for (const [table, list] of groups) console.log(`  ${table} (${list.length}): ${list.join(', ')}`)

  console.log('\n— smoke: search vectors')
  for (const row of await tx`SELECT name, search_vector::text AS v FROM public.entities WHERE slug IN ('kal-o-dun', 'warp', 'k82aca') ORDER BY slug`) {
    console.log(`  ${row.name}: ${String(row.v).slice(0, 220)}${String(row.v).length > 220 ? ' …' : ''}`)
  }

  const searchSql = readFileSync(SEARCH_SQL_FILE, 'utf8')
  const params = (q: string) => [q, q.replace(/(?<=[\p{L}\p{N}])['’`](?=[\p{L}\p{N}])/gu, ''), prefixOf(q), null, 20, 0, HL_OPTIONS]
  for (const q of ['xaro', 'Ereshkigl', 'weapons']) {
    const rows = await tx.unsafe(searchSql, params(q))
    console.log(`\n— smoke: search "${q}" → ${rows.length} rows`)
    for (const row of rows.slice(0, 5)) console.log(`  ${Number(row.score).toFixed(3)}  ${row.type}  ${row.name}  (${row.slug})`)
  }

  const explain = async (label: string) => {
    const plan = await tx.unsafe(`EXPLAIN ${searchSql}`, params('warp'))
    const text = plan.map((r) => String(r['QUERY PLAN'])).join('\n')
    const scans = text.split('\n').filter((line) => /Scan/.test(line)).map((line) => line.trim().replace(/\s+\(cost.*$/, ''))
    console.log(`\n— smoke: EXPLAIN search "warp" (${label}) — scan nodes:`)
    for (const line of [...new Set(scans)]) console.log(`  ${line}`)
    return text
  }
  await explain('default settings')
  await tx`SET LOCAL enable_seqscan = off`
  const forced = await explain('enable_seqscan = off')
  await tx`SET LOCAL enable_seqscan = on`
  for (const index of ['entities_search_vector_idx', 'entities_name_trgm_idx', 'entities_aliases_trgm_idx']) {
    console.log(`  ${forced.includes(index) ? 'uses' : 'DOES NOT USE'} ${index}`)
  }
}

async function dryRun(sql: Sql): Promise<void> {
  const pending = await pendingMigrations(sql)
  const before = await newTableCounts(sql)
  const reference = await assertLegacyMatchesLatestBackup(sql, 'before the dry run')
  console.log(`\nDRY RUN — ${pending.length} unapplied migration(s): ${pending.map((p) => p.tag).join(', ') || 'none'}`)

  try {
    await sql.begin(async (tx) => {
      for (const entry of pending) {
        const statements = readFileSync(path.join(MIGRATIONS_FOLDER, `${entry.tag}.sql`), 'utf8').split(STATEMENT_BREAKPOINT)
        let n = 0
        for (const statement of statements) {
          n += 1
          try {
            await tx.unsafe(statement)
          } catch (error) {
            console.error(`\nSTATEMENT FAILED — ${entry.tag}.sql, statement ${n}:\n${statement.trim().slice(0, 600)}`)
            throw error
          }
        }
        console.log(`  applied in transaction: ${entry.tag} (${statements.length} statements)`)
      }
      console.log('\n— legacy copy (inside the same transaction)')
      printCopyOutcome(await runLegacyCopy(tx))
      await smokeQueries(tx)

      const inside = diffChecksums(reference, await computeLegacyChecksums(tx))
      console.log('\n— legacy checksums inside the transaction')
      for (const line of inside.lines) console.log(`  ${line}`)
      if (!inside.equal) throw new Error('Legacy checksums changed inside the dry-run transaction')
      throw new IntentionalRollback()
    })
  } catch (error) {
    if (!(error instanceof IntentionalRollback)) throw error
  }
  console.log('\nROLLBACK done.')

  if (pending.length > 0 && before.entities === null) {
    const entitiesGone = (await sql`SELECT to_regclass('public.entities') IS NULL AS gone`)[0]?.gone === true
    const trgm = await sql`SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm'`
    const functions = await sql`SELECT proname FROM pg_proc WHERE proname LIKE 'xaro\_%'`
    console.log(`After rollback: public.entities ${entitiesGone ? 'does not exist' : 'EXISTS'}; pg_trgm ${trgm.length === 0 ? 'not installed' : 'INSTALLED'}; xaro_ functions: ${functions.length}`)
    if (!entitiesGone || trgm.length > 0 || functions.length > 0) throw new Error('The dry run left objects behind')
  } else {
    const after = await newTableCounts(sql)
    console.log(`After rollback: new-table row counts ${JSON.stringify(after)}`)
    if (JSON.stringify(after) !== JSON.stringify(before)) throw new Error('Row counts of the new tables changed during the dry run')
  }
  await assertLegacyMatchesLatestBackup(sql, 'after the dry run')
  console.log('\nDry run OK — nothing was kept.')
}

async function realRun(sql: Sql, db: ReturnType<typeof openScriptDb>['db']): Promise<void> {
  const pending = await pendingMigrations(sql)
  await assertLegacyMatchesLatestBackup(sql, 'before migrating')
  if (pending.length === 0) {
    console.log('\nNothing to migrate: every migration in drizzle/ is already applied.')
    return
  }
  console.log(`\nApplying ${pending.length} migration(s) in one transaction: ${pending.map((p) => p.tag).join(', ')}`)
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER })
  const applied = await sql`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`
  console.log(`Applied. drizzle.__drizzle_migrations now holds ${applied[0]?.n} row(s).`)
  console.log(`New-table row counts: ${JSON.stringify(await newTableCounts(sql))}`)
  await assertLegacyMatchesLatestBackup(sql, 'after migrating')
}

async function main(): Promise<void> {
  const isDryRun = process.argv.includes('--dry-run')
  assertMigrationsAreSafe(MIGRATIONS_FOLDER)
  console.log('Migration guard: all statements in drizzle/*.sql are on the allow-list.')
  const { sql, db, close } = openScriptDb()
  try {
    if (isDryRun) await dryRun(sql)
    else await realRun(sql, db)
  } finally {
    await close()
  }
}

runScript(main)
