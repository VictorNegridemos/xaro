import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  MAX_QUERY_TERMS, buildPrefixQuery, buildResponse, foldApostrophes, normalizeQuery, prepareSearch, search,
  searchTerms, totalFromFacets,
} from './query'
import { PgDialect } from 'drizzle-orm/pg-core'
import { rankedQuery } from './sql'
import { SearchInputError, type SearchInput } from './schema'
import { entryHref, searchHref } from './href'
import { parseLegacyId } from './legacy-redirect'

test('normalizeQuery: leading minus signs are dropped, inner hyphens kept', () => {
  assert.equal(normalizeQuery('-warp'), 'warp')
  assert.equal(normalizeQuery('a -b'), 'a b')
  assert.equal(normalizeQuery('semi-organic'), 'semi-organic')
  assert.equal(normalizeQuery('--'), '')
  assert.equal(normalizeQuery('---warp --drive'), 'warp drive')
  assert.equal(normalizeQuery('warp -'), 'warp')
})

test('normalizeQuery: NFKC, control characters, whitespace', () => {
  assert.equal(normalizeQuery('  ｗａｒｐ\t\n drive\u0000\u0001 '), 'warp drive')
  assert.equal(normalizeQuery('\u0007'), '')
})

test('foldApostrophes removes inner apostrophes only', () => {
  assert.equal(foldApostrophes("Kal O'Dun"), 'Kal ODun')
  assert.equal(foldApostrophes('X’aro x`aro'), 'Xaro xaro')
  assert.equal(foldApostrophes("'quoted' rock'"), "'quoted' rock'")
})

test('buildPrefixQuery: sanitised tokens only, capped', () => {
  assert.equal(buildPrefixQuery('jag mig', 'jag mig'), 'jag:* & mig:*')
  assert.equal(buildPrefixQuery("o'dun", 'odun'), '(o:* & dun:*) | (odun:*)')
  assert.equal(buildPrefixQuery('%', '%'), '')
  const evil = "a'); DROP TABLE x; --!:*|&"
  assert.equal(buildPrefixQuery(evil, evil), 'a:* & drop:* & table:* & x:*')
  assert.equal(buildPrefixQuery('a b c d e f g h i j', 'a b c d e f g h i j').split(' & ').length, 8)
  assert.equal(buildPrefixQuery('x'.repeat(100), 'x'.repeat(100)), `${'x'.repeat(40)}:*`)
  for (const input of ['ÄÖ <b>&amp;</b> \\ "q" $1', "X'aro's   «semi»-organic!"]) {
    assert.match(buildPrefixQuery(input, foldApostrophes(input)), /^[\p{L}\p{N}:*&|() ]*$/u)
  }
})

test('searchTerms: words only, de-duplicated case-insensitively after apostrophe folding', () => {
  assert.equal(searchTerms('Warp warp WARP'), 'Warp')
  assert.equal(searchTerms("Kal O'Dun"), "Kal O'Dun")
  assert.equal(searchTerms("O'Dun ODun o’dun"), "O'Dun")
  assert.equal(searchTerms('🚀 warp'), 'warp')
  assert.equal(searchTerms('warp 🚀 🚀 warp'), 'warp')
  assert.equal(searchTerms('semi-organic'), 'semi-organic')
  assert.equal(searchTerms('warp-warp-drive warp'), 'warp drive')
  assert.equal(searchTerms("x'x'x'x"), 'x')
  assert.equal(searchTerms('warp.warp,warp_warp/warp'), 'warp')
  assert.equal(searchTerms('%'), '')
  assert.equal(searchTerms("' OR 1=1 --"), 'OR 1')
  assert.equal(searchTerms('warp & !cannon | (core'), 'warp cannon core')
  assert.equal(searchTerms('K82ACA'), 'K82ACA')
})

test('searchTerms: at most MAX_QUERY_TERMS distinct runs', () => {
  assert.equal(MAX_QUERY_TERMS, 8)
  const many = 'one two three four five six seven eight nine ten eleven twelve'
  assert.equal(searchTerms(many), 'one two three four five six seven eight')
  assert.equal(searchTerms('a-b-c-d-e-f-g-h-i-j'), 'a-b-c-d-e-f-g-h'.replace(/-/g, ' '))
  assert.equal(searchTerms('a b c d e f g h-i'), 'a b c d e f g h')
})

const runsOf = (s: string) => s.toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) ?? []

test('pathological queries bind a small, repetition-free $1, $2 and prefix (F1)', () => {
  const dialect = new PgDialect()
  const inputs = [
    'warp '.repeat(40).trim(),            // the 199-character query that broke the connection
    'x '.repeat(100).trim(),
    'x'.repeat(200),
    "x'".repeat(99) + 'x',
    'warp-'.repeat(39) + 'warp',
    '🚀 '.repeat(60) + 'warp',
    Array.from({ length: 30 }, (_, i) => `w${i}`).join(' '),
    'Warp wArp WARP warp '.repeat(9).trim(),
  ]
  for (const input of inputs) {
    const prepared = prepareSearch({ q: input })
    for (const bound of [prepared.terms, prepared.folded]) {
      const runs = runsOf(bound)
      assert.ok(runs.length <= MAX_QUERY_TERMS, `${input.slice(0, 20)}: ${runs.length} runs`)
      assert.equal(new Set(runs).size, runs.length, `${input.slice(0, 20)}: repeated run in ${bound}`)
    }
    assert.ok(prepared.prefix.split(/[&|]/).length <= 2 * MAX_QUERY_TERMS)
    const query = dialect.sqlToQuery(rankedQuery({
      q: prepared.terms, folded: prepared.folded, prefix: prepared.prefix, type: null, limit: 20, offset: 0, hlOptions: '',
    }))
    assert.ok(query.params.every((p) => typeof p !== 'string' || p.length <= 200))
  }
  assert.equal(prepareSearch({ q: 'warp '.repeat(40).trim() }).terms, 'warp')
  assert.equal(prepareSearch({ q: 'warp '.repeat(40).trim() }).q, 'warp '.repeat(40).trim()) // echoed unchanged
  assert.equal(prepareSearch({ q: '🚀 warp' }).terms, 'warp')
})

test('search: a query without any word never touches the database, even with a type', async () => {
  const db = new Proxy({}, { get() { throw new Error('database used') } })
  for (const input of [{ q: '%' }, { q: '!!!???...' }, { q: '🚀🚀', type: 'record' }, { q: "'", type: 'character' }]) {
    const response = await search(input, db as never)
    assert.equal(response.total, 0)
    assert.deepEqual(response.results, [])
    assert.equal(response.q, input.q)
  }
})

const errorCode = (input: SearchInput): string | null => {
  try {
    prepareSearch(input)
    return null
  } catch (error) {
    return error instanceof SearchInputError ? error.code : 'other'
  }
}

test('prepareSearch validates type, page and length', () => {
  assert.deepEqual(prepareSearch({ q: ' -warp ', type: 'ship_system', page: '2' }), {
    q: 'warp', type: 'ship_system', page: 2, terms: 'warp', folded: 'warp', prefix: 'warp:*',
  })
  assert.deepEqual(prepareSearch({}), { q: '', type: null, page: 1, terms: '', folded: '', prefix: '' })
  assert.equal(prepareSearch({ q: ['a', 'b'] }).q, 'a')
  assert.equal(errorCode({ q: 'x', type: 'nonsense' }), 'invalid_type')
  assert.equal(errorCode({ q: 'x', page: '0' }), 'invalid_page')
  assert.equal(errorCode({ q: 'x', page: '51' }), 'invalid_page')
  assert.equal(errorCode({ q: 'x', page: '1.5' }), 'invalid_page')
  assert.equal(errorCode({ q: 'a'.repeat(201) }), 'query_too_long')
  assert.equal(errorCode({ q: 'a'.repeat(200) }), null)
  assert.equal(errorCode({ q: 'a'.repeat(5000) }), 'query_too_long')
})

test('total comes from the facet counts', () => {
  const facets = { character: 2, record: 5 }
  assert.equal(totalFromFacets(facets, null), 7)
  assert.equal(totalFromFacets(facets, 'record'), 5)
  assert.equal(totalFromFacets(facets, 'item'), 0)
  // Page past the end: no ranked rows, but the total stays.
  const response = buildResponse({ q: 'warp', type: null, page: 50 }, [], [
    { type: 'ship_system', n: 2 }, { type: 'record', n: 3 },
  ])
  assert.equal(response.total, 5)
  assert.deepEqual(response.results, [])
  assert.deepEqual(response.facets, { ship_system: 2, record: 3 })
})

test('buildResponse parses snippets into segments', () => {
  const response = buildResponse({ q: 'warp', type: null, page: 1 }, [
    { id: 3, type: 'ship_system', name: 'Warp', slug: 'warp', summary: 's', score: '2.123456', snippet: '\u0001Warp\u0002 <b>' },
  ], [{ type: 'ship_system', n: 1 }])
  assert.deepEqual(response.results[0], {
    id: 3, type: 'ship_system', name: 'Warp', slug: 'warp', summary: 's', score: 2.1235,
    snippet: [{ t: 'Warp', h: true }, { t: ' <b>', h: false }],
  })
})

test('search: an empty or minus-only query without a type never touches the database', async () => {
  const db = new Proxy({}, { get() { throw new Error('database used') } })
  for (const q of ['', ' -- ', '-']) {
    const response = await search({ q }, db as never)
    assert.equal(response.total, 0)
    assert.deepEqual(response.results, [])
  }
})

test('hrefs are encoded', () => {
  assert.equal(searchHref({ q: "X'aro & co" }), "/search?q=X'aro%20%26%20co")
  assert.equal(searchHref({ q: 'warp', type: 'record', page: 2 }), '/search?q=warp&type=record&page=2')
  assert.equal(searchHref({}), '/search')
  assert.equal(entryHref('a/b'), '/entry/a%2Fb')
})

test('parseLegacyId accepts 1 to 9 digits only', () => {
  assert.equal(parseLegacyId('1'), 1)
  assert.equal(parseLegacyId('123456789'), 123456789)
  for (const bad of ['abc', '', '1234567890', '-1', '1.0', ' 1', undefined]) assert.equal(parseLegacyId(bad), null)
})
