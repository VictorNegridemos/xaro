// Pure display helpers for the Import page (plan 6.8). No React, no Node-only imports.
import type { BadgeTone } from '@/components/ui/Badge'
import type { ImportResult, ImportStatus } from '@/lib/data/types'

export const STATUS_TONE: Readonly<Record<ImportStatus, BadgeTone>> = {
  pending: 'warn',
  processing: 'info',
  done: 'ok',
  failed: 'danger',
}

export const STATUS_LABEL: Readonly<Record<ImportStatus, string>> = {
  pending: 'Pending',
  processing: 'Processing',
  done: 'Done',
  failed: 'Failed',
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`
}

/** Deterministic on server and client (no locale, no time zone): "2026-11-24 14:05 UTC". */
export function formatTime(value: Date | string | null): string {
  if (value === null) return '—'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`
}

/** `created 7 · updated 2 · relations 9 · skipped 1` plus the conflicts and stub markers. */
export function formatResult(result: ImportResult): string {
  const parts = [
    `created ${result.created}`,
    `updated ${result.updated}`,
    `relations ${result.relations}`,
    `skipped ${result.skipped}`,
  ]
  if (result.conflicts > 0) parts.push(`conflicts kept ${result.conflicts}`)
  return `${parts.join(' · ')}${result.stub ? ' (stub run — Claude was not called)' : ''}`
}

export type UploadOutcome =
  | { kind: 'created'; message: string }
  | { kind: 'duplicate'; message: string }
  | { kind: 'error'; message: string }

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

/** Maps the response of POST /api/import to a line for the upload form's live region. */
export function uploadOutcome(status: number, data: unknown): UploadOutcome {
  const body = isRecord(data) ? data : {}
  const source = isRecord(body.source) ? body.source : {}
  const filename = typeof source.filename === 'string' ? source.filename : 'The file'
  if (status === 201) {
    return { kind: 'created', message: `${filename} is in the queue as pending. It is processed when the import command runs on the owner's PC.` }
  }
  if (status === 200) {
    const state = typeof source.status === 'string' ? source.status : 'unknown'
    return { kind: 'duplicate', message: `This file is already in the queue (status: ${state}).` }
  }
  if (status === 401) return { kind: 'error', message: 'ACCESS DENIED — your session has ended. Log in again and retry.' }
  if (status === 403) return { kind: 'error', message: 'ACCESS DENIED — the request did not come from this site.' }
  if (status === 413) return { kind: 'error', message: 'TRANSMISSION TOO LARGE — the file must be at most 1 MiB.' }
  if (status === 400 || status === 415) {
    const fields = isRecord(body.fields) ? body.fields : {}
    const first = Object.values(fields).find((value): value is string => typeof value === 'string')
    return { kind: 'error', message: `TRANSMISSION REJECTED — ${first ?? 'the file could not be read as text.'}` }
  }
  if (status === 0) return { kind: 'error', message: 'NO CARRIER — the upload did not reach the archive. Check the connection and retry.' }
  return { kind: 'error', message: 'ARCHIVE FAULT — the file was not stored. Try again later.' }
}
