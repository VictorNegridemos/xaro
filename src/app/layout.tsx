import type { Metadata } from 'next'
import { connection } from 'next/server'
import type { ReactNode } from 'react'

import './globals.scss'

export const metadata: Metadata = {
    title: 'X\'aro',
    description: 'The X\'aro website',
}

// Minimal layout of Step 1. The Design workstream replaces it with fonts, viewport,
// session + shell data and <AppShell> (plan 7.4).
export default async function RootLayout({ children }: { children: ReactNode }) {
    // Every route reads the database at request time, never at build time (K14).
    await connection()

    return (
        <html lang="en">
            <body>
                <div id="root">{children}</div>
            </body>
        </html>
    );
}
