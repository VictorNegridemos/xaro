// /entry/[slug] (plan 4.3): every field, attributes, linked entries, source file; Edit and Delete
// only when logged in (the API checks the session again).
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import type React from 'react'
import { cache } from 'react'
import { EntryView } from '@/components/entry/EntryView'
import { DeleteEntryButton } from '@/components/entry-form/DeleteEntryButton'
import { PageFrame } from '@/components/shell/PageFrame'
import { Panel } from '@/components/ui/Panel'
import { isLoggedIn } from '@/lib/auth/session'
import { getEntityBySlug } from '@/lib/data/entities'

// The slug format of the entities_slug_format check; anything else cannot exist, so no query is made.
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/

const loadEntity = cache(async (slug: string) => (
  slug.length <= 100 && SLUG_PATTERN.test(slug) ? getEntityBySlug(slug) : null
))

export async function generateMetadata({ params }: PageProps<'/entry/[slug]'>): Promise<Metadata> {
  const entity = await loadEntity((await params).slug)
  return { title: entity ? `${entity.name} — X'aro` : `Not found — X'aro` }
}

export default async function EntryPage({ params }: PageProps<'/entry/[slug]'>): Promise<React.JSX.Element> {
  const { slug } = await params
  const [entity, loggedIn] = await Promise.all([loadEntity(slug), isLoggedIn()])
  if (!entity) notFound()
  return (
    <PageFrame width="measure">
      <Panel as="div">
        <EntryView
          entity={entity}
          canEdit={loggedIn}
          actions={loggedIn ? <DeleteEntryButton id={entity.id} name={entity.name} /> : null}
        />
      </Panel>
    </PageFrame>
  )
}
