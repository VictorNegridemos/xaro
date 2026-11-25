'use client'

import { useSyncExternalStore } from 'react'
import { LAYOUT_MODES, LAYOUT_QUERIES, type LayoutMode } from '@/lib/layout'

function subscribe(onChange: () => void): () => void {
  const lists = LAYOUT_MODES.map((mode) => window.matchMedia(LAYOUT_QUERIES[mode]))
  for (const list of lists) list.addEventListener('change', onChange)
  // Fallback: some embedded/emulated viewports resize without firing MediaQueryList change events.
  // useSyncExternalStore re-renders only when the snapshot (the mode string) actually changes.
  window.addEventListener('resize', onChange)
  return () => {
    for (const list of lists) list.removeEventListener('change', onChange)
    window.removeEventListener('resize', onChange)
  }
}

function getSnapshot(): LayoutMode {
  for (const mode of LAYOUT_MODES) {
    if (window.matchMedia(LAYOUT_QUERIES[mode]).matches) return mode
  }
  // A browser that cannot parse the range syntax gets the single-column base styles.
  return 'portrait'
}

function getServerSnapshot(): null {
  return null
}

/**
 * The layout in use, from the same three media queries as the Sass mixins (src/lib/layout.ts).
 * null on the server and during hydration: CSS alone decides the first paint.
 */
export function useLayoutMode(): LayoutMode | null {
  return useSyncExternalStore<LayoutMode | null>(subscribe, getSnapshot, getServerSnapshot)
}
