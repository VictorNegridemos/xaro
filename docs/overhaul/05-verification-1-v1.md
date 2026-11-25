# 05 — Verification iteration 1 — V1 (build quality)

Verifier: `v1`, independent; did not write the code. Date: 2026-11-24.
Commit under test: `0650406` (branch `overhaul`), checked out as a fresh clone:
`git clone --branch overhaul D:/React/xaro <scratchpad>/v1/clone`, then `.env` and `.env.local` copied in (contents never printed).
Toolchain: Node v22.14.0, npm 10.9.2, Windows 11, Git Bash.
Nothing in `D:\React\xaro` was modified except this report. No database access of any kind (V1 needs none; the unit tests use a recording pg-proxy double, checked in `src/lib/data/entities.test.ts`, `src/lib/import/write.test.ts`). Two throw-away probe files were created and deleted **inside the clone only** (strict/lint probes, below); `git status` in the clone was clean afterwards.

Result: **33 PASS, 0 FAIL**, 5 informational notes (no action required for the gate; two minor suggestions).

## 1. Clean install and the gate (in the clone)

| # | Check | Command | Actual | Result |
|---|---|---|---|---|
| 1.1 | Clean install from lockfile | `npm ci` | exit 0; "added 376 packages, audited 377"; no peer-dependency errors. Warnings: deprecated `eslint@9.39.5` (pinned on purpose, plan deviation 1), deprecated `@esbuild-kit/esm-loader@2.6.5`, `@esbuild-kit/core-utils@3.3.2` (transitive, `drizzle-kit`) | PASS |
| 1.2 | Typecheck | `npm run typecheck` (`next typegen && tsc --noEmit`) | exit 0, "Types generated successfully", 0 errors | PASS |
| 1.3 | Lint | `npm run lint` (`eslint .`) | exit 0, no output (0 errors, 0 warnings) | PASS |
| 1.4 | Tests | `npm test` | exit 0; **269 tests, 37 suites, 269 pass, 0 fail, 0 cancelled, 0 skipped, 0 todo** (~20 s). Matches the log's claim (269) | PASS |
| 1.5 | Production build | `npm run build` | exit 0; `▲ Next.js 16.4.6 (Turbopack)`, environments `.env.local, .env`; compiled in 4.8 s; TypeScript step clean; 16 static-generation units; **no warnings** | PASS |
| 1.6 | Build leaves tree clean | `git status --porcelain` in clone after build | empty (Next did not rewrite `tsconfig.json`; `next-env.d.ts` is ignored) | PASS |

Build route table (actual):

| Route | Kind |
|---|---|
| `/`, `/_not-found`, `/login`, `/search`, `/import`, `/kodning_weapon_creator` | ƒ dynamic |
| `/entry/[slug]`, `/entry/[slug]/edit`, `/entry/new` | ƒ dynamic |
| `/ship_record/[record_id]`, `/crew_member/[crew_member_id]`, `/subsystem/[subsystem_id]`, `/edit_ship_record/[record_id]`, `/add_ship_record` | ƒ dynamic |
| `/api/auth/login`, `/api/auth/logout`, `/api/entries`, `/api/entries/[id]`, `/api/import`, `/api/import/[id]`, `/api/search` | ƒ dynamic |
| `/icon.svg`, `/robots.txt` | ○ static |
| Proxy (`src/proxy.ts`) | ƒ Proxy (Middleware) |

Matches the execution log ("every app route ƒ; only `/icon.svg`, `/robots.txt` static"). Note N5: `/kodning_weapon_creator` is dynamic only because the root layout/shell is auth-aware (reads the session); acceptable.

## 2. Type safety and suppressions

| # | Check | Command | Actual | Result |
|---|---|---|---|---|
| 2.1 | Plan grep | `git grep -nE "@ts-ignore\|@ts-expect-error\|\bany\b" -- "src/**/*.ts" "src/**/*.tsx" scripts tests "*.ts" "*.mjs"` | no `@ts-ignore`/`@ts-expect-error`; every `any` hit is English prose in comments/strings or the string literal type `'any'` in `src/lib/nav.ts:9-24` (nav visibility), plus the rule name in `eslint.config.mjs:10` | PASS |
| 2.2 | Real `any` types | `git grep -nE ":\s*any\b\|as any\|<any>\|any\[\]" -- src scripts tests` | no match | PASS |
| 2.3 | Other suppressions | `git grep -nE "eslint-disable\|@ts-nocheck\|tslint:disable\|biome-ignore\|prettier-ignore" -- src scripts tests *.ts *.mjs` | no match | PASS |
| 2.4 | tsconfig strict really on | `npx tsc --showConfig` | `strict: true`, `noUncheckedIndexedAccess: true`, `noImplicitOverride: true`, `allowJs: false`; tsconfig equals plan 1.3 verbatim | PASS |
| 2.5 | Strict enforced (probe) | temp file `src/zz-v1-strict-probe.ts` with an untyped param and `const s: string = a[0]`, `npx tsc --noEmit`, file deleted | TS7006 (implicit any) and TS2322 (`string \| undefined`) reported | PASS |
| 2.6 | Lint rules enforced (probe) | temp `src/zz-v1-lint-probe.ts` with `: any` and `// @ts-ignore`, `npx eslint`, file deleted | `no-explicit-any` error and `ban-ts-comment` error | PASS |
| 2.7 | `as unknown as` casts (informational) | `git grep -n "as unknown as" -- src scripts tests` | 10 hits: 7 in test files (router/env/db doubles), `src/lib/db/client.ts:13` (globalThis cache), `src/lib/search/query.ts:184,189` (raw `db.execute` rows to typed rows). Not `any`; acceptable | PASS |

## 3. Source files and assets

| # | Check | Command | Actual | Result |
|---|---|---|---|---|
| 3.1 | No JS/JSX/CSS sources in `src` | `git ls-files src \| grep -E "\.(js\|jsx\|css\|mjs\|cjs)$"` | empty (25 `.scss` files) | PASS |
| 3.2 | Root files | `git ls-files \| grep -v /` | `.env.example .gitignore CLAUDE.md README.md UPGRADE_PROMPT.md drizzle.config.ts eslint.config.mjs next.config.ts package-lock.json package.json tsconfig.json` — only `eslint.config.mjs` is non-TS, as the plan prescribes (1.4) | PASS |
| 3.3 | Referenced assets exist | `git grep` for image/font imports and `url(` in `src` | `@/assets/tendrils.webp` (FaultFrame, WeaponSchematic), `@/assets/xaro-hull.png` (HomeView), `src/fonts/Hacked-KerX.ttf` (fonts/index.ts) — all present; the two `url(` are inline `data:` SVG noise | PASS |
| 3.4 | No references to deleted assets | `git grep -niE "galaxy_map\|nebula\|static\.gif\|texture[0-9_]\|manifest\.json\|favicon\|/icons/\|logo192\|logo512" -- src scripts tests next.config.ts` | only a comment "Replaces the old static.gif" (`HomeView.module.scss:69`) and `scripts/db-backup.ts:74` writing its own backup `manifest.json`; no asset references. `public/` does not exist in the clone (empty, untracked) — nothing references `/…` public paths | PASS |

## 4. Dependencies

| # | Check | Command | Actual | Result |
|---|---|---|---|---|
| 4.1 | Versions equal plan 1.1/1.2 pins | `cat package.json`; `npm ls --depth=0` | `package.json` is identical to plan 1.2 (all 8 runtime + 9 dev entries, exact pins; `@types/node` `^22` resolved to 22.20.5). Installed: next 16.4.6, react/react-dom 19.3.1, postgres 3.4.9, react-swipeable 7.0.2, drizzle-orm 0.45.4, iron-session 9.1.1, zod 4.6.7, typescript 6.0.3, @types/react(-dom) 19.3.0, sass 1.108.2, drizzle-kit 0.31.11, eslint 9.39.5, eslint-config-next 16.4.6, tsx 4.23.15 | PASS |
| 4.2 | Every dependency used | `git grep -lE "from '<name>(/…)?'"` over src scripts tests *.ts *.mjs | drizzle-orm 17 files, iron-session 5, next 49, postgres 2 (`src/lib/db/client.ts`, `scripts/lib/script-db.ts`), react 50, react-dom 3 (`react-dom/server` in component tests; also a required peer of next), react-swipeable 1 (`useDrawerSwipe.ts`), zod 5, drizzle-kit (`drizzle.config.ts`), eslint-config-next (`eslint.config.mjs`); sass (25 `.scss`, Next's compiler), tsx (`test`/script commands), typescript, eslint, @types/* = tooling | PASS |
| 4.3 | Lockfile committed, in sync | `git check-ignore package-lock.json` / `npm ci` / lock root vs package.json | not ignored, tracked, lockfileVersion 3; root `dependencies`/`devDependencies`/`engines` in the lock equal `package.json`; `npm ci` succeeded | PASS |
| 4.4 | Tree integrity (plan check) | `npm ls --all 2>&1 \| grep -ci "invalid\|missing"` | 0; `npm ls` exit 0. See note N1 (2 "extraneous" optional packages) | PASS |
| 4.5 | `engines` | package.json | `"engines": { "node": "22.x" }` (local Node 22.14.0 satisfies it) | PASS |
| 4.6 | Nothing from CRA left | `git grep -nE "react-scripts\|reportWebVitals\|setupTests\|PUBLIC_URL\|browserslist\|web-vitals\|react-router\|use-debounce\|@testing-library" -- . ':!docs' ':!UPGRADE_PROMPT.md' ':!package-lock.json'`; lock lookup | no match (only `eslint-config-next/core-web-vitals` and the `dotenv` *restriction* rule / dotenv-format comments); `react-scripts`, `react-router-dom`, `web-vitals`, `dotenv`, `use-debounce`, `@testing-library/react` absent from the lockfile; no `eslintConfig`/`browserslist` blocks, no `.hintrc`, `manifest.json`, `robots.txt` file, favicon, `setupTests`, `index.js` tracked | PASS |
| 4.7 | Production audit | `npm audit --omit=dev` | **found 0 vulnerabilities**, exit 0 | PASS |
| 4.8 | Full audit (informational) | `npm audit` | 4 moderate, all GHSA-67mh-4wv8-2f99 (esbuild ≤ 0.24.2 dev server) via `@esbuild-kit/*` ← `drizzle-kit` 0.31.11; dev-only, not deployed; fix would downgrade drizzle-kit to 0.18.1. Same as the log | PASS (note N2) |

## 5. Configuration, ignore rules, secrets

| # | Check | Command | Actual | Result |
|---|---|---|---|---|
| 5.1 | `next.config.ts` | read | equals plan 1.5 (reactStrictMode, poweredByHeader false, sassOptions loadPaths, images formats/qualities, the 3 security headers; no distDir, no cacheComponents, no redirects) **plus** `agentRules: false` with a comment — a logged deviation (Auth stream note / CLAUDE.md); typechecks and builds | PASS |
| 5.2 | `.gitignore` | read + `git check-ignore` | equals plan 1.6 verbatim. Ignored: `.env`, `.env.local`, `.env.production`, `.secrets/*`, `backups/*`, `.claude/settings.local.json`, `*.tsbuildinfo`, `next-env.d.ts`. Not ignored: `package-lock.json`, `.env.example` | PASS |
| 5.3 | Tracked env/secret files, whole history | `git log --all --format= --name-only \| grep -E "(^\|/)\.env\|\.secrets/\|backups/\|initial-password"` | only `.env.example` (names only: `DATABASE_URL= AUTH_PASSWORD_HASH= SESSION_SECRET= CLAUDE_BIN= IMPORT_MODEL=`) | PASS |
| 5.4 | Real secret values in history | script over `git log --all -p` (7.3 MB, 59 commits on `overhaul`, 9 not on main): exact value and every ≥ 12-char fragment of `DATABASE_URL`, `AUTH_PASSWORD_HASH`, `SESSION_SECRET` from `.env`/`.env.local`, and the login password file | none found (all `false`); values never printed | PASS |
| 5.5 | Secret patterns in history | same script: `\b[0-9a-f]{64}\b`, `AUTH_PASSWORD_HASH=\S+`, `SESSION_SECRET=\S+`, `postgres(ql)?://…`, `scrypt:…{20,}` on added/removed lines | 64-hex: **0**. `…_HASH=`/`SESSION_SECRET=` hits only in code that prints/writes computed values (`scripts/set-password.ts`, `set-password.test.ts` template literals), test fixtures built with `'f'.repeat(64)` / `'a1'.repeat(16)` (`src/lib/auth/session.test.ts:10-12`, `proxy.test.ts:9-10`) and the plan's names-only sentence. `postgres://`: only in pre-overhaul `src/db.js` (see note N3) and the plan text | PASS (note N3) |
| 5.6 | `drizzle.config.ts` holds no credentials | read | no `dbCredentials`, no URL, no env access; allow-list `generate`/`check` exactly as plan 3.5 | PASS |

## 6. Client bundle (clone `.next/static`, 46 files, 1.5 MB)

| # | Check | Command | Actual | Result |
|---|---|---|---|---|
| 6.1 | Env names / server modules | `grep -rlF <p> .next/static` for `DATABASE_URL SESSION_SECRET AUTH_PASSWORD_HASH postgres postgresql:// scrypt: iron-session iron_session drizzle-orm drizzle node:crypto scryptSync auth_throttle import_sources CLAUDE_BIN child_process crew_members legacy-keys sealData unsealData pg_trgm ts_headline` | **0 files** for every pattern | PASS |
| 6.2 | Secret values in client chunks | node script: exact values and fragments of the three env values; any 64-hex string | 0 hits; no 64-hex string in any static file | PASS |

## 7. Repository guards

| # | Check | Command | Actual | Result |
|---|---|---|---|---|
| 7.1 | Legacy names in `src` only in `legacy-keys.ts` | `git grep -nE "crew_members\|ship_subsystems\|ship_records" -- src ":!src/lib/data/legacy-keys.ts"` | no match; `legacy-keys.ts:4` holds each name once as a string constant, used via `LEGACY_KEYS.*` as a bound value in the 4 legacy redirect pages | PASS |
| 7.2 | Never as SQL identifiers in `src` | `git grep -niE "(from\|join\|into\|update\|table)\s+(\"?public\"?\.)?\"?(crew_members\|ship_subsystems\|ship_records)" -- src` | no match | PASS |
| 7.3 | No write SQL on legacy tables anywhere | `git grep -niE "(insert\s+into\|update\|delete\s+from\|drop\s+table\|alter\s+table\|truncate)\s+…legacy names" -- scripts tests src` | no match. Legacy names under `scripts/` only in `db-backup.test.ts`, `db-verify-legacy.ts`, `lib/legacy.ts`, `lib/migration-guard.ts` (the guard's own deny check), `sql/checksums.sql`, `sql/copy-legacy.sql` | PASS |
| 7.4 | Not in migrations | `git grep -nE "…legacy names" -- drizzle` | no match | PASS |
| 7.5 | No risky npm scripts | `grep -nE "push\|pull\|introspect\|studio" package.json` | no match | PASS |
| 7.6 | drizzle-kit sub-commands disabled | `npx drizzle-kit push / studio / migrate / pull / introspect / drop` (clone) | each exit 1 with "drizzle-kit <cmd> is disabled in this project. Only "generate" and "check" are allowed…" (thrown while loading the config; never reaches a DB — the config has no URL anyway) | PASS |
| 7.7 | Allowed command still works offline | `npx drizzle-kit check` | "Everything's fine" | PASS |
| 7.8 | Guards are tested | `tests/repo-guards.test.ts` incl. `@media` rule, part of the 269 passing tests | pass | PASS |

## 8. README.md and CLAUDE.md

| # | Check | Actual | Result |
|---|---|---|---|
| 8.1 | Both exist | `README.md` (155 lines), `CLAUDE.md` (72 lines) at the root, tracked | PASS |
| 8.2 | Scripts | README's table lists all 16 `package.json` scripts with correct flags: `db:verify-legacy --coverage/--drift` (`scripts/db-verify-legacy.ts:67-68`), `db:migrate --dry-run` (`db-migrate.ts:161`), `verify:cleanup --snapshot/--compare/--throttle` (`verify-cleanup.ts:85-88`), `set-password --generate/--rotate-secret` (`set-password.ts:31-32`, asks twice, writes `.env.local` by default), import `--dry-run --pending --retry-failed --force --model` (`src/lib/import/args.ts`). "Backup first" for `db:migrate` holds: it refuses unless legacy checksums equal `backups/LATEST` (`db-migrate.ts:96,147`) | PASS |
| 8.3 | Env var names | `DATABASE_URL`, `AUTH_PASSWORD_HASH`, `SESSION_SECRET`, `CLAUDE_BIN`, `IMPORT_MODEL`, `IMPORT_TIMEOUT_MS`, `IMPORT_STUB_FILE` — every one is read in code (`src/lib/import/args.ts:32,71`, `cli.ts:115`, auth/db modules); load order `.env.local` then `.env` matches `scripts/lib/env.ts:10`. Throttle "5 per 15 min, 6th refused even with the right password" matches `src/lib/auth/throttle.ts:6-22`; upload ≤ 1 MiB matches `upload-schema`; "retried twice" matches `RETRY_WAITS_MS` (2 entries) | PASS |
| 8.4 | Import workflow | site only queues; CLI on the PC; `--dry-run` writes nothing; `--pending`; possible-duplicate rule; samples in `samples/` (3 tracked files) — consistent with code and plan 6 | PASS |
| 8.5 | Drop-legacy SQL marked NOT EXECUTED | README lines 142-153: header `-- !!! NOT EXECUTED. OWNER ONLY…`, same statements as plan 3.7; CLAUDE.md line 20-21 says the drop SQL is for the owner and the legacy tables are never written/altered/dropped | PASS |
| 8.6 | CLAUDE.md accuracy | DB rules match drizzle.config + repo guards; `requireApiAuth` first in factories; no root `loading.tsx` (confirmed: `src/app` has none, `src/app/search/loading.tsx` exists); `golden.test.ts` exists; `node_modules/next/dist/docs/` exists; `PageProps<…>` used in pages; `agentRules: false` present in `next.config.ts` | PASS |

## Notes (no FAIL; informational)

- **N1 (minor, cosmetic):** after `npm ci`, `npm ls` lists `@emnapi/runtime@1.11.3` and `@img/sharp-wasm32@0.35.5` as *extraneous*. Both are in the lockfile as `optional: true` (sharp's wasm fallback via next). Known npm behaviour with platform-optional packages; `npm ls` exit 0, 0 invalid/missing. No action needed.
- **N2 (minor, dev-only):** 4 moderate `npm audit` findings, all esbuild ≤ 0.24.2 under `drizzle-kit` 0.31.11's `@esbuild-kit/*`. Production audit is clean. Revisit when a drizzle-kit release drops `@esbuild-kit`.
- **N3 (minor, pre-existing, outside the overhaul diff):** the old `src/db.js` in commits `dfb6fab` (2025-04-19) and `7ee8de4` (2025-04-25), reachable from `main` and therefore from `overhaul`, contained a hard-coded `postgres://user:password@localhost…/xaro_db` connection string. It is a **localhost** development credential; its host and password differ from the current `DATABASE_URL` (checked programmatically, values not printed). Not a production leak. Suggestion: if that local password is reused anywhere, change it; rewriting public history is not recommended for this.
- **N4 (trivial docs):** `npm run db:copy-legacy -- --dry-run` exists (`scripts/db-copy-legacy.ts:35`) but is not in the README table; `.env.example` lists `CLAUDE_BIN`/`IMPORT_MODEL` but not the also-optional `IMPORT_TIMEOUT_MS`/`IMPORT_STUB_FILE` (README documents them; plan 1.6 only required the five names). Optional one-line fixes.
- **N5:** every page route is dynamic (ƒ), including `/kodning_weapon_creator`, because the shell is auth-aware. Matches the log; acceptable for this site.

## Not run / out of scope
- No browser, HTTP or database checks (V2–V5 scope). Nothing written to the database.
- Clone left at `C:\Users\nkara\AppData\Local\Temp\claude\d99098be4306fc80\2ba05b36-9dcf-4842-a31f-141d6e8b8940\scratchpad\v1\clone` (its `node_modules` removed afterwards); logs `npm-ci.log`, `typecheck.log`, `lint.log`, `test.log`, `build.log`, `npmls.log` beside it.
