import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildPrefixQuery, buildResponse, foldApostrophes, normalizeQuery, prepareSearch, search, totalFromFacets,
} from './query'
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
    q: 'warp', type: 'ship_system', page: 2, folded: 'warp', prefix: 'warp:*',
  })
  assert.deepEqual(prepareSearch({}), { q: '', type: null, page: 1, folded: '', prefix: '' })
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
