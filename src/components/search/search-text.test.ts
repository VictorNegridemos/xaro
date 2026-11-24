import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { EntityType } from '../../lib/data/types'
import { ENTITY_TYPES } from '../../lib/db/schema'
import { countLine, filterChips, pageLinks } from './search-text'

const labels = Object.fromEntries(ENTITY_TYPES.map((t) => [t, t.toUpperCase()])) as Record<EntityType, string>

test('countLine', () => {
  assert.equal(countLine({ q: 'warp', type: null, total: 7 }, labels), '7 signals for ‘warp’')
  assert.equal(countLine({ q: 'warp', type: 'record', total: 1 }, labels), '1 signal for ‘warp’ in RECORD')
  assert.equal(countLine({ q: '', type: 'ship_system', total: 8 }, labels), '8 entries filed as SHIP_SYSTEM')
})

test('filterChips keep q, mark the active type and skip empty types', () => {
  const chips = filterChips({ q: "X'aro", type: 'record', facets: { ship_system: 2, record: 5 } }, labels)
  assert.deepEqual(chips.map((c) => [c.key, c.count, c.active]), [['all', 7, false], ['ship_system', 2, false], ['record', 5, true]])
  assert.equal(chips[0]?.href, "/search?q=X'aro")
  assert.equal(chips[2]?.href, "/search?q=X'aro&type=record")
  // The active type stays visible with no hit; no "All" chip in browse mode.
  const browse = filterChips({ q: '', type: 'item', facets: { record: 3 } }, labels)
  assert.deepEqual(browse.map((c) => c.key), ['item', 'record'])
})

test('pageLinks', () => {
  assert.deepEqual(pageLinks({ q: 'a', type: null, page: 1, pageSize: 20, total: 5 }), { pageCount: 1, prev: null, next: null })
  assert.deepEqual(pageLinks({ q: 'a', type: 'record', page: 2, pageSize: 20, total: 45 }), {
    pageCount: 3, prev: '/search?q=a&type=record', next: '/search?q=a&type=record&page=3',
  })
  // Past the end: Previous leads back to the last real page.
  assert.deepEqual(pageLinks({ q: 'a', type: null, page: 50, pageSize: 20, total: 5 }), { pageCount: 1, prev: '/search?q=a', next: null })
})
