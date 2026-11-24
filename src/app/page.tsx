import { HomeView } from '@/components/shell/HomeView'
import { listRecentEntities } from '@/lib/data/entities'
import { getShellData } from '@/lib/data/shell'
import type { EntityRef } from '@/lib/data/types'

async function latestRecords(): Promise<EntityRef[] | null> {
  try {
    return await listRecentEntities('record', 5)
  } catch {
    return null
  }
}

// Home: content only; the shell comes from the root layout.
export default async function HomePage() {
  const [shell, recent] = await Promise.all([getShellData(), latestRecords()])
  return <HomeView shell={shell} recent={recent} />
}
