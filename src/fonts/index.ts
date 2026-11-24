// Fonts through next/font (plan 7.2): self-hosted, no runtime request to Google.
// Each loader sets one CSS variable; src/styles/_tokens.scss points --font-display, --font-body
// and --font-mono at them. FONT_CLASSES goes on <html> (root layout and global-error).
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google'
import localFont from 'next/font/local'

const hacked = localFont({
  src: './Hacked-KerX.ttf',
  display: 'swap',
  variable: '--font-hacked',
  fallback: ['ui-monospace', 'monospace'],
})

const plexSans = IBM_Plex_Sans({
  weight: ['400', '500', '600'],
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  variable: '--font-plex-sans',
})

const plexMono = IBM_Plex_Mono({
  weight: ['400', '500'],
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  variable: '--font-plex-mono',
})

export const FONT_CLASSES = `${hacked.variable} ${plexSans.variable} ${plexMono.variable}`
