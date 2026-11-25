// K3 migration guard: an ALLOW-LIST of statement forms, not a keyword blacklist (plan 3.5).
// Runs before every dry run and every real migration.
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

export const STATEMENT_BREAKPOINT = '--> statement-breakpoint'

const NEW_TABLES = '(?:import_sources|entities|entity_relations|auth_throttle)'
const LEGACY_NAME = /crew_members|ship_subsystems|ship_records/i

const ALLOWED_FORMS: ReadonlyArray<{ label: string; pattern: RegExp }> = [
  { label: 'CREATE EXTENSION IF NOT EXISTS pg_trgm', pattern: /^CREATE EXTENSION IF NOT EXISTS pg_trgm$/i },
  { label: 'CREATE OR REPLACE FUNCTION public.xaro_…', pattern: /^CREATE OR REPLACE FUNCTION public\.xaro_[a-z_]+\s*\(/i },
  { label: 'CREATE TYPE "public"."entity_type|import_status"', pattern: /^CREATE TYPE "public"\."(?:entity_type|import_status)" AS ENUM\s*\(/i },
  { label: 'CREATE TABLE "<new table>"', pattern: new RegExp(`^CREATE TABLE "${NEW_TABLES}" \\(`, 'i') },
  { label: 'ALTER TABLE "<new table>" ADD CONSTRAINT', pattern: new RegExp(`^ALTER TABLE "${NEW_TABLES}" ADD CONSTRAINT "[a-z0-9_]+" FOREIGN KEY \\("[a-z_]+"\\) REFERENCES "public"\\."${NEW_TABLES}"\\("[a-z_]+"\\)`, 'i') },
  { label: 'CREATE [UNIQUE] INDEX … ON "<new table>"', pattern: new RegExp(`^CREATE (?:UNIQUE )?INDEX "[a-z0-9_]+" ON "${NEW_TABLES}" USING `, 'i') },
  { label: 'CREATE TRIGGER … ON public.entities', pattern: /^CREATE TRIGGER [a-z_]+\s+BEFORE UPDATE ON public\.entities\s+FOR EACH ROW EXECUTE FUNCTION public\.xaro_[a-z_]+\(\)$/i },
]

/** Words that may not occur in a function body. */
const FORBIDDEN_IN_BODY = /\b(?:drop|truncate|alter|delete|insert|update|grant|revoke|execute|copy)\b/i

export interface GuardProblem { file: string; statement: number; reason: string; excerpt: string }

/**
 * One pass over a statement: comments are dropped, quoted strings become '' and
 * dollar-quoted bodies become $body$ (their text is returned separately).
 */
export function skeleton(statement: string): { text: string; bodies: string[] } {
  const bodies: string[] = []
  let text = ''
  let i = 0
  while (i < statement.length) {
    const rest = statement.slice(i)
    if (rest.startsWith('--')) {
      const eol = statement.indexOf('\n', i)
      i = eol === -1 ? statement.length : eol
      text += ' '
    } else if (rest.startsWith('/*')) {
      const close = statement.indexOf('*/', i + 2)
      i = close === -1 ? statement.length : close + 2
      text += ' '
    } else if (rest.startsWith("'")) {
      let j = i + 1
      while (j < statement.length) {
        if (statement[j] === "'" && statement[j + 1] === "'") j += 2
        else if (statement[j] === "'") break
        else j += 1
      }
      i = j + 1
      text += "''"
    } else {
      const tag = /^\$[A-Za-z_]*\$/.exec(rest)?.[0]
      if (tag) {
        const close = statement.indexOf(tag, i + tag.length)
        const stop = close === -1 ? statement.length : close
        bodies.push(statement.slice(i + tag.length, stop))
        i = close === -1 ? statement.length : close + tag.length
        text += '$body$'
      } else {
        text += statement[i]
        i += 1
      }
    }
  }
  return { text, bodies }
}

export function checkMigrationSql(file: string, content: string): GuardProblem[] {
  const problems: GuardProblem[] = []
  if (LEGACY_NAME.test(content)) {
    problems.push({ file, statement: 0, reason: 'names a legacy table (comments included)', excerpt: LEGACY_NAME.exec(content)?.[0] ?? '' })
  }
  content.split(STATEMENT_BREAKPOINT).forEach((raw, index) => {
    const { text, bodies } = skeleton(raw)
    const excerpt = text.replace(/\s+/g, ' ').trim().slice(0, 90)
    const add = (reason: string) => problems.push({ file, statement: index + 1, reason, excerpt })
    if (text.trim() === '') {
      add('empty statement')
      return
    }
    // Exactly one statement per breakpoint: nothing may follow the first top-level semicolon.
    const firstSemicolon = text.indexOf(';')
    if (firstSemicolon !== -1 && text.slice(firstSemicolon + 1).trim() !== '') {
      add('more than one statement between breakpoints')
      return
    }
    const head = (firstSemicolon === -1 ? text : text.slice(0, firstSemicolon)).replace(/\s+/g, ' ').trim()
    if (!ALLOWED_FORMS.some((form) => form.pattern.test(head))) {
      add('statement form is not on the allow-list')
      return
    }
    for (const body of bodies) {
      if (FORBIDDEN_IN_BODY.test(skeleton(body).text)) add('function body contains a forbidden keyword')
    }
  })
  return problems
}

export function checkMigrationFolder(folder: string): GuardProblem[] {
  const files = readdirSync(folder).filter((name) => name.endsWith('.sql')).sort()
  if (files.length === 0) return [{ file: folder, statement: 0, reason: 'no migration files found', excerpt: '' }]
  return files.flatMap((name) => checkMigrationSql(name, readFileSync(path.join(folder, name), 'utf8')))
}

/** Throws with a readable list when any migration file breaks a rule. */
export function assertMigrationsAreSafe(folder: string): void {
  const problems = checkMigrationFolder(folder)
  if (problems.length === 0) return
  const lines = problems.map((p) => `  ${p.file} #${p.statement}: ${p.reason}${p.excerpt ? ` — ${p.excerpt}` : ''}`)
  throw new Error(`Migration guard refused to continue:\n${lines.join('\n')}`)
}

export function allowedFormLabels(): string[] {
  return ALLOWED_FORMS.map((form) => form.label)
}
