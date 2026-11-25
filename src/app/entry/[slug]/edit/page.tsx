// /entry/[slug]/edit (plan 9.3): edit an entry. Login required on the server; PUT /api/entries/[id]
// checks again. The slug never changes, so the entry keeps its address after a rename.
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { EntryForm } from '@/components/entry-form/EntryForm'
import { PageFrame } from '@/components/shell/PageFrame'
import { Panel } from '@/components/ui/Panel'
import { requirePageAuth } from '@/lib/auth/session'
import { getEntityBySlug } from '@/lib/data/entities'

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/

export const metadata: Metadata = {
  title: 'Edit entry — X\'aro',
  robots: { index: false },
}

export default async function EditEntryPage({ params }: PageProps<'/entry/[slug]/edit'>) {
  const { slug } = await params
  await requirePageAuth(`/entry/${slug}/edit`)
  const entity = slug.length <= 100 && SLUG_PATTERN.test(slug) ? await getEntityBySlug(slug) : null
  if (!entity) notFound()
  const { id, type, name, aliases, summary, body, attributes } = entity
  return (
    <PageFrame width="wide" kicker="Archive · write access" title={`Edit: ${name}`}>
      <Panel title="Amend record">
        <EntryForm entity={{ id, slug: entity.slug, type, name, aliases, summary, body, attributes }} />
      </Panel>
    </PageFrame>
  )
}
