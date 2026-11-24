import assert from 'node:assert/strict'
import { test } from 'node:test'
import { STOP_WORDS, humanizeKey, isWordInteractive, tokenizeInteractive, wordSearchHref } from './interactive-text'

test('the stop list of the old site has 51 words', () => {
  assert.equal(STOP_WORDS.length, 51)
  assert.equal(new Set(STOP_WORDS).size, 51)
})

test('isWordInteractive: longer than 3, not a stop word, not the entry name', () => {
  assert.equal(isWordInteractive('warp'), true)
  assert.equal(isWordInteractive('the'), false)
  assert.equal(isWordInteractive('Every'), false)
  assert.equal(isWordInteractive('Ereshkigal', 'ereshkigal'), false)
  assert.equal(isWordInteractive('Ereshkigal', 'Warp'), true)
})

test('hrefs are encodeURIComponent-encoded', () => {
  assert.equal(wordSearchHref("X'aro"), `/search?q=${encodeURIComponent("X'aro")}`)
  assert.equal(wordSearchHref('semi-organic'), '/search?q=semi-organic')
  assert.equal(wordSearchHref('a&b=c'), '/search?q=a%26b%3Dc')
})

test('tokenizeInteractive keeps the text intact and links only interactive words', () => {
  const text = "The X'aro drifts.\nIts semi-organic hull & every rib — groans."
  const tokens = tokenizeInteractive(text)
  assert.equal(tokens.map((t) => t.t).join(''), text)
  const linked = tokens.filter((t) => t.href !== null).map((t) => t.t)
  assert.deepEqual(linked, ["X'aro", 'drifts', 'semi-organic', 'hull', 'groans'])
  assert.equal(tokens.find((t) => t.t === "X'aro")?.href, "/search?q=X'aro")
  assert.deepEqual(tokenizeInteractive(''), [])
  assert.deepEqual(tokenizeInteractive('a b'), [{ t: 'a b', href: null }])
})

test('humanizeKey', () => {
  assert.equal(humanizeKey('crew_rank'), 'Crew rank')
  assert.equal(humanizeKey('member of'), 'Member of')
  assert.equal(humanizeKey('__'), '__')
})
