// /entry/new (plan 9.3): create an entry. Login required on the server; POST /api/entries checks again.
import type { Metadata } from 'next'
import { EntryForm } from '@/components/entry-form/EntryForm'
import { PageFrame } from '@/components/shell/PageFrame'
import { Panel } from '@/components/ui/Panel'
import { requirePageAuth } from '@/lib/auth/session'

export const metadata: Metadata = {
  title: 'New entry — X\'aro',
  robots: { index: false },
}

export default async function NewEntryPage() {
  await requirePageAuth('/entry/new')
  return (
    <PageFrame width="wide" kicker="Archive · write access" title="New entry">
      <Panel title="File a record">
        <EntryForm />
      </Panel>
    </PageFrame>
  )
}
