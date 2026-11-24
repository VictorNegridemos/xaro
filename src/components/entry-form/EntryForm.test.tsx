// EntryForm rendered as static markup with an existing entity (plan 9.3 task 1): every stored attribute
// is a key/value row with the stored string, so saving unchanged sends the same attributes back.
import '../import/test-scss-stub'
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AppRouterContext, type AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime'
import type { EntityInput } from '@/lib/data/types'
import { checkEntry } from '@/lib/entries/schema'
import { DeleteEntryButton } from './DeleteEntryButton'
import { EntryForm } from './EntryForm'
import { buildBody, initialValues } from './form-state'

const router = {
  back: () => {}, forward: () => {}, refresh: () => {}, push: () => {}, replace: () => {}, prefetch: () => {},
} as unknown as AppRouterInstance
const render = (node: ReactNode) => renderToStaticMarkup(<AppRouterContext.Provider value={router}>{node}</AppRouterContext.Provider>)
const unescape = (s: string) => s.replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

// Shaped like a copied crew row, placeholders included.
const crew: EntityInput & { id: number; slug: string } = {
  id: 3,
  slug: 'kik',
  type: 'character',
  name: 'Kik',
  aliases: ['Kik ??'],
  summary: 'Crew member.',
  body: 'Line one\nLine "two" & <three>',
  attributes: { crew_rank: 'Engineer', first_name: 'Kik', last_name: '??', current_status: 'Alive', expertise: 'Engines & drives' },
}

describe('EntryForm', () => {
  test('every stored attribute is a key/value row with the stored string', () => {
    const html = render(<EntryForm entity={crew} />)
    const rows = html.match(/data-attribute-row=""/g) ?? []
    assert.equal(rows.length, Object.keys(crew.attributes).length)
    const inputs = [...html.matchAll(/<input[^>]*name="attr-(key|value)-(\d+)"[^>]*value="([^"]*)"/g)]
      .map((m) => ({ kind: m[1], id: m[2], value: unescape(m[3] ?? '') }))
    const pairs = Object.fromEntries(
      inputs.filter((i) => i.kind === 'key').map((k) => [k.value, inputs.find((v) => v.kind === 'value' && v.id === k.id)?.value]),
    )
    assert.deepEqual(pairs, crew.attributes)
  })

  test('name, type, aliases, summary and body are prefilled; edit mode says Save changes', () => {
    const html = unescape(render(<EntryForm entity={crew} />))
    assert.match(html, /<input[^>]*id="entry-name-input"[^>]*value="Kik"/)
    assert.match(html, /<option value="character" selected="">Character<\/option>/)
    assert.ok(html.includes('>Kik ??</textarea>'))
    assert.ok(html.includes('>Line one\nLine "two" & <three></textarea>'))
    assert.ok(html.includes('Save changes'))
    assert.ok(html.includes('href="/entry/kik"'), 'Cancel goes back to the entry')
  })

  test('an empty form for a new entry says Create entry and has no attribute rows', () => {
    const html = render(<EntryForm />)
    assert.equal((html.match(/data-attribute-row=""/g) ?? []).length, 0)
    assert.ok(html.includes('Create entry'))
  })

  test('saving unchanged sends the same fields back, and the server schema accepts them', () => {
    const built = buildBody(initialValues(crew))
    assert.ok(built.ok)
    if (!built.ok) return
    const { id: _id, slug: _slug, ...stored } = crew
    void [_id, _slug]
    assert.deepEqual(built.body, stored)
    const checked = checkEntry(built.body)
    assert.ok(checked.ok)
  })

  test('blank attribute rows are dropped; a value without key and a duplicate key are reported', () => {
    const values = initialValues(crew)
    values.attributes.push({ id: 99, key: '', value: '' })
    assert.ok(buildBody(values).ok)
    values.attributes.push({ id: 100, key: '', value: 'orphan' })
    assert.ok(!buildBody(values).ok)
    values.attributes.pop()
    values.attributes.push({ id: 101, key: 'crew_rank', value: 'again' })
    const dup = buildBody(values)
    assert.ok(!dup.ok && dup.fields.attributes?.includes('crew_rank'))
  })
})

describe('DeleteEntryButton', () => {
  test('a danger button and a native dialog naming the entry', () => {
    const html = unescape(render(<DeleteEntryButton id={3} name="Kik" />))
    assert.match(html, /<button[^>]*data-variant="danger"[^>]*>[\s\S]*Delete/)
    assert.match(html, /<dialog[^>]*aria-labelledby="delete-3-title"/)
    assert.ok(html.includes('<strong>Kik</strong> will be removed'))
  })
})
