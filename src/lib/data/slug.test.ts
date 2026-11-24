import assert from 'node:assert/strict'
import { test } from 'node:test'
import { slugBase, typeSlug } from './slug'

// [legacy id, name as produced by the copy, expected slug] — the 49 slugs of plan 3.3.
const CREW: ReadonlyArray<[number, string, string]> = [
  [1, 'Jagoda Migdal', 'jagoda-migdal'],
  [2, 'Triple Blink', 'triple-blink'],
  [3, 'Kik', 'kik'],
  [4, 'Chak Marak', 'chak-marak'],
  [5, "Kal O'Dun", 'kal-o-dun'],
  [6, "Ir'Htelekmari", 'ir-htelekmari'],
]
const SYSTEMS: ReadonlyArray<[number, string, string]> = [
  [1, 'Warp', 'warp'],
  [2, 'Fusion drive', 'fusion-drive'],
  [3, 'Thrusters', 'thrusters'],
  [4, 'Rail cannon', 'rail-cannon'],
  [5, 'Inertia wave emitter', 'inertia-wave-emitter'],
  [6, 'Alpha tempora monolayer', 'alpha-tempora-monolayer'],
  [7, 'Warp drone matrix', 'warp-drone-matrix'],
  [8, 'Core', 'core'],
]
const RECORDS: ReadonlyArray<[number, string, string]> = [
  [1, 'Ereshkigal', 'ereshkigal'],
  [2, 'Test title', 'test-title'],
  [3, 'Test 2', 'test-2'],
  [4, 'Test 3', 'test-3'],
  [5, 'Test 4 title', 'test-4-title'],
  [6, 'Test 5', 'test-5'],
  [7, 'Test 6', 'test-6'],
  [8, 'Test 7', 'test-7'],
  [9, 'Test 8', 'test-8'],
  [10, 'Alex is an intergalactic horror', 'alex-is-an-intergalactic-horror'],
  [11, 'Alex is an intergalactic horror', 'alex-is-an-intergalactic-horror-11'],
  [12, 'Alex is an intergalactic horror', 'alex-is-an-intergalactic-horror-12'],
  [13, 'Strong cat', 'strong-cat'],
  [14, 'new test 1', 'new-test-1'],
  [15, 'Test10', 'test10'],
  [16, 'Test11', 'test11'],
  [17, 'Test12', 'test12'],
  [18, 'Test13', 'test13'],
  [19, 'Test13', 'test13-19'],
  [20, 'Test14', 'test14'],
  [21, 'test16', 'test16'],
  [22, 'Test15', 'test15'],
  [23, 'Test17', 'test17'],
  [24, 'Interspace deathgoop', 'interspace-deathgoop'],
  [25, 'K82ACA', 'k82aca'],
  [26, 'Create title 3', 'create-title-3'],
  [27, 'Create title 11', 'create-title-11'],
  [28, 'The Joy Eater', 'the-joy-eater'],
  [29, 'Test after deployment', 'test-after-deployment'],
  [30, 'Lena', 'lena'],
  [31, 'Yaraslav', 'yaraslav'],
  [32, 'Napones', 'napones'],
  [33, 'Olkor', 'olkor'],
  [34, 'siuu', 'siuu'],
  [35, 'siuu', 'siuu-35'],
]

test('slugBase reproduces the 49 slugs of the legacy copy', () => {
  const all = [...CREW, ...SYSTEMS, ...RECORDS]
  assert.equal(all.length, 49)
  const seen = new Set<string>()
  for (const [legacyId, name, expected] of all) {
    const base = slugBase(name)
    // Collision rule of the copy: the first row of a group keeps the plain slug, later rows get -<legacy id>.
    const slug = seen.has(base) ? `${base}-${legacyId}` : base
    seen.add(base)
    assert.equal(slug, expected, `${name} (${legacyId})`)
  }
  assert.equal(new Set(all.map(([, , slug]) => slug)).size, 49)
})

test('slugBase: trimming, runs of punctuation, case, length cut', () => {
  assert.equal(slugBase('  --Hello,   World!!  '), 'hello-world')
  assert.equal(slugBase('Warp drone matrix '), 'warp-drone-matrix')
  assert.equal(slugBase('a'.repeat(79) + ' bcd'), 'a'.repeat(79))
  assert.equal(slugBase('x'.repeat(200)).length, 80)
  assert.equal(slugBase('Ünïcödé Nâme'), 'unicode-name')
  assert.match(slugBase('Semi-organic / 2nd'), /^[a-z0-9]+(-[a-z0-9]+)*$/)
})

test('a punctuation-only name gives an empty base; the fallback is the type with dashes', () => {
  assert.equal(slugBase('---'), '')
  assert.equal(slugBase('?? !!'), '')
  const fallback = typeSlug('ship_system')
  assert.equal(fallback, 'ship-system')
  assert.equal(slugBase('---') || fallback, 'ship-system')
  assert.match(fallback, /^[a-z0-9]+(-[a-z0-9]+)*$/)
})
