# X'aro overhaul — orchestration prompt

You are the **orchestrator** for a full overhaul of the X'aro website in `D:\React\xaro` (Windows, PowerShell; Git Bash also available). Read this whole file before doing anything. You coordinate subagents; you do not do the bulk of the reading or coding yourself. Keep your own context for decisions, hand-offs and the final report.

---

## 1. What the project is

- A small companion website for a **Dungeons & Dragons sci-fi horror campaign**. It presents itself as the computer of the ship "X'aro": crew list, ship subsystems, ship records (lore entries), a star map panel, a search box, and a "Kodning weapon creator".
- Stack today: Next.js 15.3 (App Router, plain JavaScript), React 18, CSS modules, raw SQL through the `postgres` driver, Postgres DB, deployed on Vercel from `github.com/VictorNegridemos/xaro` (`main`).
- About 2,600 lines in `src/`. Written hastily: no types, no tests, no auth, leftover Create-React-App dependencies, ad-hoc `@media` breakpoints (400/410/450/810/1000px) scattered through every module.
- Key files: `src/db.js` (all queries), `src/app/api/{create,edit,search}/route.js`, `src/components/MainPanel/MainPanel.js` (layout shell + swipe panels), `src/components/Form/*` (search box), `src/components/SearchResult/*` (detail view), `src/components/WeaponCreator/WeaponCreator.js` (327 lines, logic and data tables inline).
- Existing DB tables: `crew_members`, `ship_subsystems`, `ship_records`. `DATABASE_URL` lives in `.env` (git-ignored). **Assume it points at the live production database.**

## 2. Goals (the owner's requirements)

1. **Modernise the code.** Convert everything to TypeScript (strict) and SCSS modules. Update React, Next.js and every other relevant package to current stable versions; remove unused ones. Replace the ad-hoc responsiveness with three deliberate layouts: **desktop**, **mobile/tablet landscape**, **mobile portrait**. Must be responsive and optimised for mobile devices.
2. **Improve the visuals.** Clean and simple, but unmistakably **sci-fi horror**: the theme has priority, usability is a close second. Every interactive element needs clear hover, active, focus and disabled states, and touch targets that are easy to hit.
3. **Login.** One user, one password, no registration. Only a logged-in user can add or edit data. Generate the password and hand it to the owner.
4. **Smart knowledge repository.** A `.txt` import that goes through Claude and produces structured entries (characters, locations, technologies, factions, items, events, …). Search must then work across all of that broken-down information and be far smarter than `ILIKE`.
5. **Search results page.** A search shows a list of all matches; clicking one opens its detail page. (Today the search links straight to a single page.)
6. **Weapon creator.** Keep its behaviour **exactly** as is. Improve its visuals with extra flair; make the sci-fi horror theme most obvious on this page.
7. **Do not delete the existing DB tables.** They are removed later, by the owner, after the migration is confirmed.

## 3. Decisions already made by the owner (do not re-open)

| Topic | Decision |
|---|---|
| DB access | **Drizzle ORM** on top of the existing `postgres` driver, with versioned migration files |
| Search | **Postgres full-text search** (`tsvector`, ranking, `ts_headline` snippets) **plus `pg_trgm`** for typo tolerance. No vector search, no external search service |
| Login | **Signed/encrypted HTTP-only cookie session** (`iron-session`), password hash in an environment variable. No Auth.js |
| Claude import | **Local script, no API key.** A command run on the owner's PC that sends the text through the Claude Code CLI in headless mode (the owner's subscription) and writes the result to the DB. The deployed site never calls Claude |
| Styling | SCSS modules (no Tailwind, no component library) |

If you find a reason to add or swap any **other** technology, **stop and ask the owner** with arguments for and against. Do not adopt it on your own. Small utilities needed to implement the decisions above (e.g. `zod` for validating Claude's JSON output and request bodies, `drizzle-kit`, `sass`) are fine without asking.

## 4. Hard rules

- **Database safety.** Never `DROP`, `TRUNCATE`, `ALTER`, rename, or write to `crew_members`, `ship_subsystems` or `ship_records`. All schema changes are **additive** (new tables, new extensions, new indexes on new tables). Existing data is **copied** into the new tables, never moved. Before any write to the DB, export the three old tables to a git-ignored `backups/` folder.
- **One checkpoint with the owner** (section 7, end of Phase 3): show the plan and the exact migration SQL and wait for a go-ahead before anything touches the database. Reading the DB schema and row counts before that is fine.
- **Git.** Work on a new branch `overhaul`. Commit locally after each completed workstream with clear messages. **Do not push, do not open a PR, do not deploy, do not change Vercel settings.** The owner does that.
- **Secrets.** Never commit `.env*`, the password, the session secret or the DB URL. Never print the DB URL. The password appears exactly once: in your final report to the owner.
- **Weapon creator logic is frozen.** Refactoring into typed pure functions is allowed only if a before/after test proves identical output (section 8).
- **No silent scope cuts.** If something cannot be done, say so in the final report with the reason.
- Before using any library API, check its **current** documentation rather than relying on memory (Next.js, React, Drizzle and iron-session have all changed recently; e.g. confirm how request interception/middleware is named and configured in the installed Next.js version).

## 5. Functional specification

### 5.1 Data model (baseline — the planning agent may refine it, but must keep these capabilities)

- `entities`: `id`, `type` (character, location, technology, faction, item, creature, event, ship_system, record, other), `name`, `slug` (unique), `aliases text[]`, `summary` (1–2 sentences), `body` (full text), `attributes jsonb` (type-specific fields, e.g. rank/race/status for crew), `source_id` (nullable → `import_sources`), `legacy_table` + `legacy_id` (nullable, for copied rows), `created_at`, `updated_at`, and a generated `search_vector` (weighted: name and aliases > summary > body/attributes) with a GIN index; trigram GIN index on `name`/aliases.
- `entity_relations`: `from_entity_id`, `to_entity_id`, `kind` (e.g. "member of", "located in", "created by"), `note`.
- `import_sources`: `id`, `filename`, `content` (raw text), `content_hash` (unique), `status` (pending, processing, done, failed), `error`, `created_at`, `processed_at`.
- Copy every row of the three old tables into `entities` (crew → character, subsystems → ship_system, ship records → record), preserving all columns in `attributes`/`body`, and recording `legacy_table`/`legacy_id`. The copy must be idempotent (re-running creates no duplicates).
- **At the end, no application code may read or write the three old tables.** Everything (crew list, ship overview, record create/edit) runs on the new tables, so the old ones can be dropped later without code changes.

### 5.2 Import (local script)

- Command: `npm run import -- <path-to-file.txt>` and `npm run import -- --pending`.
- The website gets an **Import** page (login required) where a `.txt` can be uploaded from any device. Upload only stores it in `import_sources` as `pending` and shows the queue with statuses. `--pending` processes that queue from the owner's PC. Explain this clearly in the page's UI text so it is obvious that processing happens when the script is run.
- The script calls the Claude Code CLI headless (`claude -p`, JSON output, no tools needed), with a prompt that includes the text plus the list of existing entity names/aliases/types so Claude can **update or merge** existing entities instead of duplicating them.
- Claude returns strict JSON (entities with type, name, aliases, summary, body, attributes; relations between them). Validate with `zod`; on invalid output retry up to 2 times, then mark the source `failed` with the error.
- Long files are split into chunks on paragraph boundaries; results are merged by name/alias before writing.
- Writes happen in one transaction per source. Re-importing the same file (same hash) is a no-op unless `--force`.
- The script prints a summary: created / updated / relations / skipped.
- Include a small sample `.txt` under `samples/` and use it for verification.

### 5.3 Search

- `GET /api/search?q=…&type=…` (public, read-only). Combines full-text rank with trigram similarity so partial words and typos still match; matches in name/aliases rank highest.
- **Search results page** `/search?q=…`: list of all matches, each with type badge, name, highlighted snippet; filter by type; empty state; result count; keyboard and touch friendly. URL is shareable and works with back/forward.
- **Detail page** `/entry/[slug]`: all fields, attributes, related entities (linked), source file name, and Edit when logged in.
- The search box in the shell submits to the results page (debounced live suggestions are optional). The existing "click a word in the text to search for it" behaviour is kept and routes to the results page.
- Old URLs (`/ship_record/[id]`, `/crew_member/[id]`, `/subsystem/[id]`, `/edit_ship_record/[id]`, `/add_ship_record`) redirect to their new equivalents.

### 5.4 Login

- `/login` page with a single password field; logout control in the shell.
- Password is verified against a hash from `AUTH_PASSWORD_HASH`; session cookie encrypted with `SESSION_SECRET`; cookie is HTTP-only, `Secure` in production, `SameSite=Lax`, with a sensible lifetime (e.g. 30 days).
- Hash with Node's built-in `crypto.scrypt` and store as hex/base64 (avoid formats containing `$`, which env-file loading can mangle). Constant-time comparison. Basic throttling of failed attempts.
- **Every** mutating route (create, edit, import upload, anything new) checks the session **on the server**. Hiding buttons is not enough. Add/Edit/Import UI is hidden when logged out.
- Generate a strong password (≥ 20 chars, easy to type on a phone: no ambiguous characters) and a random session secret. Write the hash and secret to `.env.local` (git-ignored). Provide a script `npm run set-password` to change it later.
- In the final report list the exact environment variables the owner must add in Vercel.

### 5.5 Layouts and responsiveness

- One shared SCSS foundation: design tokens (colours, spacing, type scale, radii, glows, z-index, motion), mixins for the three layouts, and a reset. No magic breakpoint numbers inside component files.
- Three layouts, defined once as mixins:
  - **Desktop** — wide viewports with a fine pointer: all panels visible at once (crew, ship, content, star map, search), hover affordances.
  - **Landscape** — phones/small tablets on their side (limited height): content-first with compact side rails; nothing important hidden below the fold.
  - **Portrait** — phones upright: single column, panels as swipeable drawers (keep `react-swipeable` gestures or replace them with an equally good solution), bottom-reachable primary actions.
- Use `dvh`/safe-area insets, fluid type (`clamp`), ≥ 44px touch targets, `prefers-reduced-motion` support, visible focus rings, no horizontal scroll at any size. Scrolling text content must actually scroll on touch devices (today `touch-action: none` and `overflow: hidden` on `body` are used globally — fix the cause rather than carrying this forward).
- Use `next/font` for the display font (`public/Hacked-KerX.ttf`) and add a legible secondary font for long text. Use `next/image` for the large textures and maps; convert `.jfif` assets to modern formats; delete assets that end up unused.

### 5.6 Visual direction

- A derelict ship terminal: near-black backgrounds, one sickly phosphor accent, one warning/blood accent used sparingly, thin hard-edged frames, subtle scanlines/noise/glow, occasional restrained glitch or flicker on state changes. Atmosphere must never reduce contrast or readability (aim for WCAG AA on body text).
- Long-form text (records, entries) uses the legible font at a comfortable size; the display font is for headings, labels and buttons.
- One `Button` component with variants (primary, ghost, danger, icon) and all states. Consistent form controls, loading and error states, and empty states written in the voice of the ship's computer.
- Animations are short, GPU-friendly and disabled under reduced motion.

### 5.7 Weapon creator

- Identical inputs, options, rules and outputs to today.
- Presentation: treat it as a forbidden fabrication console — the strongest expression of the theme on the site (e.g. a "schematic" readout of the resulting weapon, reactive accents per weapon type, a distinct look when the *Devouring* specialisation/type is selected). Custom-styled selects and checkbox that remain accessible and work well on touch.

### 5.8 Housekeeping

- Remove unused dependencies (expect: `react-scripts`, `react-router-dom`, `@testing-library/*`, `web-vitals`, and `dotenv` if nothing needs it) and the CRA `eslintConfig`/`browserslist` blocks if obsolete. Set up ESLint for Next + TypeScript and scripts `lint`, `typecheck`, `test`.
- Investigate `distDir: 'build'` and the `start` script (`npx serve ./build`); keep only what the Vercel deployment actually needs and report what you changed.
- Add a concise `README.md` (setup, env vars, scripts, import workflow, how to drop the legacy tables later) and a `CLAUDE.md` for future agent sessions.

## 6. How to work: subagents and artefacts

- Use a **separate subagent for each phase role** below. Give each a self-contained brief: goal, exact files/areas, what is already known, what to return, and which files it may write.
- **Run in parallel whatever is independent** — send those agent calls in a single message. Two agents never write to the same file at the same time; each parallel workstream gets explicit file ownership.
- Subagents write their output to `docs/overhaul/` so later phases read files instead of relying on summaries:
  `01-investigation-*.md`, `02-diagnosis.md`, `03-plan.md`, `04-execution-log.md`, `05-verification-<n>.md`.
- Treat subagent reports as claims: spot-check the important ones (run the build, read the diff) before building on them.

## 7. Phases

### Phase 1 — Investigation (read-only, 4 agents in parallel)

- **A. Frontend:** every page and component, props/data flow, client vs server components, the swipe/panel mechanism, all styles and breakpoints, asset usage, current UX problems.
- **B. Data:** `src/db.js`, API routes, and the **live schema** (columns, types, row counts, sample shapes with values truncated; installed extensions; whether `pg_trgm` can be enabled; Postgres version and host type). Read-only queries only.
- **C. Platform and dependencies:** installed vs latest stable versions, breaking changes on the upgrade path, build/deploy configuration, what Vercel needs, current docs for Drizzle + `postgres`, iron-session with the App Router, SCSS in Next, and Claude Code headless mode (flags, JSON output shape, limits on input size).
- **D. Baselines:** (1) extract the weapon creator's rules and produce a **golden output file** covering every combination of proficiency × style × specialisation × type × smart from the *current* code; (2) run the current app and capture screenshots of every page at 1440×900, 844×390 and 390×844 into `docs/overhaul/baseline/`.

### Phase 2 — Diagnosis (1 agent)

Reads all Phase 1 files and produces `02-diagnosis.md`: defects, risks, upgrade blockers, security gaps, responsive/UX problems, data-migration pitfalls, and open questions — each ranked and tied to a file or table. Flags anything that would need a technology decision from the owner.

### Phase 3 — Plan (1 planning agent, then 1 reviewing agent)

- The planner writes `03-plan.md`: target folder structure, final DB schema and the **exact migration SQL**, route map, design tokens and layout mixins, component inventory, the workstreams with file ownership and dependencies, which run in parallel, and the acceptance checks for each.
- A second agent reviews the plan against sections 2–5 of this file and against the diagnosis, looking for gaps and conflicts; the planner's output is revised once.
- **Checkpoint:** present the owner a short summary, the migration SQL, and any technology questions. Wait for approval.

### Phase 4 — Execution

**Step 1 — Foundation (sequential, 1 agent):** branch `overhaul`; dependency upgrades and removals; TypeScript strict setup and mechanical `.js` → `.ts/.tsx` conversion; SCSS foundation (tokens, mixins, reset) and `.module.css` → `.module.scss` rename; ESLint and scripts; Drizzle schema, backup of old tables, migrations applied, legacy data copied; typed data-access layer replacing `src/db.js`. Ends with a green `typecheck`, `lint` and `build`, and a commit.

**Step 2 — Features (parallel agents, disjoint file ownership):**
- **Auth:** session library code, `/login`, logout, route protection, `set-password` script, password + secret generation.
- **Search:** search query layer, `/api/search`, `/search` results page, `/entry/[slug]` detail page, legacy redirects.
- **Import:** `npm run import` script, Claude prompt + zod schema, chunking/merge logic, Import page and upload route, sample file.
- **Design system + shell:** `Button` and form controls, panels/drawers, the three layouts for the app shell, fonts, image optimisation.
- **Weapon creator:** typed refactor guarded by the golden file, then the new visuals.

**Step 3 — Integration (sequential, 1 agent):** apply the design system to every remaining page and component, wire auth state into the UI (edit/add/import controls), connect record create/edit to the new tables, remove dead code and unused assets, write `README.md` and `CLAUDE.md`. Commit.

### Phase 5 — Verification and fix loop (max 3 iterations)

Each iteration: run the verifiers **in parallel**, each a fresh agent that did not write the code and is told to find failures, not to confirm success. Then one fixing agent (or several in parallel if the fixes touch separate files) addresses the findings, and the next iteration re-verifies. Stop when all checks pass or after the third iteration; anything still failing goes into the final report unembellished.

- **V1 Build quality:** clean install, `typecheck`, `lint`, `test`, production `build`; no `any` escapes or `@ts-ignore` without a stated reason; no remaining `.js`/`.css` source files; no unused dependencies.
- **V2 Functional (real browser, against `next dev` or a production build):** every route at 1440×900, 844×390 and 390×844 — no horizontal scroll, nothing clipped or overlapping, drawers and swipes work, text scrolls, focus and hover states present, screenshots saved to `docs/overhaul/after/` next to the baseline ones. Search flow end to end: query → results list → detail → back. Old URLs redirect.
- **V3 Auth and security:** logged out, every mutating endpoint returns 401/403 when called directly (not just hidden in the UI); wrong password rejected and throttled; cookie flags correct; no secrets in the repo, the client bundle or logs; login → create → edit → logout works.
- **V4 Data and search quality:** old tables still exist with unchanged row counts and checksums compared with the backup; every legacy row has exactly one copy in `entities`; no code references the old tables; import the sample file, check the entities are sensible, re-import is a no-op; a set of at least 15 test queries (exact name, alias, partial word, typo, multi-word, type filter, no-match) returns the expected top results.
- **V5 Weapon creator:** output for every input combination equals the golden file from Phase 1; visuals reviewed at the three viewports.

## 8. Definition of done

- All seven goals in section 2 are met and all Phase 5 checks pass (or the exceptions are listed).
- The three legacy tables are intact and unused by the code.
- Work is committed on `overhaul`, not pushed.
- Final report to the owner, short and concrete:
  1. What was built, per goal.
  2. **The generated password** (shown once) and how to change it.
  3. Environment variables to add in Vercel (`AUTH_PASSWORD_HASH`, `SESSION_SECRET`, anything else) and any Vercel/build setting that needs changing.
  4. How to run an import, step by step.
  5. Before/after screenshots location.
  6. Anything not done, not verified, or needing a decision.
  7. The exact SQL to drop the legacy tables later, clearly marked as **not executed**.
