# CLAUDE.md — notes for agent sessions

Read `README.md` first. History and decisions: `docs/overhaul/` (`03-plan.md` = the design,
`04-execution-log.md` = what was actually built and every deviation).

## Next.js 16

This Next.js version differs from older training data (`proxy.ts` instead of middleware, async
`params`/`searchParams`, `PageProps<'/route'>` types from `next typegen`, …). Read the version-matched docs
in `node_modules/next/dist/docs/` before using an API. `agentRules: false` is set in `next.config.ts`, so
`next dev` does not write an `AGENTS.md`.

## Database rules (production database — read before touching anything)

- `DATABASE_URL` points at the LIVE production database. Never print it.
- drizzle-kit runs **`generate` and `check` only**. Never `push`, `pull`, `introspect`, `migrate` or
  `studio` (the config refuses them; keep it that way). Schema changes go through a new migration file
  reviewed by the owner and `npm run db:migrate` (guarded: allow-list of statement forms, backup, dry run).
- The legacy tables `crew_members`, `ship_subsystems`, `ship_records` are **read-only**. Only the
  backup/copy/verify scripts read them. Never write, alter or drop them (the drop SQL in the README is for
  the owner).
- In `src/`, those three names may appear **only** in `src/lib/data/legacy-keys.ts`, and only as values
  bound as query parameters (compared with `entities.legacy_table`), never as SQL identifiers.
  `tests/repo-guards.test.ts` enforces this.
- The app uses the new tables only: `entities`, `entity_relations`, `import_sources`, `auth_throttle`.
  `search_vector` is generated: never select or write it. Slugs never change after creation.
- Test data written to production must be marked (`ZZ-VERIFY …` names, `zz_verify` attribute, or
  `zz-verify-*` import filenames) and removed with `npm run verify:cleanup`
  (`-- --snapshot` before, `-- --compare` after).

## Where things live

- `src/app/` routes. Pages render content only — never their own `<main>`; the shell (`AppShell`,
  rendered once by `layout.tsx`) provides `main#content`. Wrap page content in `PageFrame`
  (`src/components/shell/PageFrame.tsx`) and `Panel`.
- `src/app/api/` route handlers. Logic lives in testable factories (`src/lib/entries/handlers.ts`,
  `src/lib/import/handlers.ts`) whose **first step is `requireApiAuth(request)`** (same-origin + session).
  Every new mutating route must do the same; protected pages call `requirePageAuth(path)`.
- `src/lib/data/` typed data access (every function takes an optional `db`/`tx` last argument);
  `src/lib/db/` client and Drizzle schema; `src/lib/auth/` session, password, throttle;
  `src/lib/search/` search SQL and parsing; `src/lib/import/` the Claude import pipeline;
  `src/lib/entries/` entry schema/limits/handlers; `src/lib/weapon/` weapon creator logic.
- `src/components/ui/` the design-system primitives (`Button`, `Field`, `Panel`, `StateBlock`, …);
  `shell/`, `entry/`, `entry-form/`, `search/`, `import/`, `auth/`, `weapon/`.
- `scripts/` local tsx scripts (`scripts/lib/script-db.ts` for a connection).
- There is no root `loading.tsx` on purpose: streaming would turn `notFound()` / `redirect()` /
  `permanentRedirect()` into HTTP 200 with an in-body redirect. Add `loading.tsx` only to routes that
  never redirect or 404 (as `/search` does).

## Weapon creator

The rules and data are frozen: `src/lib/weapon/data.ts` is a verbatim copy of the old tables (never
reformat it; ESLint formatting rules are off for it). Every change must keep
`src/lib/weapon/golden.test.ts` green against `docs/overhaul/baseline/weapon-creator-golden.json`.
Under the Devouring specialisation the type select and Smart checkbox are `disabled` (owner decision O3).

## Styles

SCSS modules only, tokens as CSS custom properties (`src/styles/_tokens.scss`). Breakpoints exist only as
the mixins `desktop`, `landscape`, `portrait` (plus `hover`, `coarse`, `motion-ok`, `reduced-motion`) in
`src/styles/_layout.scss`; `@media` is not allowed in component modules (repo guard). Partials in
`src/styles/` emit no CSS. Use `@use 'index' as *;`.

## Commands

```sh
npm run typecheck && npm run lint && npm test && npm run build   # the gate; all must exit 0
npm run dev                                                       # one dev server per working tree
```

Work on a branch, commit locally; never push, deploy or change Vercel unless the owner asks. Never commit
`.env*` (except `.env.example`), `.secrets/` or `backups/`.
