import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { LAYOUT_MODES, LAYOUT_QUERIES, layoutModeFor, type LayoutMode } from './layout'

const scss = readFileSync(path.join(process.cwd(), 'src', 'styles', '_layout.scss'), 'utf8')

function mixinCondition(name: string): string {
  const match = new RegExp(`@mixin ${name}\\s*\\{\\s*@media (.+?) \\{ @content; \\} \\}`).exec(scss)
  assert.ok(match?.[1], `@mixin ${name} found in _layout.scss`)
  return match[1]
}

test('layout.ts and _layout.scss hold identical media conditions', () => {
  for (const mode of LAYOUT_MODES) {
    assert.equal(LAYOUT_QUERIES[mode], mixinCondition(mode), mode)
  }
})

test('every viewport of plan 7.3 falls into the expected layout', () => {
  const cases: ReadonlyArray<[number, number, LayoutMode]> = [
    [1440, 900, 'desktop'], [1920, 1080, 'desktop'], [2560, 1080, 'desktop'], [1366, 650, 'desktop'],
    [1280, 550, 'landscape'], [1024, 768, 'desktop'], [950, 700, 'landscape'],
    [844, 390, 'landscape'], [915, 412, 'landscape'], [932, 430, 'landscape'],
    [820, 1180, 'portrait'], [768, 1024, 'portrait'], [900, 1000, 'portrait'],
    [390, 844, 'portrait'], [360, 640, 'portrait'], [412, 915, 'portrait'],
    [360, 320, 'portrait'], [390, 450, 'portrait'], [568, 320, 'portrait'],
  ]
  for (const [width, height, expected] of cases) {
    assert.equal(layoutModeFor(width, height), expected, `${width}x${height}`)
  }
})

test('the three conditions are disjoint and cover every size', () => {
  // Evaluates the documented conditions literally, without layoutModeFor.
  const matches = (mode: LayoutMode, w: number, h: number): boolean => {
    const portraitOrientation = h >= w
    if (mode === 'desktop') return w >= 1000 && h >= 600
    if (mode === 'portrait') return w < 600 || (w >= 600 && w < 1000 && portraitOrientation)
    return (w >= 600 && w < 1000 && !portraitOrientation) || (w >= 1000 && h < 600)
  }
  for (let w = 200; w <= 2600; w += 50) {
    for (let h = 200; h <= 1600; h += 50) {
      const hit = LAYOUT_MODES.filter((mode) => matches(mode, w, h))
      assert.deepEqual(hit, [layoutModeFor(w, h)], `${w}x${h}`)
    }
  }
})
