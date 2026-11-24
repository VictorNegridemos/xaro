// Text whose longer words are real links to the results page (plan 4.3). Server component:
// keyboard-reachable, middle-click works, text selection works. Everything else stays plain text.
import Link from 'next/link'
import type React from 'react'
import { tokenizeInteractive } from './interactive-text'
import styles from './EntryView.module.scss'

export interface InteractiveTextProps {
  text: string
  /** The name of the entry being shown: a word equal to it is not linked. */
  entryName?: string
}

export function InteractiveText({ text, entryName }: InteractiveTextProps): React.JSX.Element {
  return (
    <>
      {tokenizeInteractive(text, entryName).map((token, index) => (
        token.href === null
          ? token.t
          : <Link key={index} href={token.href} prefetch={false} className={styles.word}>{token.t}</Link>
      ))}
    </>
  )
}
