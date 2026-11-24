'use client'

// STUB created by Foundation (Step 1). The Design workstream builds the persistent three-layout
// shell here (plan 7.4). The props are final. Not yet used by src/app/layout.tsx.
import type { ReactNode } from 'react'
import type { ShellData } from '@/lib/data/types'

export interface AppShellProps {
  loggedIn: boolean
  shell: ShellData
  children: ReactNode
}

export function AppShell({ children }: AppShellProps): React.JSX.Element {
  return <>{children}</>
}
