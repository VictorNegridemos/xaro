// Golden-file test 6 (plan 8.2): DOM assembly without a DOM library. The component that the page uses
// for the five lines is rendered to static markup and its text compared with the golden file.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'

import {
  LINE_KEYS, RAW_KEYS, collapse, coreKey, distinctEntries, loadGolden, type LineKey,
} from '../../lib/weapon/golden-fixture'
import type { WeaponState } from '../../lib/weapon/types'
import { ReadoutLines } from './ReadoutLines'

const golden = loadGolden()

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) return String.fromCodePoint(Number.parseInt(body.slice(2), 16))
    if (body.startsWith('#')) return String.fromCodePoint(Number.parseInt(body.slice(1), 10))
    return ENTITIES[body] ?? match
  })
}

/** textContent of every element carrying data-line, by line name. */
function readLines(markup: string): Partial<Record<LineKey, string>> {
  const result: Partial<Record<LineKey, string>> = {}
  for (const match of markup.matchAll(/<p\b[^>]*\bdata-line="([a-z]+)"[^>]*>([\s\S]*?)<\/p>/g)) {
    const [, name, inner] = match
    if (name === undefined || inner === undefined) continue
    assert.ok((LINE_KEYS as readonly string[]).includes(name), `unexpected data-line "${name}"`)
    assert.ok(!(name in result), `data-line "${name}" rendered twice`)
    result[name as LineKey] = decodeEntities(inner.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ''))
  }
  return result
}

const render = (state: WeaponState, caption = false): string =>
  renderToStaticMarkup(
    <ReadoutLines
      state={state}
      classNames={caption ? { stats: 's', specialBox: 'b', line: 'l', label: 'k' } : {}}
      specialCaption={caption ? <span aria-hidden="true">WARNING // SPECIAL PROPERTY</span> : undefined}
    />,
  )

describe('6. DOM assembly of the readout', () => {
  const distinct = distinctEntries(golden.entries)

  test('732 distinct states: the text of the five data-line elements equals the golden output (collapsed and raw)', () => {
    assert.equal(distinct.length, 732)
    for (const entry of distinct) {
      const lines = readLines(render(entry.input))
      const where = coreKey(entry.input)
      assert.deepEqual(Object.keys(lines), [...LINE_KEYS], where)
      for (const key of LINE_KEYS) assert.equal(collapse(lines[key] ?? ''), entry.output[key], `${key} ${where}`)
      for (const key of RAW_KEYS) assert.equal(lines[key], entry.raw[key], `raw ${key} ${where}`)
      assert.equal(lines.special, golden.specialRaw[entry.output.special], `raw special ${where}`)
    }
  })

  test('all 5612 entries: same text whatever the style, with or without class names and caption', () => {
    const byCore = new Map<string, Partial<Record<LineKey, string>>>()
    for (const entry of distinct) byCore.set(coreKey(entry.input), readLines(render(entry.input, true)))
    let compared = 0
    for (const entry of golden.entries) {
      const lines = byCore.get(coreKey(entry.input))
      assert.ok(lines, coreKey(entry.input))
      for (const key of LINE_KEYS) assert.equal(collapse(lines[key] ?? ''), entry.output[key])
      compared += 1
    }
    assert.equal(compared, 5612)
    // Style is not an input of the markup at all.
    const sample = golden.entries[0]
    assert.ok(sample)
    assert.equal(render({ ...sample.input, style: 'Hatchet' }), render(sample.input))
  })

  test('decoration stays outside the data-line elements', () => {
    const sample = golden.entries[0]
    assert.ok(sample)
    const markup = render(sample.input, true)
    assert.ok(markup.includes('WARNING // SPECIAL PROPERTY'))
    for (const text of Object.values(readLines(markup))) assert.ok(!text.includes('WARNING'))
  })
})
