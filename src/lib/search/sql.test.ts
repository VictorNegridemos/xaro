import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { PgDialect } from 'drizzle-orm/pg-core'
import { FACETS_SQL, SEARCH_SQL, bindSql, facetsQuery, rankedQuery, suggestQuery } from './sql'

const dialect = new PgDialect()
const smoke = readFileSync(path.join(process.cwd(), 'scripts', 'sql', 'search-smoke.sql'), 'utf8')
const lf = (s: string) => s.replace(/\r\n/g, '\n').trim()

test('SEARCH_SQL is the review-tested statement of plan 4.2, verbatim', () => {
  assert.equal(lf(SEARCH_SQL), lf(smoke))
})

test('the facet statement shares the candidate CTEs and counts per type', () => {
  const head = SEARCH_SQL.slice(0, SEARCH_SQL.indexOf('scored AS ('))
  assert.ok(FACETS_SQL.startsWith(head.replace(/,\s*$/, '')))
  assert.match(FACETS_SQL, /\)\nSELECT type, count\(\*\)::int AS n FROM cand GROUP BY type$/)
  assert.doesNotMatch(FACETS_SQL, /\$[4-9]/)
})

test('every value is bound, never interpolated', () => {
  const evil = "x'); DROP TABLE entities; --"
  const query = dialect.sqlToQuery(rankedQuery({
    q: evil, folded: evil, prefix: '', type: null, limit: 20, offset: 0, hlOptions: 'MaxWords=24',
  }))
  assert.ok(!query.sql.includes('DROP TABLE'))
  const occurrences = SEARCH_SQL.match(/\$\d+/g) ?? []
  assert.equal(query.params.length, occurrences.length)
  assert.equal(query.params[0], evil)
  assert.ok(query.params.includes('MaxWords=24'))

  const facets = dialect.sqlToQuery(facetsQuery({ q: 'warp', folded: 'warp', prefix: 'warp:*' }))
  assert.equal(facets.params.length, (FACETS_SQL.match(/\$\d+/g) ?? []).length)
  const suggest = dialect.sqlToQuery(suggestQuery('warp'))
  assert.deepEqual(suggest.params, ['warp', 'warp'])
})

test('bindSql refuses a placeholder without a parameter', () => {
  assert.throws(() => bindSql('SELECT $2', ['a']), /placeholder \$2/)
  assert.equal(dialect.sqlToQuery(bindSql('SELECT $1, $1', [7])).sql, 'SELECT $1, $2')
})
