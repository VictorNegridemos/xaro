import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { LoginForm } from '@/components/auth/LoginForm'
import { StateBlock } from '@/components/ui/StateBlock'
import { getAuthConfig } from '@/lib/auth/config'
import { safeNextPath } from '@/lib/auth/origin'
import { isLoggedIn } from '@/lib/auth/session'
import styles from './login.module.scss'

export const metadata: Metadata = {
  title: 'Login — X\'aro',
  robots: { index: false },
}

interface LoginPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams
  const next = safeNextPath(typeof params.next === 'string' ? params.next : undefined)

  if (await isLoggedIn()) redirect(next)

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Crew authentication</h1>
      {getAuthConfig().ok ? (
        <>
          <p className={styles.lead}>Write access to the archive is restricted. Enter the access code to continue.</p>
          <LoginForm next={next} />
        </>
      ) : (
        <StateBlock kind="denied" title="AUTH OFFLINE — Authentication is not configured on this deployment.">
          <p>The archive stays readable. Nothing can be added or changed until the access code is set.</p>
        </StateBlock>
      )}
    </main>
  )
}
