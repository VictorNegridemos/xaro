// The three layout conditions for matchMedia. FROZEN in Step 2.
// They must stay identical to the mixins in src/styles/_layout.scss (checked by layout.test.ts).
export const LAYOUT_QUERIES = {
  desktop: '(width >= 1000px) and (height >= 600px)',
  portrait: '(width < 600px), (600px <= width < 1000px) and (orientation: portrait)',
  landscape: '(600px <= width < 1000px) and (orientation: landscape), (width >= 1000px) and (height < 600px)',
} as const

export type LayoutMode = keyof typeof LAYOUT_QUERIES

export const LAYOUT_MODES: readonly LayoutMode[] = ['desktop', 'landscape', 'portrait']

/** The layout a viewport of this size falls into; exactly one always matches (plan 7.3). */
export function layoutModeFor(width: number, height: number): LayoutMode {
  if (width < 600) return 'portrait'
  if (width < 1000) return height >= width ? 'portrait' : 'landscape'
  return height >= 600 ? 'desktop' : 'landscape'
}
