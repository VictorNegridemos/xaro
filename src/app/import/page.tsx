// /import (plan 6.8): upload a .txt into the queue and watch its status. Login required on the server.
// Processing never happens here: it runs when `npm run import -- --pending` is started on the owner's PC.
import type { Metadata } from 'next'
import { ImportExplainer } from '@/components/import/ImportExplainer'
import { ImportQueue } from '@/components/import/ImportQueue'
import { UploadForm } from '@/components/import/UploadForm'
import { Panel } from '@/components/ui/Panel'
import { requirePageAuth } from '@/lib/auth/session'
import { listImportSources } from '@/lib/data/imports'
import type { ImportSourceSummary } from '@/lib/data/types'
import styles from './import.module.scss'

export const metadata: Metadata = {
  title: 'Import — X\'aro',
  robots: { index: false },
}

export default async function ImportPage() {
  await requirePageAuth('/import')

  let sources: ImportSourceSummary[] = []
  let ok = true
  try {
    sources = await listImportSources(50)
  } catch {
    ok = false
  }

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Import</h1>
      <ImportExplainer />
      <Panel title="Upload">
        <UploadForm />
      </Panel>
      <ImportQueue sources={sources} ok={ok} />
    </main>
  )
}
