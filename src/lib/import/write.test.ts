// A recording database double (drizzle's pg-proxy driver): every SQL statement the real ImportStore
// issues is captured. A dry run (file path and --pending) must issue no INSERT, UPDATE or DELETE.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, test } from 'node:test'
import { drizzle } from 'drizzle-orm/pg-proxy'
import { LEGACY_KEYS } from '../data/legacy-keys'
import type { Db } from '../db/client'
import * as schema from '../db/schema'
import type { ClaudeRunner } from './cli'
import { runImport, type ImportOptions } from './pipeline'
import { createImportStore } from './write'

const STUB = readFileSync(path.join(process.cwd(), 'samples', 'sample-extraction.stub.json'), 'utf8')
const SAMPLE = readFileSync(path.join(process.cwd(), 'samples', 'sample-log.txt'), 'utf8')
const stubRunner: ClaudeRunner = async () => ({ ok: true, text: STUB })

const T = '2026-11-24T00:00:00.000Z'
// One existing entity shaped like a legacy copy (columns in entityColumns order of data/entities.ts).
const KIK_INDEX = [3, 'character', 'Kik', ['Blink']]
const KIK_ROW = [3, 'character', 'Kik', 'kik', ['Blink'], 'Pilot.', 'Kik flies.', { crew_rank: 'Pilot' }, null, LEGACY_KEYS.crew, 3, T, T]

function recordingDb(queueRows: unknown[][] = []) {
  const statements: string[] = []
  const client = async (sqlText: string, _params: unknown[], method: string) => {
    statements.push(sqlText)
    const s = sqlText.toLowerCase()
    if (method !== 'all' && method !== 'execute') return { rows: [] }
    if (s.includes('from "import_sources"') && s.includes('"content_hash" =')) return { rows: [] }
    if (s.includes('from "import_sources"') && s.includes('"content"')) return { rows: queueRows }
    if (s.startsWith('select "id", "type", "name", "aliases" from "entities"')) return { rows: [KIK_INDEX] }
    if (s.includes('from "entities"') && s.includes('"legacy_table"')) return { rows: [KIK_ROW] }
    return { rows: [] }
  }
  const db = drizzle(client, { schema }) as unknown as Db
  const writes = () => statements.filter((s) => /^\s*(insert|update|delete|begin|truncate|alter|drop)\b/i.test(s))
  return { db, statements, writes }
}

async function dryRun(target: ImportOptions['target'], queueRows: unknown[][] = []) {
  const rec = recordingDb(queueRows)
  const lines: string[] = []
  const outcome = await runImport(
    { target, force: false, dryRun: true },
    { store: createImportStore(rec.db), runner: stubRunner, stub: true, log: (l) => lines.push(l) },
  )
  return { ...rec, outcome, text: lines.join('\n') }
}

describe('dry run against the real ImportStore', () => {
  test('file path: only SELECT statements; plan with at least 8 creates and 0 updates', async () => {
    const run = await dryRun({ kind: 'file', filename: 'sample-log.txt', content: SAMPLE })
    assert.equal(run.outcome.exitCode, 0, run.text)
    assert.ok(run.statements.length > 0)
    assert.deepEqual(run.writes(), [])
    assert.ok(run.statements.every((s) => /^\s*select\b/i.test(s)), run.statements.join('\n'))
    const summary = /plan: created (\d+) · updated (\d+)/.exec(run.text)
    assert.ok(summary, run.text)
    assert.ok(Number(summary[1]) >= 8)
    assert.equal(Number(summary[2]), 0)
    assert.match(run.text, /\/entry\/dr-halvard-quist/)
  })

  test('--pending: the queue is read with SELECT only, nothing is claimed', async () => {
    const run = await dryRun({ kind: 'pending', retryFailed: true }, [[11, 'zz-verify-sample-log.txt', 'pending', 0, SAMPLE]])
    assert.equal(run.outcome.exitCode, 0, run.text)
    assert.deepEqual(run.writes(), [])
    assert.match(run.text, /zz-verify-sample-log\.txt \(source #11, status pending\)/)
  })
})
