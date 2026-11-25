'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Field, fieldDescribedBy } from '@/components/ui/Field'
import { TextInput } from '@/components/ui/TextInput'
import { loginErrorMessage } from './messages'
import styles from './LoginForm.module.scss'

const FIELD_ID = 'login-access-code'
const HINT = 'Hyphens and spaces are optional.'

export interface LoginFormProps {
  /** Already validated by the page (safeNextPath); the server validates it again. */
  next: string
}

export function LoginForm({ next }: LoginFormProps): React.JSX.Element {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (pending) return
    if (password.trim() === '') {
      setError(loginErrorMessage(400, null))
      return
    }
    setPending(true)
    setError(null)
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ password, next }),
      })
      const data: unknown = await response.json().catch(() => null)
      if (response.ok) {
        const target = data && typeof data === 'object' && 'next' in data && typeof data.next === 'string' ? data.next : '/'
        router.replace(target)
        router.refresh()
        return // stays pending until the navigation replaces this page
      }
      setError(loginErrorMessage(response.status, data, response.headers.get('Retry-After')))
    } catch {
      setError(loginErrorMessage(0, null))
    }
    setPassword('')
    setPending(false)
  }

  return (
    <form className={styles.form} onSubmit={(event) => void onSubmit(event)} noValidate>
      <Field label="Access code" htmlFor={FIELD_ID} hint={HINT}>
        <TextInput
          id={FIELD_ID}
          name="password"
          type="password"
          autoComplete="current-password"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          maxLength={200}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          invalid={error !== null}
          aria-describedby={[fieldDescribedBy(FIELD_ID, { hint: true }), `${FIELD_ID}-status`].filter(Boolean).join(' ')}
        />
      </Field>
      <p id={`${FIELD_ID}-status`} className={styles.status} aria-live="polite" role="status">{error}</p>
      <Button type="submit" variant="primary" pending={pending} fullWidth>
        {pending ? 'Verifying' : 'Authenticate'}
      </Button>
    </form>
  )
}
