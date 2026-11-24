'use client'

import Form from 'next/form'
import { usePathname, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { Icon } from '@/components/ui/icons'
import styles from './SearchBox.module.scss'

/**
 * The shell search box (plan 7.4, H1). It has its own grid track and never sits over the content.
 * Submits to /search (no live suggestions); on /search it is pre-filled from the URL. The typed
 * text survives navigation because the shell does not remount.
 */
export function SearchBox(): React.JSX.Element {
  const pathname = usePathname()
  const params = useSearchParams()
  const urlQuery = pathname === '/search' ? (params.get('q') ?? '') : null
  const [text, setText] = useState(urlQuery ?? '')
  const [seenQuery, setSeenQuery] = useState(urlQuery)

  // Follow the URL when it changes on /search (back/forward, a clicked word), not while typing.
  if (urlQuery !== seenQuery) {
    setSeenQuery(urlQuery)
    if (urlQuery !== null) setText(urlQuery)
  }

  return (
    <div role="search" className={styles.region}>
      <Form action="/search" className={styles.form}>
        <span className={styles.prompt} aria-hidden="true">&gt;_</span>
        <input
          className={styles.input}
          type="search"
          name="q"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Ask X'aro"
          aria-label="Ask X'aro"
          enterKeyHint="search"
          autoComplete="off"
          spellCheck={false}
          maxLength={200}
        />
        <button type="submit" className={styles.submit} aria-label="Search the archive">
          <Icon name="search" />
        </button>
      </Form>
    </div>
  )
}
