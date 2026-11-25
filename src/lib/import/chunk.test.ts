import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CHUNK_CHARS, chunkText } from './chunk'

const squash = (s: string) => s.replace(/\s+/g, ' ').trim()

test('a short text is one chunk, newlines normalised', () => {
  assert.deepEqual(chunkText('one\r\ntwo\rthree'), ['one\ntwo\nthree'])
  assert.equal(CHUNK_CHARS, 24_000)
})

test('an empty or whitespace-only text gives no chunk', () => {
  assert.deepEqual(chunkText(''), [])
  assert.deepEqual(chunkText(' \n\n \t'), [])
})

test('paragraphs are packed greedily and never split when they fit', () => {
  const paragraphs = Array.from({ length: 12 }, (_, i) => `Paragraph ${i} `.repeat(8).trim())
  const text = paragraphs.join('\n\n')
  const chunks = chunkText(text, 300)
  assert.ok(chunks.length > 1)
  for (const chunk of chunks) {
    assert.ok(chunk.length <= 300, `chunk of ${chunk.length}`)
    assert.ok(chunk.trim() !== '')
    for (const piece of chunk.split('\n\n')) assert.ok(paragraphs.includes(piece), 'whole paragraphs only')
  }
  // greedy: no two neighbouring chunks could have been one
  for (let i = 1; i < chunks.length; i += 1) {
    const first = chunks[i]?.split('\n\n')[0] ?? ''
    assert.ok((chunks[i - 1]?.length ?? 0) + 2 + first.length > 300)
  }
  assert.equal(chunks.join('\n\n'), text, 'round trip')
})

test('an over-long paragraph is cut at the last sentence end, else hard at the limit', () => {
  const sentence = 'The lattice hums below hearing. '
  const long = sentence.repeat(20).trim()
  const chunks = chunkText(`Intro.\n\n${long}`, 100)
  for (const chunk of chunks) assert.ok(chunk.length <= 100)
  assert.ok(chunks.every((chunk) => chunk.endsWith('.')), 'cut after a sentence end')
  assert.equal(squash(chunks.join('\n\n')), squash(`Intro.\n\n${long}`))

  const noBreaks = 'x'.repeat(250)
  assert.deepEqual(chunkText(noBreaks, 100).map((c) => c.length), [100, 100, 50])
})

test('round trip apart from whitespace at the cut points (CRLF input)', () => {
  const text = Array.from({ length: 40 }, (_, i) => `Line ${i} of the log. It goes on! Does it? Yes.`).join('\r\n\r\n')
  const chunks = chunkText(text, 200)
  assert.ok(chunks.length > 1)
  assert.equal(squash(chunks.join('\n\n')), squash(text.replace(/\r\n/g, '\n')))
})

test('limit must be a positive integer', () => {
  assert.throws(() => chunkText('abc', 0))
})
