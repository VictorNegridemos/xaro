// /search?q=&type=&page= (plan 4.3). Server component: calls search() directly, not the API.
// State lives only in the URL, so the page is shareable and back/forward work.
import type { Metadata } from 'next'
import type React from 'react'
import { SearchResults } from '@/components/search/SearchResults'
import { PageFrame } from '@/components/shell/PageFrame'
import { Button } from '@/components/ui/Button'
import { StateBlock } from '@/components/ui/StateBlock'
import { TextInput } from '@/components/ui/TextInput'
import { VisuallyHidden } from '@/components/ui/VisuallyHidden'
import { search } from '@/lib/search/query'
import { MAX_QUERY_CHARS, SearchInputError, type SearchResponse } from '@/lib/search/schema'
import styles from '@/components/search/SearchResults.module.scss'

type SearchParamsRecord = Record<string, string | string[] | undefined>
const firstValue = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] ?? '' : v ?? '')

export async function generateMetadata({ searchParams }: PageProps<'/search'>): Promise<Metadata> {
  const q = firstValue(((await searchParams) as SearchParamsRecord).q).trim().slice(0, 60)
  return { title: q ? `‘${q}’ — Search — X'aro` : `Search — X'aro` }
}

const ERROR_TEXT: Record<SearchInputError['code'], string> = {
  query_too_long: `QUERY REJECTED — a query may hold at most ${MAX_QUERY_CHARS} characters.`,
  invalid_type: 'QUERY REJECTED — the archive knows no such entry type.',
  invalid_page: 'QUERY REJECTED — that page does not exist.',
}

function SearchForm({ q }: { q: string }): React.JSX.Element {
  return (
    <form action="/search" method="get" role="search" className={styles.form}>
      <label htmlFor="search-page-q" className={styles.formField}>
        <VisuallyHidden>Search the archive</VisuallyHidden>
        <TextInput
          id="search-page-q"
          name="q"
          type="search"
          defaultValue={q}
          maxLength={MAX_QUERY_CHARS}
          placeholder="Name, place, system, word…"
          enterKeyHint="search"
          autoComplete="off"
        />
      </label>
      <Button type="submit" variant="primary">Search</Button>
    </form>
  )
}

export default async function SearchPage({ searchParams }: PageProps<'/search'>): Promise<React.JSX.Element> {
  const params = (await searchParams) as SearchParamsRecord
  const rawQ = firstValue(params.q)

  let response: SearchResponse | null = null
  let failure: React.ReactNode = null
  try {
    response = await search({ q: params.q, type: params.type, page: params.page })
  } catch (error) {
    if (!(error instanceof SearchInputError)) {
      console.error(`/search failed: ${error instanceof Error ? error.name : 'unknown error'}`)
      failure = (
        <StateBlock kind="error" title="ARCHIVE UNREACHABLE — the query could not be completed.">
          <p>The ship&apos;s memory core did not answer. Try again in a moment.</p>
        </StateBlock>
      )
    } else {
      failure = <StateBlock kind="error" title={ERROR_TEXT[error.code]} />
    }
  }

  const formQ = response ? response.q : rawQ.slice(0, MAX_QUERY_CHARS)
  return (
    <PageFrame width="measure">
      <SearchForm q={formQ} />
      {failure}
      {response && response.q === '' && response.type === null ? (
        <>
          <h1 className={styles.heading}>Query result</h1>
          <StateBlock kind="empty" title="AWAITING QUERY — name a person, a place, a system or a word." />
        </>
      ) : null}
      {response && (response.q !== '' || response.type !== null) ? <SearchResults response={response} /> : null}
    </PageFrame>
  )
}
