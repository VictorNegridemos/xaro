// STUB created by Foundation (Step 1): simple inline SVG glyphs; names and props are final (plan 7.5).
// The Design workstream may redraw the paths.
import type React from 'react'

export const ICON_NAMES = [
  'home', 'crew', 'location', 'forge', 'plus', 'import', 'login', 'logout',
  'menu', 'close', 'chevron', 'search', 'edit', 'trash',
] as const
export type IconName = (typeof ICON_NAMES)[number]

const PATHS: Readonly<Record<IconName, string>> = {
  home: 'M3 11 12 3l9 8v10h-6v-6H9v6H3z',
  crew: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-8 9a8 8 0 0 1 16 0z',
  location: 'M12 22s7-7.5 7-13a7 7 0 0 0-14 0c0 5.500 7 13 7 13zm0-10a3 3 0 1 1 0-6 3 3 0 0 1 0 6z',
  forge: 'M3 7h13l5 4-5 2h-4l-1 6H7l1-6H3zM5 9v2h9V9z',
  plus: 'M11 4h2v7h7v2h-7v7h-2v-7H4v-2h7z',
  import: 'M11 3h2v10l3.500-3.500 1.500 1.500-6 6-6-6 1.500-1.500L11 13zM4 19h16v2H4z',
  login: 'M10 4h10v16H10v-2h8V6h-8zm-1 4 4 4-4 4v-3H3v-2h6z',
  logout: 'M4 4h10v2H6v12h8v2H4zm12 4 4 4-4 4v-3h-6v-2h6z',
  menu: 'M3 6h18v2H3zm0 5h18v2H3zm0 5h18v2H3z',
  close: 'm6.400 5 5.600 5.600L17.600 5 19 6.400 13.400 12l5.600 5.600-1.400 1.400-5.600-5.600L6.400 19 5 17.600 10.600 12 5 6.400z',
  chevron: 'm6 9 1.400-1.400L12 12.200l4.600-4.600L18 9l-6 6z',
  search: 'M10 3a7 7 0 0 1 5.600 11.200l5.100 5.100-1.400 1.400-5.100-5.100A7 7 0 1 1 10 3zm0 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10z',
  edit: 'm4 16.500 10.500-10.500 3.500 3.500L7.500 20H4zM16 4.500 17.500 3 21 6.500 19.500 8z',
  trash: 'M9 3h6l1 2h4v2H4V5h4zM6 9h12l-1 12H7z',
}

export interface IconProps {
  name: IconName
  /** CSS length; defaults to 1.25em. */
  size?: string
  /** Decorative unless a title is given. */
  title?: string
  className?: string
}

export function Icon({ name, size = '1.25em', title, className }: IconProps): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      className={className}
      data-icon={name}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
