import assert from 'node:assert/strict'
import { test } from 'node:test'
import { HEADLINE_OPTIONS, HL_START as S, HL_STOP as E, parseHeadline, plainSnippet } from './highlight'

test('paired markers become highlighted segments', () => {
  assert.deepEqual(parseHeadline(`the ${S}warp${E} drive`), [
    { t: 'the ', h: false }, { t: 'warp', h: true }, { t: ' drive', h: false },
  ])
})

test('nested and unpaired markers are dropped', () => {
  assert.deepEqual(parseHeadline(`a${S}b${S}c${E}d${E}e`), [{ t: 'a', h: false }, { t: 'bc', h: true }, { t: 'de', h: false }])
  assert.deepEqual(parseHeadline(`${E}x${S}y`), [{ t: 'xy', h: false }])
  assert.deepEqual(parseHeadline(`${S}${E}`), [])
  assert.deepEqual(parseHeadline(''), [])
})

test('HTML-looking text stays text', () => {
  const html = `<b>bold</b> <script>alert(1)</script> ${S}<img src=x onerror=alert(1)>${E}`
  const segments = parseHeadline(html)
  assert.equal(segments.map((s) => s.t).join(''), '<b>bold</b> <script>alert(1)</script> <img src=x onerror=alert(1)>')
  assert.deepEqual(segments.at(-1), { t: '<img src=x onerror=alert(1)>', h: true })
})

test('plainSnippet strips stray markers', () => {
  assert.deepEqual(plainSnippet(`a${S}b${E}`), [{ t: 'ab', h: false }])
  assert.deepEqual(plainSnippet(''), [])
})

test('headline options use the control-character markers', () => {
  assert.ok(HEADLINE_OPTIONS.includes(`StartSel="${S}"`))
  assert.ok(HEADLINE_OPTIONS.includes(`StopSel="${E}"`))
  assert.ok(HEADLINE_OPTIONS.includes('MaxFragments=2'))
})
