import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { LEGACY_EXCLUSIONS, excludedLegacyIds, isExcludedLegacyRow } from '../../src/lib/data/legacy-exclusions'
import { LEGACY_KEYS } from '../../src/lib/data/legacy-keys'
import { COPY_SQL_FILE, applyExclusions } from './copy-legacy'
import { classifyDrift, coverageProblems } from './legacy-checks'

const O1_IDS = [2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 26, 27, 29, 34, 35]

test('the O1 exclusion list holds exactly the 25 test/duplicate record ids, nothing else', () => {
  assert.deepEqual([...excludedLegacyIds(LEGACY_KEYS.record)], O1_IDS)
  assert.deepEqual(Object.keys(LEGACY_EXCLUSIONS), [LEGACY_KEYS.record])
  assert.deepEqual([...excludedLegacyIds(LEGACY_KEYS.crew)], [])
  assert.equal(isExcludedLegacyRow(LEGACY_KEYS.record, 18), true)
  assert.equal(isExcludedLegacyRow(LEGACY_KEYS.record, 1), false)
  assert.equal(isExcludedLegacyRow(LEGACY_KEYS.crew, 2), false)
})

test('applyExclusions filters only the records branch of the reviewed copy statement', () => {
  const original = readFileSync(COPY_SQL_FILE, 'utf8')
  const applied = applyExclusions(original)
  const filter = `  WHERE NOT (r.id = ANY('{${O1_IDS.join(',')}}'::int[]))`
  assert.equal(applied.split(filter).length, 2, 'exactly one filter line')
  assert.match(applied, new RegExp(`FROM public\\.${LEGACY_KEYS.record} r\\r?\\n${filter.replace(/[()[\]{}*.]/g, '\\$&')}`))
  // Nothing else changes: removing the inserted line gives the verbatim file back.
  assert.equal(applied.replace(/\r?\n {2}WHERE NOT \(r\.id = ANY\('\{[\d,]+\}'::int\[\]\)\)/, ''), original)
  // No exclusions: the statement is returned unchanged.
  assert.equal(applyExclusions(original, {}), original)
  assert.equal(applyExclusions(original, { [LEGACY_KEYS.record]: [] }), original)
})

test('applyExclusions refuses bad ids and an ambiguous anchor', () => {
  const original = readFileSync(COPY_SQL_FILE, 'utf8')
  assert.throws(() => applyExclusions(original, { [LEGACY_KEYS.record]: [1.5] }), /positive integers/)
  assert.throws(() => applyExclusions(original, { [LEGACY_KEYS.record]: [-1] }), /positive integers/)
  assert.throws(() => applyExclusions('SELECT 1', { [LEGACY_KEYS.record]: [2] }), /exactly one/)
  // crew_members is filterable the same way (used by no exclusion today).
  assert.match(applyExclusions(original, { [LEGACY_KEYS.crew]: [3] }), /FROM public\.crew_members c\r?\n {2}WHERE NOT \(c\.id = ANY\('\{3\}'::int\[\]\)\)/)
})

test('coverage: excluded rows must have no copy and are never reported missing', () => {
  const rec = LEGACY_KEYS.record
  assert.deepEqual(coverageProblems([
    { tbl: rec, id: 1, copies: 1 },
    { tbl: rec, id: 2, copies: 0 },
    { tbl: LEGACY_KEYS.crew, id: 2, copies: 1 },
  ]), [])
  assert.deepEqual(coverageProblems([
    { tbl: rec, id: 1, copies: 0 },
    { tbl: rec, id: 10, copies: 2 },
    { tbl: rec, id: 18, copies: 1 },
    { tbl: LEGACY_KEYS.crew, id: 2, copies: 0 },
  ]), [
    `${rec} 1: 0 copies`,
    `${rec} 10: 2 copies`,
    `${rec} 18: excluded under O1 but 1 copies remain`,
    `${LEGACY_KEYS.crew} 2: 0 copies`,
  ])
})

test('drift: excluded rows are reported separately and never count as drift', () => {
  const rec = LEGACY_KEYS.record
  const log = [1, 2, 3, 10].map((id) => ({ legacy_id: id, row_md5: `m${id}`, slug: `s${id}` }))
  const live = new Map([[1, 'm1'], [2, 'CHANGED'], [10, 'CHANGED'], [11, 'new'], [36, 'new']])
  assert.deepEqual(classifyDrift(rec, log, live), {
    notCopied: [36], // 11 is excluded, 36 is a new record
    changed: [10],
    gone: [],
    excludedIgnored: [2, 3], // 2 changed, 3 is gone
  })
  // Another table: the record exclusions do not apply.
  assert.deepEqual(classifyDrift(LEGACY_KEYS.crew, log, live).notCopied, [11, 36])
  assert.deepEqual(classifyDrift(LEGACY_KEYS.crew, log, live).gone, [3])
})
