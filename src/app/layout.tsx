import type { Metadata, Viewport } from 'next'
import { connection } from 'next/server'
import type { ReactNode } from 'react'

import { AppShell } from '@/components/shell/AppShell'
import { FONT_CLASSES } from '@/fonts'
import { isLoggedIn } from '@/lib/auth/session'
import { getShellData } from '@/lib/data/shell'

import './globals.scss'

export const metadata: Metadata = {
  title: 'X\'aro',
  description: 'Ship computer of the X\'aro: crew, subsystems and the archive of ship records.',
  applicationName: 'X\'aro',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#050706',
  interactiveWidget: 'resizes-content',
}

// The shell is rendered once here and persists across navigations (plan 7.4).
export default async function RootLayout({ children }: { children: ReactNode }) {
  // Every route reads the database at request time, never at build time (K14).
  await connection()
  const [loggedIn, shell] = await Promise.all([isLoggedIn(), getShellData()])

  return (
    <html lang="en" className={FONT_CLASSES}>
      <body>
        <AppShell loggedIn={loggedIn} shell={shell}>{children}</AppShell>
      </body>
    </html>
  )
}
