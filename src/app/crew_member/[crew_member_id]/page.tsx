// Legacy URL (plan 2.2): 308 to the entry copied from the legacy row, 404 when there is none.
import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { LEGACY_KEYS } from '@/lib/data/legacy-keys'
import { legacyEntryPath } from '@/lib/search/legacy-redirect'

// This page only redirects or 404s; the title is the one of the not-found page (src/app/not-found.tsx),
// so the browser title does not fall back to the bare layout title after hydration.
export const metadata: Metadata = { title: 'Record not found — X\'aro' }

export default async function LegacyRedirectPage({ params }: PageProps<'/crew_member/[crew_member_id]'>): Promise<never> {
  const { crew_member_id } = await params
  const path = await legacyEntryPath(LEGACY_KEYS.crew, crew_member_id)
  if (path === null) notFound()
  permanentRedirect(`${path}`)
}
