// Legacy URL (plan 2.2): 308 to the entry copied from the legacy row, 404 when there is none.
import { notFound, permanentRedirect } from 'next/navigation'
import { LEGACY_KEYS } from '@/lib/data/legacy-keys'
import { legacyEntryPath } from '@/lib/search/legacy-redirect'

export default async function LegacyRedirectPage({ params }: PageProps<'/subsystem/[subsystem_id]'>): Promise<never> {
  const { subsystem_id } = await params
  const path = await legacyEntryPath(LEGACY_KEYS.subsystem, subsystem_id)
  if (path === null) notFound()
  permanentRedirect(`${path}`)
}
