// Validation of the Import page upload (plan 6.8). Shared by POST /api/import and the UploadForm. Pure.
// No Node-only imports: the UploadForm (a client component) imports the limits from here.
import { z } from 'zod'

/** A Content-Length above this is rejected before the body is read (413). */
export const MAX_UPLOAD_REQUEST_BYTES = 1_500_000
/** The text itself, in UTF-8 bytes after newline normalisation (1 MiB). */
export const MAX_UPLOAD_CONTENT_BYTES = 1_048_576
export const MAX_FILENAME_CHARS = 120

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/

/** CRLF and lone CR become LF (the same rule as normalizeNewlines() in data/text.ts). */
export const normalizeUploadNewlines = (s: string) => s.replace(/\r\n?/g, '\n')

export const uploadFilename = z.string()
  .min(1, 'The file name is empty.')
  .max(MAX_FILENAME_CHARS, `The file name is longer than ${MAX_FILENAME_CHARS} characters.`)
  .refine((name) => !CONTROL_CHARS.test(name), 'The file name contains control characters.')
  .refine((name) => !/[\\/]/.test(name), 'Send the base name of the file only, without folders.')
  .refine((name) => name.trim() === name && name.trim() !== '', 'The file name has leading or trailing spaces.')
  .refine((name) => /\.txt$/i.test(name) && name.length > 4, 'Only .txt files can be imported.')

export const uploadBody = z.strictObject({
  filename: uploadFilename,
  content: z.string()
    .refine((text) => !text.includes('\u0000'), 'The file contains NUL characters; it is not a text file.')
    .refine((text) => text.trim() !== '', 'The file is empty.'),
})

export type UploadBody = z.infer<typeof uploadBody>

export type UploadCheck =
  | { ok: true; filename: string; content: string }
  | { ok: false; status: 400 | 413; code: 'invalid_body' | 'file_too_large'; fields: Record<string, string> }

/** zod first, then the byte limit on the normalised text (413 file_too_large). */
export function checkUpload(body: unknown): UploadCheck {
  const parsed = uploadBody.safeParse(body)
  if (!parsed.success) {
    const fields: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      const key = issue.path.length > 0 ? String(issue.path[0]) : 'body'
      fields[key] ??= issue.message
    }
    return { ok: false, status: 400, code: 'invalid_body', fields }
  }
  const content = normalizeUploadNewlines(parsed.data.content)
  if (new TextEncoder().encode(content).byteLength > MAX_UPLOAD_CONTENT_BYTES) {
    return { ok: false, status: 413, code: 'file_too_large', fields: { content: 'The file is larger than 1 MiB.' } }
  }
  return { ok: true, filename: parsed.data.filename, content }
}
