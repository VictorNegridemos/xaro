// UploadForm, ImportQueue and the explanation rendered with fixture data (plan 9.2 C task 5). The /import
// page cannot be opened in a browser during Step 2, so its pieces are checked as static markup.
import './test-scss-stub'
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AppRouterContext, type AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime'
import type { ImportSourceSummary } from '@/lib/data/types'
import { formatBytes, formatResult, formatTime, uploadOutcome } from './format'
import { ImportExplainer, PROCESS_COMMAND } from './ImportExplainer'
import { EMPTY_QUEUE_TITLE, ImportQueue } from './ImportQueue'
import { UploadForm } from './UploadForm'

const router: AppRouterInstance = {
  back: () => {}, forward: () => {}, refresh: () => {}, push: () => {}, replace: () => {}, prefetch: () => {},
} as unknown as AppRouterInstance

const render = (node: ReactNode) => renderToStaticMarkup(<AppRouterContext.Provider value={router}>{node}</AppRouterContext.Provider>)
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()

function source(over: Partial<ImportSourceSummary>): ImportSourceSummary {
  return {
    id: 1, filename: 'zz-verify-upload-a.txt', contentHash: 'a'.repeat(64), byteSize: 2637, origin: 'upload', status: 'pending',
    error: null, result: null, attempts: 0, createdAt: new Date('2026-11-24T10:05:00Z'), startedAt: null, processedAt: null, ...over,
  }
}

describe('ImportExplainer', () => {
  test('says that nothing is processed on the website and names the command', () => {
    const out = text(render(<ImportExplainer />))
    assert.ok(out.includes('Uploading only stores the file in the queue. Nothing is processed on this website.'))
    assert.ok(out.includes(`To process the queue, run ${PROCESS_COMMAND} on the ship's maintenance terminal`))
    assert.ok(out.includes("(the owner's PC, with the Claude CLI installed and logged in)"))
    assert.ok(out.includes('Entries appear here and in search after that command has finished.'))
    assert.equal(PROCESS_COMMAND, 'npm run import -- --pending')
  })
})

describe('UploadForm', () => {
  test('a .txt file input with label, hint, submit button and a live region', () => {
    const html = render(<UploadForm />)
    assert.match(html, /<input[^>]*type="file"[^>]*accept=".txt,text\/plain"/)
    assert.match(html, /<label[^>]*for="import-file"/)
    assert.match(html, /aria-describedby="import-file-hint"/)
    assert.match(html, /<button[^>]*type="submit"[^>]*>[\s\S]*Upload to queue/)
    assert.match(html, /aria-live="polite"/)
    assert.ok(!html.includes('role="alert"'))
  })

  test('error, success and duplicate states', () => {
    const error = render(<UploadForm initialOutcome={uploadOutcome(413, null)} />)
    assert.match(error, /role="alert"[^>]*>TRANSMISSION TOO LARGE/)
    assert.match(error, /aria-invalid="true"/)
    assert.match(error, /aria-describedby="import-file-hint import-file-error"/)

    const created = render(<UploadForm initialOutcome={uploadOutcome(201, { created: true, source: { filename: 'log.txt', status: 'pending' } })} />)
    assert.match(created, /data-upload-outcome="created"[^>]*>log\.txt is in the queue as pending/)

    const duplicate = render(<UploadForm initialOutcome={uploadOutcome(200, { created: false, source: { filename: 'log.txt', status: 'done' } })} />)
    assert.ok(text(duplicate).includes('This file is already in the queue (status: done).'))
  })

  test('response mapping', () => {
    assert.equal(uploadOutcome(401, null).kind, 'error')
    assert.match(uploadOutcome(400, { error: 'invalid_body', fields: { filename: 'Only .txt files can be imported.' } }).message, /Only \.txt files/)
    assert.match(uploadOutcome(0, null).message, /NO CARRIER/)
    assert.match(uploadOutcome(500, null).message, /ARCHIVE FAULT/)
  })
})

describe('ImportQueue', () => {
  test('empty queue', () => {
    const out = text(render(<ImportQueue sources={[]} />))
    assert.ok(out.includes(EMPTY_QUEUE_TITLE))
    assert.equal(EMPTY_QUEUE_TITLE, 'QUEUE EMPTY — no transmissions awaiting analysis.')
    assert.ok(out.includes('Refresh'))
  })

  test('queue not readable', () => {
    const html = render(<ImportQueue sources={[]} ok={false} />)
    assert.match(html, /role="alert"/)
    assert.ok(text(html).includes('ARCHIVE OFFLINE'))
  })

  test('one row per status, result summary, error text, Remove only for pending and failed', () => {
    const rows = [
      source({ id: 1, status: 'pending' }),
      source({ id: 2, status: 'processing', filename: 'b.txt', startedAt: new Date('2026-11-24T10:06:00Z'), attempts: 1 }),
      source({
        id: 3, status: 'done', filename: 'c.txt', origin: 'cli', processedAt: new Date('2026-11-24T10:09:00Z'),
        result: { created: 7, updated: 2, relations: 9, skipped: 1, conflicts: 1, stub: true },
      }),
      source({ id: 4, status: 'failed', filename: 'd.txt', error: 'Part 1 of 1 failed after 3 attempts: The reply is not valid JSON' }),
    ]
    const html = render(<ImportQueue sources={rows} />)
    for (const status of ['pending', 'processing', 'done', 'failed']) assert.match(html, new RegExp(`data-status="${status}"`))
    const items = html.split('<li ').slice(1)
    assert.equal(items.length, 4)
    const has = (i: number, needle: string) => text(items[i] ?? '').includes(needle)
    assert.ok(has(0, 'Pending') && has(0, 'Remove'))
    assert.ok(has(1, 'Processing') && !has(1, 'Remove'))
    assert.ok(has(2, 'Done') && !has(2, 'Remove'))
    assert.ok(has(2, 'created 7 · updated 2 · relations 9 · skipped 1 · conflicts kept 1 (stub run — Claude was not called)'))
    assert.ok(has(2, 'command line') && has(2, '2026-11-24 10:09 UTC'))
    assert.ok(has(3, 'Failed') && has(3, 'Remove') && has(3, 'failed after 3 attempts'))
    assert.ok(has(0, '2.6 KiB') && has(0, '2026-11-24 10:05 UTC'))
    assert.match(items[3] ?? '', /aria-label="Remove d\.txt from the queue"/)
    // badges carry text, not colour alone
    assert.match(items[0] ?? '', /data-tone="warn"[^>]*>Pending/)
    assert.match(items[3] ?? '', /data-tone="danger"[^>]*>Failed/)
  })

  test('formatters', () => {
    assert.equal(formatBytes(512), '512 B')
    assert.equal(formatBytes(1_048_576), '1.00 MiB')
    assert.equal(formatTime(null), '—')
    assert.equal(formatTime('2026-11-24T10:05:59Z'), '2026-11-24 10:05 UTC')
    assert.equal(formatResult({ created: 1, updated: 0, relations: 0, skipped: 0, conflicts: 0 }), 'created 1 · updated 0 · relations 0 · skipped 0')
  })
})
