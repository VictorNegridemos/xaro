// npm run search:eval — runs the test queries of plan 4.4 against the database. READ-ONLY:
// every statement runs inside a READ ONLY transaction. Prints pass/fail per case and the top
// five results; the exit code is 1 when a case fails.
//   --quiet     print the top five only for failing cases
import { inArray } from 'drizzle-orm'
import { entities } from '../src/lib/db/schema'
import { EVAL_CASES, type EvalCase, type EvalInput, type Expectation } from '../src/lib/search/eval-cases'
import { search } from '../src/lib/search/query'
import { SearchInputError, type SearchResponse } from '../src/lib/search/schema'
import { runScript } from './lib/env'
import { openScriptDb } from './lib/script-db'

type Outcome = { response: SearchResponse; error: null } | { response: null; error: SearchInputError }
type Runner = (input: EvalInput) => Promise<Outcome>

const show = (input: EvalInput): string => {
  const q = input.q === undefined ? '(empty)' : input.q.length > 40 ? `${input.q.slice(0, 12)}… (${input.q.length} chars)` : JSON.stringify(input.q)
  return [q, input.type ? `type=${input.type}` : '', input.page ? `page=${input.page}` : ''].filter(Boolean).join(' + ')
}

function check(
  expectation: Expectation, outcome: Outcome, reference: (caseId: number) => SearchResponse | undefined,
): string | null {
  if (expectation.kind === 'inputError') {
    if (outcome.error?.code === expectation.code) return null
    return `expected input error ${expectation.code}, got ${outcome.error ? outcome.error.code : 'a result'}`
  }
  if (!outcome.response) return `unexpected input error ${outcome.error.code}`
  const { results, total } = outcome.response
  const names = results.map((r) => r.name)
  const position = (name: string) => names.indexOf(name)

  switch (expectation.kind) {
    case 'top': {
      const got = names.slice(0, expectation.names.length)
      return got.join(' | ') === expectation.names.join(' | ') ? null : `expected top ${JSON.stringify(expectation.names)}, got ${JSON.stringify(got)}`
    }
    case 'topSlugs': {
      const got = results.slice(0, expectation.slugs.length).map((r) => r.slug)
      return got.join(' | ') === expectation.slugs.join(' | ') ? null : `expected top slugs ${JSON.stringify(expectation.slugs)}, got ${JSON.stringify(got)}`
    }
    case 'firstSet': {
      const got = names.slice(0, expectation.names.length)
      const ok = got.length === expectation.names.length && expectation.names.every((name) => got.includes(name))
      return ok ? null : `expected the first ${expectation.names.length} to be ${JSON.stringify(expectation.names)}, got ${JSON.stringify(got)}`
    }
    case 'includes': {
      const scope = expectation.within === undefined ? names : names.slice(0, expectation.within)
      const missing = expectation.names.filter((name) => !scope.includes(name))
      return missing.length === 0 ? null : `missing ${JSON.stringify(missing)}${expectation.within ? ` in the first ${expectation.within}` : ''}`
    }
    case 'noneAbove': {
      const upper = expectation.upper.map(position).filter((p) => p >= 0)
      const lower = expectation.lower.map(position).filter((p) => p >= 0)
      const worstUpper = Math.max(...upper, -1)
      const bestLower = Math.min(...lower, Number.POSITIVE_INFINITY)
      return bestLower > worstUpper ? null : `"${names[bestLower]}" (position ${bestLower + 1}) ranks above "${names[worstUpper]}" (position ${worstUpper + 1})`
    }
    case 'count': {
      if (expectation.exactly !== undefined && results.length !== expectation.exactly) return `expected exactly ${expectation.exactly} results, got ${results.length}`
      if (expectation.exactly !== undefined && expectation.exactly < 20 && outcome.response.page === 1 && total !== expectation.exactly) return `expected total ${expectation.exactly}, got ${total}`
      if (expectation.atLeast !== undefined && results.length < expectation.atLeast) return `expected at least ${expectation.atLeast} results, got ${results.length}`
      return null
    }
    case 'allOfType': {
      const wrong = results.filter((r) => r.type !== expectation.type)
      return wrong.length === 0 ? null : `${wrong.length} result(s) are not of type ${expectation.type}`
    }
    case 'noneOfType': {
      const wrong = results.filter((r) => r.type === expectation.type)
      return wrong.length === 0 ? null : `${wrong.length} result(s) have type ${expectation.type}`
    }
    case 'orderedByName': {
      const collator = new Intl.Collator('en', { sensitivity: 'base' })
      for (let i = 1; i < names.length; i += 1) {
        if (collator.compare(names[i - 1] ?? '', names[i] ?? '') > 0) return `"${names[i - 1]}" is listed before "${names[i]}"`
      }
      return null
    }
    case 'sameResultsAs': {
      const other = reference(expectation.caseId)
      if (!other) return `case ${expectation.caseId} has no result to compare with`
      const a = results.map((r) => r.id).join(',')
      const b = other.results.map((r) => r.id).join(',')
      return a === b ? null : `result ids [${a}] differ from case ${expectation.caseId} [${b}]`
    }
    case 'sameTotalAs': {
      const other = reference(expectation.caseId)
      if (!other) return `case ${expectation.caseId} has no result to compare with`
      return total === other.total ? null : `total ${total} differs from case ${expectation.caseId} (${other.total})`
    }
  }
}

function printTop(response: SearchResponse): void {
  if (response.results.length === 0) {
    const hint = response.suggestions.length ? `; suggestions: ${response.suggestions.map((s) => s.name).join(', ')}` : ''
    console.log(`        (no results; total ${response.total}${hint})`)
    return
  }
  response.results.slice(0, 5).forEach((r, i) => {
    console.log(`        ${i + 1}. ${r.score.toFixed(4)}  ${r.type.padEnd(11)} ${r.name}  (/entry/${r.slug})`)
  })
  if (response.total > 5) console.log(`        … ${response.total} in total`)
}

async function main(): Promise<void> {
  const quiet = process.argv.includes('--quiet')
  const { db, close } = openScriptDb()
  let passed = 0
  let failed = 0
  let skipped = 0
  try {
    // One read-only transaction for the whole run: nothing in here can write.
    await db.transaction(async (tx) => {
      const run: Runner = async (input) => {
        try {
          return { response: await search(input, tx), error: null }
        } catch (error) {
          if (error instanceof SearchInputError) return { response: null, error }
          throw error
        }
      }

      const neededSlugs = [...new Set(EVAL_CASES.flatMap((c) => c.needsSlugs ?? []))]
      const present = neededSlugs.length === 0
        ? new Set<string>()
        : new Set((await tx.select({ slug: entities.slug }).from(entities).where(inArray(entities.slug, neededSlugs))).map((r) => r.slug))

      const firstResponses = new Map<number, SearchResponse>()
      const evaluate = async (evalCase: EvalCase): Promise<void> => {
        const label = `#${String(evalCase.id).padStart(2, '0')} ${evalCase.kind}: ${evalCase.inputs.map(show).join(' and ')}`
        const missing = (evalCase.needsSlugs ?? []).filter((slug) => !present.has(slug))
        if (missing.length > 0) {
          skipped += 1
          console.log(`SKIP  ${label}\n        the test rows ${missing.join(', ')} are no longer in the archive`)
          return
        }
        const problems: string[] = []
        const outcomes: Outcome[] = []
        for (const input of evalCase.inputs) {
          const outcome = await run(input)
          outcomes.push(outcome)
          for (const expectation of evalCase.expect) {
            const problem = check(expectation, outcome, (id) => firstResponses.get(id))
            if (problem) problems.push(evalCase.inputs.length > 1 ? `${show(input)}: ${problem}` : problem)
          }
        }
        const first = outcomes[0]?.response
        if (first) firstResponses.set(evalCase.id, first)

        if (problems.length === 0) passed += 1
        else failed += 1
        console.log(`${problems.length === 0 ? 'PASS' : 'FAIL'}  ${label}`)
        for (const problem of problems) console.log(`        ! ${problem}`)
        if (!quiet || problems.length > 0) {
          for (const outcome of outcomes) {
            if (outcome.response) printTop(outcome.response)
            else console.log(`        (rejected: ${outcome.error.code})`)
          }
        }
      }

      for (const evalCase of EVAL_CASES) await evaluate(evalCase)
    }, { accessMode: 'read only' })
  } finally {
    await close()
  }

  console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped, ${EVAL_CASES.length} cases`)
  if (failed > 0) process.exitCode = 1
}

runScript(main)
