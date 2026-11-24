// STUB created by Foundation (Step 1): unstyled; props are final (plan 7.5).
// Renders text nodes and <mark> elements only. No HTML string is ever built (K21).
import type React from 'react'
import type { SnippetSegment } from '@/lib/search/schema'

export interface HighlightProps {
  segments: readonly SnippetSegment[]
}

export function Highlight({ segments }: HighlightProps): React.JSX.Element {
  return (
    <>
      {segments.map((segment, index) => (
        segment.h ? <mark key={index}>{segment.t}</mark> : <span key={index}>{segment.t}</span>
      ))}
    </>
  )
}
