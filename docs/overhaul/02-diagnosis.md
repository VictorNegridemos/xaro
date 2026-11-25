# 02 — Diagnosis

Phase 2 of the X'aro overhaul. Inputs: `UPGRADE_PROMPT.md`, the four Phase 1 investigations
(`01-investigation-frontend.md` = **[A]**, `-data.md` = **[B]**, `-platform.md` = **[C]**,
`-weapon-creator.md` = **[D]**), `baseline/visual-notes.md` = **[V]** and the baseline screenshots.
Read-only work; a few claims were re-checked against the source (marked *confirmed in source*).

Counts: **6 critical, 22 high, 24 medium, 10 low** (62 items), 8 owner decisions, 14 browser checks.

Severity scale
- **Critical** — breaks a hard rule of the spec, loses or corrupts data, or blocks a goal outright.
- **High** — a goal fails or a Phase 5 check fails unless the plan handles it explicitly.
- **Medium** — real defect or pitfall with a contained blast radius.
- **Low** — clean-up, or a note that prevents a wrong turn.

---

## 0. Where the investigations disagree — which one is right

| # | Topic | Claims | Verdict |
|---|---|---|---|
| D1 | Search debounce | [B] S10: "request on every keystroke, no debounce". [A] §4: 500 ms debounce in `FormInput` | **[A] is right.** `FormInput.js:16-22` uses `useDebouncedCallback(…, 500)` (*confirmed in source*). The rest of S10 stands: no `AbortController`, no `response.ok`, clearing the box does not clear results (`Form.js:26`). |
| D2 | Static vs dynamic pages | [B] P7: `Main`'s two queries "make every route dynamic". [A] §1: `/`, `/add_ship_record`, `/kodning_weapon_creator` are prerendered at build (from `build/prerender-manifest.json`) | **[A] is right**, and [C] §2.1 explains why: a DB read through a driver (not `fetch`) does not make a page dynamic. Those three pages show build-time crew and subsystem data. |
| D3 | Number of test rows in `ship_records` | [B] says "22 of 35 are test junk" but lists ids 2-9, 14-23, 26, 27, 29, 34, 35 | The list has **23** ids (8 + 10 + 2 + 1 + 2). 23 test + 4 "joke" (10-13) + 8 lore = 35. Use 23. |
| D4 | Desktop 1440×900 | [A] §3.2 (computed): "OK". [V] (observed): search input covers the bottom of every content card; Back/Edit/Create/Update are half or fully hidden; cards are clipped by the viewport bottom | **[V] is right.** [A]'s arithmetic only covered the top edge of the content. Confirmed on `edit_ship_record-10-1440x900.jpg`: Create/Update are slivers either side of the search box. |
| D5 | Landscape 844×390 | [A] computed content top ≈ −620 px; [V] measured −620 px | **Agree.** [V] adds what [A] could not compute: document `scrollWidth` 918 px (real horizontal scroll), ship bar 992 px wide (not 960: padding), side panels permanently open at 169 px, nav buttons painted over crew names. Use [V]'s numbers. Confirmed on `kodning_weapon_creator-844x390.jpg` and `ship_record-10-844x390.jpg`: no page content visible at all. |
| D6 | Portrait 390×844 | [A] computed content top 206 px; screenshot shows the card starting at ~206 CSS px with a ~115 px empty band under the ship bar | **Agree.** |
| D7 | Opening the top drawer on touch | [A] (computed): tap on a subsystem tile opens it; vertical swipe strips are "close to unusable". [V]: opened after tap **plus** a synthetic swipe; tap-only unconfirmed | **Unresolved** — browser check B3. Moot after the rewrite, but the new shell must make tap the primary way and swipe an extra. |
| D8 | Drawer animation | [A]: margin change snaps (only `width`/`height` transition). [V]: animations are slow, closed state still shown 2 s after the click | **Unresolved**, probably the capture tool's timing. Moot after the rewrite; do not port the timings. |
| D9 | Text-search config for names | [C] example uses `to_tsvector('english', name)`. [B] §3.6 measured that `english` stems invented names (`Napones` → `napon`) and splits apostrophes (`X'aro` → `x`, `aro`) | **Follow [B]**: `simple` config for name and aliases, `english` for summary/body, trigram for typos. [C]'s snippet is an API illustration, not a schema proposal. |
| D10 | `prepare: false` | [C]: needed behind a transaction-mode pooler; "see Agent B". [B]: direct TCP on 5432, not a pooler host | **Not needed**; leave prepared statements on. Re-check only if the owner changes `DATABASE_URL` to a pooled URL. |
| D11 | Weapon creator keyboard states | [D] modelled `pointer-events: none` in jsdom; [V] confirmed in a real browser: `disabled === false`, `tabIndex 0` | **Agree** — the 966 keyboard-only states are real. |
| D12 | "Phones ≤ 375 px clip the subsystem tiles" | [A] computed (38.4rem at a 10 px root = 384 px) | **Not observed** (no baseline narrower than 390). Moot after the rewrite; the new layout is checked at 360 px (B12). |

---

## 1. Root causes

Several findings are symptoms of the same cause. Fix the cause; do not port the symptoms.

| ID | Root cause | Symptoms it produces | Cure |
|---|---|---|---|
| **R1** | **The shell is a stack of in-flow and absolutely positioned boxes placed with percentage margins.** The top drawer is hidden with a negative `margin-top` in % (resolves against **width**) while its height is a % of the viewport **height**; every content component compensates with its own width-based `margin-top`; the search box is `position:absolute; bottom:3rem` over the content; `@media (max-height:700px)` has no width condition ([A] §3.2, §3.5–3.7) | Content off-screen at 844×390 and on short desktop windows; hidden drawer hanging into view on tablets; 811–999 px dead zone; six stacked breakpoints per file; search box covering buttons at every size; layout jumping when the mobile URL bar collapses; empty black band above the content | New shell built once as a CSS grid with named areas (ship bar / rails / content / search), drawers moved with `transform`, heights in `dvh`, content area as the single scroll container. Three layout mixins; no percentage margins; no per-component position compensation. |
| **R2** | **Nothing scrolls, by design.** `body {overflow:hidden; touch-action:none}` + `.main {overflow:hidden}`; scroll containers exist only at ≥ 1000 px ([A] §6.4) | Record text unreadable past the fold on phones (hence the "< >" expand workaround); crew drawer and search dropdown do not scroll; pinch-zoom disabled; no scroll affordance | One bounded scroll container per region with `overflow-y:auto`, `overscroll-behavior:contain`; remove global `touch-action:none`; put `touch-action: pan-y` only on swipeable drawer surfaces. |
| **R3** | **`touch-action:none` exists because the swipe option is misnamed.** `preventDefaultTouchmoveEvent` is the react-swipeable v6 name; v7 ignores it ([A] §3.4). The swipe is bound to `document` and re-bound on every render | Global scroll lock (R2); 25 px flick anywhere (inputs, selects, lists) toggles a drawer; invisible panel state at ≥ 811 px causing "first tap does nothing" | Bind swipes to the drawer edges/handles only, in the portrait layout only, with v7 option names and a stable ref. |
| **R4** | **No real controls.** Every button is `<a href="#">`; toggles are `<div>/<h3>/<span onClick>`; "disabled" is `pointer-events:none` ([A] §2, §8; [D] Q2) | No disabled state → double submits (the duplicate rows 10-12, 18-19, 34-35 in the live data, [B] A7/P10); `#` pushed into history and an unreliable Back; nothing operable by keyboard; no focus/hover states; 966 unintended weapon-creator states | One `Button` (`<button>`/`<Link>` discriminated union) with all states; native or ARIA-correct form controls; `:focus-visible` in the foundation. |
| **R5** | **The shell lives inside every page, not in the layout,** and reads the DB without any dynamic API ([A] §1, §3.8) | Shell state lost on every navigation; three routes frozen at build time; two sequential queries per page | Shell in `app/layout.tsx` (or a route-group layout), data fetched once there with `Promise.all`, made dynamic deliberately (session read or `connection()`), `revalidatePath('/', 'layout')` after every mutation. |
| **R6** | **No boundary between "request data" and "trusted data".** No auth, no validation, no error handling, `SELECT *` rows passed straight to a generic renderer ([B] §2) | Public writes; 500s on bad ids; 200 on rejected input; "Record added" on failure; crash on a NULL column | Typed data-access layer + zod at every boundary + session check in every mutating handler + `notFound()`/`error.tsx`. |
| **R7** | **The production database is the only database, and the old site keeps writing to it.** ([B] §1, M1) | Checksums drift; rows can appear between backup, copy and the owner's deploy; verification data lands in production | Backup + checksum + copy in one sitting; idempotent re-runnable copy; explicit clean-up of test data; a post-deploy re-copy step in the final report (see C4, C5). |
| **R8** | **Leftovers of the CRA → Next migration.** `react-scripts`, `distDir:'build'`, `serve ./build`, ignored lockfile, CRA manifest, `#root/.App` wrappers ([C] §1, §3) | 706 MB `node_modules`, non-reproducible Vercel builds, a `start` script that cannot work | Remove; commit the lockfile; default `.next`. |

---

## 2. Ranked findings

Format: **ID — statement.** Evidence · Consequence · Resolution.

### 2.1 Critical

**C1 — Every write path is public on the live site.**
Evidence: `src/app/api/create/route.js:6-15`, `src/app/api/edit/route.js:6-15`, `ship_record/[record_id]/page.js:12` (`editable={true}`), public `/add_ship_record` and `/edit_ship_record/[id]` — [B] A1/E1/P6, [A] §1.
Consequence: anyone can insert or overwrite records today; it is also the source of live-data drift (C4).
Resolution: iron-session check **inside every mutating route handler / server action** (401 when logged out), edit/add/import pages redirect to `/login`, UI controls hidden when logged out. A `proxy.ts` gate is optional convenience only ([C] §4.2). V3 calls every endpoint directly while logged out.

**C2 — The layout is broken by construction outside two viewport shapes (root cause R1).**
Evidence: `TopPanel.module.css:8,71,80,89,101,110`; `SearchResult.module.css:4,64,94,108,114,128`; `ShipRecordCreator.module.css:4,74,96,106,115,124`; `WeaponCreator.module.css:4,99,115,122,128,134`; the four unconditioned `@media (max-height:700px)` blocks — [A] §3.2/§3.7. Observed in [V]: at 844×390 no page content is visible on six of seven routes (card at top = −620 px), horizontal scroll 918 px; at 1440×900 and 390×844 the search box covers the action buttons.
Consequence: weapon creator, records, add/edit are unusable in phone landscape and on 768p laptops; primary actions are hidden at every size.
Resolution: rewrite the shell (R1). The old CSS cannot be ported rule by rule; treat every `.module.css` as a reference for content, not for layout. Acceptance: V2 at the three viewports plus 1366×650, 820×1180, 360×640 (B12).

**C3 — Drizzle tooling can drop the legacy tables, and nothing in the database stops it.**
Evidence: role `prisma_migration` owns the three tables and is superuser ([B] §3.1); `drizzle-kit push` diffs against the live DB and proposes dropping unknown tables ([B] M12, [C] §4.1).
Consequence: one wrong command violates hard rule "Database safety" irreversibly.
Resolution: constraints K1–K4 in section 3 (never `push`/`pull`, `tablesFilter` allow-list, grep every migration file for the legacy names and for `DROP|TRUNCATE|ALTER`, legacy tables absent from `schema.ts`).

**C4 — Legacy data can change before the copy and keeps changing after it, until the owner deploys.**
Evidence: unauthenticated write routes on the live site ([B] M1, §3.7 caveat); spec rule "do not push, do not deploy" means the old code stays live after the migration; `ON CONFLICT DO NOTHING` ([B] M4) will not pick up later edits.
Consequence: (a) checksums from [B] §3.7 may legitimately differ at migration time; (b) a record added on the live site after the copy is missing from `entities` once the new code goes live; (c) a record *edited* on the live site after the copy is stale in `entities`.
Resolution: backup + checksums + copy in one session, checksums stored next to the backup and used as V4's reference ([B] §3.7). Ship the copy as a re-runnable command (`npm run db:copy-legacy`, insert-missing only). Add a **report** command that compares each legacy row with its copy and lists rows that were added or edited since. Final report tells the owner: deploy, then run the copy once more, then check the report. Do not auto-overwrite copied rows.

**C5 — Development and verification run against production.**
Evidence: `.env` holds the only `DATABASE_URL`; only `.env` exists, no `.env.local` (*confirmed*); spec §1 "assume it points at the live production database".
Consequence: (a) until the data layer is replaced, submitting the old create/edit form from `next dev` **writes to `ship_records`** — a hard-rule violation ([V] deliberately did not submit); (b) V3 (login → create → edit) and V4 (sample import) create rows in the production `entities`/`import_sources` tables that the live site will show after deploy.
Resolution: no agent submits a create/edit form or calls `/api/create`/`/api/edit` while the code still targets legacy tables. All verification data uses a recognisable marker (e.g. name prefix `ZZ-VERIFY` and the sample file's `source_id`) and is deleted from the **new** tables at the end of each verification iteration, with a count check. Whether the sample import's entities stay is owner decision O6.

**C6 — The import cannot be run or verified end to end on this machine today.**
Evidence: `claude` not on PATH; the desktop-bundled binary is not logged in (`"Not logged in · Please run /login"`, exit 1, no `~/.claude/.credentials.json`) — [C] §0.1, §4.5. No model call has succeeded, so `--json-schema` + `--tools ""` and `--system-prompt-file` are untested.
Consequence: goal 4 and V4's "import the sample file" cannot pass without an owner action; risk of a silent scope cut.
Resolution: owner decision O5 (install + log in before Phase 4, or accept an import verified only with a recorded/stubbed CLI response). Either way: the CLI call sits behind one function with an injectable runner so chunking, zod validation, retry, merge and the DB transaction are unit-tested without the CLI; the script fails with an actionable message on `ENOENT` / not-logged-in; the final report states exactly what was and was not exercised.

### 2.2 High

**H1 — Search box overlaps content and actions at every size.** Evidence: `BottomPanel` absolute `bottom:3rem` z 3 ([A] §3.1, §3.5); [V] all three viewports; `ship_record-10-390x844.jpg` (Back/Edit hidden). Consequence: primary actions unreachable. Resolution: search gets its own grid row (R1); content area ends above it.

**H2 — Long text does not scroll below 1000 px; pinch-zoom is disabled (R2).** Evidence: `SearchResult.module.css:70-75` (≥ 1000 only), `:116-119` targets the title div; `Main.css:11,14,20` — [A] §6.4. Consequence: records unreadable on phones; accessibility failure. Resolution: R2. Spec 5.5 asks to "fix the cause": the cause is the missing scroll container and the misnamed swipe option (R3), not `touch-action` alone.

**H3 — Swipe handling is global, mis-configured and re-bound on every render (R3).** Evidence: `MainPanel.js:29-45`, `TopPanel.js:10-22`, `SidePanel.module.css:110-116` — [A] §3.4. Consequence: drawers toggle while typing/scrolling/using selects; invisible state on touch laptops. Resolution: R3; swipe only in portrait, tap always works.

**H4 — `Button` is an anchor with no disabled state; submits can be doubled (R4).** Evidence: `Button/Button.js:11-19`; duplicates in the live data ([B] A7, P10); `ShipRecordCreator.js:126` (*confirmed*). Consequence: duplicate rows, `#` in history, unreliable Back. Resolution: new `Button`; pending state disables submit; server-side protection via returned id + redirect.

**H5 — Create/edit reports success on failure, and edit probably never navigates.** Evidence: `ShipRecordCreator.js:45-48` (no `response.ok`, no `.catch`), `:62-64` `redirect()` from `next/navigation` inside a `.then` (*confirmed in source*); API returns 200 `[]` on rejected input (`api/create/route.js:9-14`, [B] A5). Consequence: lost edits presented as success; form stuck on "Updating" (B1). Resolution: server action or route handler returning a typed result (`{ok, slug}` / `{ok:false, errors}`), zod validation, proper status codes, inline error state, `router.push` to the entry after success.

**H6 — Missing or malformed ids give 500s; the edit URL silently becomes a create form.** Evidence: [B] P1/P2, [A] §1; `SearchResult.js:37`, `ShipRecordCreator.js:10`. Consequence: broken links crash; a wrong edit URL creates a new record instead. Resolution: slug/id validation, `notFound()`, `not-found.tsx`, `error.tsx`, `loading.tsx` in the ship-computer voice.

**H7 — Pages that read the DB are prerendered unless made dynamic (R5).** Evidence: `build/prerender-manifest.json` ([A] §1); [C] §2.1 caching row. Consequence: stale crew/ship data today; after the overhaul any page without `params`/`searchParams`/`cookies()` (home, import queue if the session were not read) would freeze at build, and a build on Vercel would bake DB content. Resolution: constraint K14. Do **not** enable Cache Components.

**H8 — Search UX and semantics are wrong for goal 5.** Evidence: [A] §4 problems list; [B] S1–S10 (as corrected by D1); [V]: 23 results push the first ones above the viewport, rows 27 px tall. Consequence: results unreachable, not shareable, no ranking, `%`/`_` act as wildcards. Resolution: replaced wholesale by `GET /api/search`, `/search?q=`, `/entry/[slug]` (spec 5.3). The dropdown is removed or becomes optional suggestions that are dismissable, scrollable and abortable.

**H9 — The generated `search_vector` has hard constraints, and its SQL has never been executed.** Evidence: [B] §3.6 volatility table and M10; [C] §0.6, §4.1 ("produced by drizzle-kit but not executed against a database"), §7. Consequence: migration fails at apply time, or a wrong expression forces drop/re-add of the column later. Resolution: constraints K5–K7; first action after owner approval is a `BEGIN … ROLLBACK` dry run of the full migration on the live server.

**H10 — Slug collisions and empty slugs.** Evidence: [B] M2/M3: `alex-is-an-intergalactic-horror` ×3 (ids 10-12), `test13` ×2 (18, 19), `siuu` ×2 (34, 35); `??` slugs to empty. Consequence: unique-constraint failure aborts the copy, or non-deterministic slugs break idempotency and redirects. Resolution: one deterministic slug function shared by copy, create and import: lowest `legacy_id` keeps the plain slug, later ones get `-<legacy_id>`; fallback `<type>-<id>` for an empty slug; for new rows append `-2`, `-3`… Slug never changes on rename.

**H11 — Idempotency must be keyed on `(legacy_table, legacy_id)`.** Evidence: [B] M4; spec 5.1. Consequence: duplicates on re-run, or V4 "exactly one copy" fails. Resolution: partial unique index `WHERE legacy_table IS NOT NULL` + `ON CONFLICT (legacy_table, legacy_id) DO NOTHING`. Note Postgres requires the conflict target to repeat the index predicate: `ON CONFLICT (legacy_table, legacy_id) WHERE legacy_table IS NOT NULL DO NOTHING`.

**H12 — Two thirds of `ship_records` is test data.** Evidence: [B] §3.4 (corrected by D3): 23 test rows, 4 joke rows, 4 of those 27 are exact duplicates, 8 lore rows. Consequence: junk dominates search results and the "existing entities" list sent to Claude on every import. Resolution: owner decision O1.

**H13 — "Latest" is the wrong target for four packages.** Evidence: [C] §0.2–0.5, §1.2–1.3: TypeScript 7.0.2 is outside `typescript-eslint`'s range (use **6.0.3**); ESLint 10 breaks plugin peer ranges (use **9.39.5**); `postgres` 4.x is a 3-week-old rewrite (stay on **3.4.9**); `drizzle-orm` 1.0 is an RC (use **0.45.4** / kit **0.31.11**) while parts of the Drizzle site already document 1.0. Consequence: failed installs, type-lint breakage, or behaviour changes in the driver under Drizzle. Resolution: pin the versions in [C] §6; state in the final report that "current stable" was deliberately not "latest" for these, with the reason (spec rule "no silent scope cuts").

**H14 — Builds are not reproducible and the start script cannot work (R8).** Evidence: `.gitignore` ignores `package-lock.json` (*confirmed*); `start: npx serve@latest ./build`; `distDir: 'build'` (`next.config.ts`, *confirmed*) — [C] §3. Consequence: every Vercel deploy resolves fresh transitive versions; after a large upgrade this is how "works locally, fails on Vercel" happens. Resolution: commit the lockfile; `start: next start`; `distDir` per owner decision O4; `engines.node`.

**H15 — Weapon creator: frozen behaviour includes bugs, and the golden generator dies in Step 1.** Evidence: [D] §4–§6 (Q1–Q14); generator depends on `jsdom` 16 and `sucrase`, both present only as transitive dependencies of `react-scripts` (`npm ls`: `react-scripts → jest → jsdom`, `react-scripts → tailwindcss → sucrase`, *confirmed*), and on React 18's `react-dom/test-utils`. Consequence: a "clean" typed refactor will fix Q1–Q13 by accident; after `react-scripts` is removed the golden file can no longer be regenerated. Resolution: section 3.2. The golden JSON is the fixed reference from now on.

**H16 — The ship panel depends on legacy ids and exact strings.** Evidence: `ShipPanel.js:12` whitelist `1,2,4,6,7,8` marked TEMP (*confirmed*); `ShipOverview.js:25` / `ShipSystem.js:11` `status === 'Online'`; `type` is a repeated category, `current` is the unique label ([B] §3.4, §4.1). Consequence: after the move to `entities` the ids differ → empty or wrong ship bar; a normalised status shows everything Offline. Resolution: constraints K11–K12.

**H17 — `ts_headline` output is not HTML-escaped.** Evidence: [C] §4.4. Consequence: rendering snippets with `dangerouslySetInnerHTML` turns stored text (anyone logged in, or an imported file) into XSS; today there is none ([B] "Not a defect: XSS"). Resolution: use sentinel markers (e.g. `StartSel=\u0001, StopSel=\u0002` or rare ASCII tokens), split in code, render `<mark>` as React elements. Never `dangerouslySetInnerHTML` for DB text.

**H18 — Auth has several ways to fail open or take the site down.** Evidence: [C] §4.2; spec 5.4. Points: (a) `iron-session` throws when `SESSION_SECRET` is missing/short — if the layout reads the session, a missing Vercel variable 500s **every page**; (b) throttling held in memory is per serverless instance and resets on cold start; (c) `secure: true` default breaks login on `http://localhost`; (d) `$` in env values is expanded by Next's env loader; (e) route handlers have no built-in CSRF/origin check (server actions do); (f) a `?next=` redirect after login is an open-redirect vector. Consequence: locked-out owner, bypassable throttle, or a dead site after deploy. Resolution: one `getSession()` that returns "logged out" (and logs once) when the secret is absent, and a login handler that refuses when either variable is absent — fail **closed**, never crash public pages; hex/base64url secrets; `secure` tied to `NODE_ENV`; `SameSite=Lax` + `Origin`/`Host` check on mutating route handlers; only same-origin relative `next` values; throttle design stated in the plan (in-memory with an honest note, or a small additive `login_attempts` table — planner's call, both are within the spec).

**H19 — Import "update or merge" can damage existing entities.** Evidence: spec 5.2; [B] M9, M17; H16. Consequence: Claude rewrites a subsystem's `attributes.status` or a crew attribute key and the shell breaks; a renamed entity changes slug and breaks links and legacy redirects; a hand-written record body is replaced by a summary. Resolution: merge policy fixed in the plan and enforced in code, not in the prompt: never touch `slug`, `legacy_table`, `legacy_id`, `type` of an existing entity; attributes are merged key by key and protected keys of legacy rows (`status`, `type`/category, `current`, `value`, crew keys) are not overwritten; `body` is appended under a source marker or replaced only when the existing body is empty; aliases are unioned. Dry-run flag (`--dry-run`) that prints the diff without writing.

**H20 — Nothing is keyboard- or screen-reader-operable (R4).** Evidence: [A] §8: no `:focus-visible`, one `:hover` rule in the codebase, clickable `div/span/h3`, placeholder-only labels, off-screen drawers focusable, no live regions, no reduced-motion. Consequence: goal 2 ("clear hover, active, focus and disabled states") fails by default. Resolution: semantics in the component inventory of the plan; drawers `inert` when closed; focus moved/trapped when open; labels; live region for results and form status.

**H21 — Readability: one distressed display font for everything, type that shrinks with the screen, sub-AA colours.** Evidence: [A] §6.3, §8; [V] "Common look": root font 16 → 12 → 10 px (`Main.css:29-38`), Kodning label 9 px, record body `#6a6a6a` on `#0d0d0d` (~3.6:1), "Offline" `#812121` on `#171717` (~1.9:1), form controls fall back to Arial. Consequence: goal 2 and spec 5.6 (AA body text) fail. Resolution: tokens with checked contrast pairs; `next/font` display + legible body font; fluid `clamp()` type that never goes below 16 px for body; root font-size left to the user.

**H22 — Legacy URLs need the legacy ids, and today's detail routes have no equivalent for skipped rows.** Evidence: spec 5.3; [B] M17. Consequence: `/ship_record/10` 404s if row 10 is not copied (ties to O1); non-numeric ids must not 500. Resolution: redirect pages resolve `(legacy_table, legacy_id) → slug`, validate `^\d+$`, `notFound()` otherwise; `/add_ship_record` → new create route; `/edit_ship_record/[id]` → entry edit route (which then requires login).

### 2.3 Medium

**M1 — DB client set-up.** `src/db.js:3`: no env check, default pool of 10, not cached on `globalThis`, no timeouts ([B] C1–C3, M19). Resolution: [C] §4.1 client with `max: 5`, `idle_timeout`, `connect_timeout`, explicit error when `DATABASE_URL` is missing; scripts use their own `max: 1` client and call `end()`.

**M2 — Request validation.** No type/trim/length checks, unguarded `request.json()`, `varchar(255)` overflow → 500 ([B] A2–A4, E2–E4, S3, S9). Resolution: zod schemas shared by client and server; length caps (name ≤ 200, body cap stated in the plan); 400 with field errors.

**M3 — Invented names and short queries in full-text search.** [B] M11, [C] §4.4: stemming of proper nouns, apostrophes splitting `X'aro`/`O'Dun`, no prefix match in `websearch_to_tsquery`, trigram useless under 3 characters, `to_tsquery` throws on raw input. Resolution: `simple` for name/aliases; prefix tsquery built from sanitised tokens; an apostrophe-stripped search name so `xaro` finds `X'aro`; `ILIKE prefix%` fallback (with `%`/`_` escaped) for 1–2 character queries.

**M4 — Placeholders, whitespace and NULLs in legacy data.** `??` (crew 3, 6), `Unknown` ×3 (subsystem 8), trailing space in subsystem 7 `current`, every legacy column nullable ([B] §3.4, M6–M8). Resolution: verbatim in `attributes`; stripped from `name`/`slug`; NULL-safe copy SQL (`concat_ws`, `coalesce`, `NULLIF`); subsystem 8 named from its category ("Core") because its `current` is the placeholder.

**M5 — Search parity for attribute values.** Today "Captain", "organic", "Online" find rows because every column is searched ([B] M18). Resolution: `jsonb_to_tsvector('english', attributes, '["string"]')` at weight D; include in V4's query set.

**M6 — No timestamps in legacy data.** [B] M15. Resolution: `created_at = migration time + legacy_id microseconds` to keep record order stable.

**M7 — Untested DDL on this host.** `CREATE EXTENSION pg_trgm` not exercised; `jsonb_to_tsvector` in a generated column not confirmed; `drizzle-kit migrate` creates schema `drizzle` with `__drizzle_migrations` ([B] M14, [C] §4.1, §7). Resolution: extension first in the first migration; dry run (H9); the checkpoint SQL shown to the owner lists the `drizzle` schema and the helper function as additive objects.

**M8 — Backup format and restorability.** `pg_dump` is not known to work against Prisma Postgres; provider objects (`ppg`, `prisma_postgres`) must not be dumped; `crew_members.id` is `GENERATED ALWAYS`; sequence `records_id_seq` ([B] M13, M16). Resolution: script writes per-table JSON + a ready-to-run `restore.sql` (`INSERT … OVERRIDING SYSTEM VALUE`, `setval`) + checksums into git-ignored `backups/<timestamp>/`.

**M9 — The checksum/backup helpers live in a session scratchpad.** [B] header: `…\scratchpad\agent-b\lib.cjs`, `checksum.sql`. Consequence: they disappear; V4 needs them. Resolution: re-create as `scripts/db-backup.ts` / `scripts/db-verify-legacy.ts` in the repo using the SQL in [B] §3.7.

**M10 — Vercel settings nobody could inspect.** No `.vercel/` link ([C] §3.1, §7): Output Directory override, Node version (Vercel default 26.x, local 22.14, iron-session needs ≥ 22.13), env vars. Resolution: `engines.node` set explicitly (O4); final report lists the dashboard checks.

**M11 — Assets.** 10.4 MB in `public/` of which three files are used; 4.5 MB in `src/icons` all unused; font shipped twice; 681 KB GIF for a 0.3 s flash; 161 KB favicon; CRA `manifest.json` ([A] §7). Resolution: `next/font/local` from `src/fonts`, `next/image` for what is kept, static-flash as CSS; deletion per O2.

**M12 — Hard-coded "data".** `CelestialBodyDetails.js:6-17` (location text), `ShipPanel.js:31` (`2.5%`); no star map exists although the spec lists a "star map" panel ([A] §2). Resolution: O2; at minimum move both into one typed constants file so the content is editable in one place.

**M13 — SCSS conversion is a rewrite, not a rename.** Cross-component tag selectors (`.TopPanel > a` etc., [A] §6.5), global `Main.css` with structural selectors, 46 media queries, literals everywhere; `@use '@/…'` does not resolve — use `sassOptions.loadPaths` ([C] §4.3); modules must stay "pure" (no bare element selectors). Resolution: spec Step 1's "mechanical rename" is only a parking step; the design-system workstream owns the real styles. The plan must say which agent deletes the parked rules.

**M14 — TypeScript strict pitfalls.** List in [A] §9 (polymorphic `Button`, `styles[extraClass]`, `ShipOverview` DOM attribute ids, `useState()` without type, context default, `documentRef(document)`); `useRef()` needs an argument in React 19 types; `PageProps<'/route'>` helpers need `next typegen` before `tsc` ([C] §2.1). Resolution: `typecheck: next typegen && tsc --noEmit`; components slated for replacement (SearchResult, Form*, MainPanel, panels) are rewritten, not typed in place.

**M15 — "Click a word to search" must survive, but its implementation cannot.** `SearchResult.js:18-34`: splits on single spaces, keeps punctuation, loses newlines (records 25, 28, 33 have them), one flex item per word, no keyboard access ([A] §4). Resolution: tokenise with a regex that keeps whitespace/punctuation as plain text, render words as inline links to `/search?q=word` (real `<a>`, so keyboard and middle-click work), `white-space: pre-line` for bodies, same stop-word rule (`IsWordInteractive`).

**M16 — Ship overview interaction bugs.** Two clicks to collapse a preselected row; re-click on the same tile does nothing (`ShipOverview.js:10-18,38`, [A] §2). Resolution: single typed id state lifted to the shell.

**M17 — Upload and prompt size limits.** Vercel function bodies are limited (~4.5 MB); CLI stdin cap 10 MB; Windows argv ~32 K; unique `content_hash` means a second upload of the same file conflicts ([C] §4.5, spec 5.2). Resolution: upload cap (e.g. 1 MB, `.txt`/`text/plain`, UTF-8 validated) with a clear message; duplicate upload returns the existing queue row; prompt always via stdin; chunk budget in the plan.

**M18 — Claude CLI invocation is fragile.** `subtype` is `"success"` on failure; `ANTHROPIC_API_KEY` silently switches billing; `--bare` (future default for `-p`) drops subscription auth; npm-global install gives a `.cmd` shim Node cannot spawn without a shell; repo `CLAUDE.md`/`.claude` leak into the call unless `cwd` is elsewhere ([C] §4.5). Resolution: success = exit 0 **and** `is_error === false` **and** zod passes; strip the API key from the child env; `CLAUDE_BIN` override; `shell:false`; temp `cwd`; per-chunk timeout; README recommends the native installer.

**M19 — Baseline screenshots are not pixel-comparable.** JPEG, three different scale factors, 844×390 captured with a desktop UA and mouse ([V] "Files"). Resolution: "after" shots use the same tool and sizes; comparison is by eye; touch behaviour in landscape is checked separately (B10).

**M20 — Repository hygiene before branching.** `docs/`, `UPGRADE_PROMPT.md`, `.claude/` are untracked on `main` (git status); the golden JSON is 4.9 MB; `eslint .` would lint `docs/overhaul/baseline/generate-weapon-golden.mjs`; stale 81 MB `build/` and 782 KB untracked lockfile exist locally. Resolution: create `overhaul` first, commit `docs/overhaul` and the spec there; ignore `docs/**` and `build/**` in ESLint; add `backups/`, `*.tsbuildinfo` to `.gitignore`; decide `.claude/` (commit `launch.json` or ignore the folder — planner's call).

**M21 — Navigation gaps.** No link to `/`; Add/Weapon-creator buttons live in the crew drawer (hidden on mobile); crew and subsystem detail pages are linked from nowhere but search ([A] §1, §8). Resolution: home link in the shell; primary nav reachable in all three layouts; crew names and subsystem rows link to their `/entry/[slug]`.

**M22 — Animation debt.** `transition: all` on margins/heights, keyframed `background-image`, `background-attachment: fixed` ([A] §6.5). Resolution: transform/opacity only; reduced-motion mixin.

**M23 — Scope of "edit" on the new model is undefined.** Today only `title`/`text` of records are editable; spec 5.3 puts Edit on every entry. Consequence: without an attribute editor the owner cannot change a subsystem from Offline to Online except by SQL or import. Resolution (planner, no owner decision needed): one entry form — name, type, aliases, summary, body, and attributes as key/value rows; legacy-protected keys keep their key names.

**M24 — No way to delete an entry.** The spec defines add and edit only. Consequence: junk rows (H12), verification leftovers (C5) and bad import results can only be removed by SQL. Resolution: owner decision O7.

### 2.4 Low

**L1 — Dead code and typos.** `string_functions.js`, unused `keyword` in `SearchResult.js:15`, `'bottom'` panel value, dead CSS list in [A] §6.5, `kondingCurrentText`, duplicate `@media (max-width:450px)`. Remove in passing.

**L2 — Sequential queries.** `Main.js:11-12`, `db.js:80-82` ([B] P7, S4). `Promise.all` in the new data layer.

**L3 — Legacy index names occupy the schema namespace.** `full_name`, `searchable_column` ([B] §3.3). New indexes use an `entities_…` prefix.

**L4 — Planner statistics are stale** (`reltuples` 28 vs 35, [B] M20). Verification uses `count(*)` only.

**L5 — Metadata.** No `viewport`/`themeColor` export, CRA manifest, allow-all `robots.txt` ([A] §1, [C] §1.4). Add viewport with `viewport-fit=cover` (needed for safe-area insets); consider `noindex` on `/login` and `/import`.

**L6 — Non-issues, recorded so nobody "fixes" them.** No SQL injection (all tagged templates) and no XSS today ([B] §2.1, §2.4); `params` already awaited ([A] §1); no React 19 removed APIs in use ([C] §2.1).

**L7 — `next/image` defaults in 16.** Only quality 75 unless `images.qualities` is set; `priority` superseded ([C] §2.1).

**L8 — `.hintrc`, one-line `README.md`.** Replace README (spec 5.8); drop `.hintrc`.

**L9 — `use-debounce`** is only needed if live suggestions are kept ([C] §1.2). Remove otherwise.

**L10 — Several lore records describe characters** (Ereshkigal, Lena, Yaraslav, Napones, Olkor, K82ACA — [B] §4.1). Spec 5.1 fixes ship records → `record`; reclassification is a later content task (edit form or import), not part of the copy.

---

## 3. Constraints the plan must honour

### 3.1 Checklist

Database and migration
- [ ] **K1** Never run `drizzle-kit push`, `pull` or `introspect` against this database. Only `generate` (offline) and `migrate`.
- [ ] **K2** `drizzle.config.ts` has `tablesFilter: ['entities', 'entity_relations', 'import_sources', …new tables only]`; the three legacy tables never appear in `schema.ts`.
- [ ] **K3** Every migration file is checked (script or grep in the `db:migrate` wrapper) for `crew_members|ship_subsystems|ship_records` in anything but a `SELECT … FROM`, and for `DROP|TRUNCATE|ALTER TABLE` on non-new objects. The copy reads legacy tables only.
- [ ] **K4** Before the first write: export the three tables to git-ignored `backups/` **and** recompute the [B] §3.7 checksums in the same session; store both. V4 compares against these, not against [B]'s snapshot.
- [ ] **K5** `search_vector` generation expression uses immutable functions only: two-argument `to_tsvector('simple'|'english', …)`, `jsonb_to_tsvector(regconfig, …)`, an `IMMUTABLE` wrapper for `array_to_string` created in an earlier migration; no `unaccent()`, no one-argument `to_tsvector`; `coalesce(…, '')` on every nullable part.
- [ ] **K6** The expression cannot be altered later without dropping the column: settle weights/configs in the plan, then dry-run the whole migration in `BEGIN … ROLLBACK` on the live server **after** owner approval and before the real run.
- [ ] **K7** Never insert/update `search_vector`; select columns explicitly so it is not shipped to the client.
- [ ] **K8** Migration order: custom migration (extension `pg_trgm` + helper function) gets the lower index; `CREATE EXTENSION IF NOT EXISTS` is the first statement so a refusal aborts before anything else exists.
- [ ] **K9** Idempotency key is `(legacy_table, legacy_id)` with a partial unique index; copy uses `ON CONFLICT … DO NOTHING`; never keyed on slug or name. The copy is a re-runnable command.
- [ ] **K10** Slugs are deterministic (rule in H10) and immutable after creation.
- [ ] **K11** `attributes` keeps the legacy column names and values verbatim (including `??`, `Unknown`, the trailing space of subsystem 7, exact `Online`/`Offline` casing). The shell compares `attributes.status === 'Online'`; if the plan normalises it, the comparison changes in the same commit.
- [ ] **K12** `ShipPanel`'s id whitelist is replaced by a data rule that reproduces today's six tiles: first `ship_system` per category (`attributes.type`) ordered by `legacy_id` → FTL(1), PROPULSION(2), WEAPONS(4), SHIELDS(6), SENSORS(7), CORE(8). No entity ids in code.
- [ ] **K13** At the end no application code references the legacy tables (grep in V4); scripts under `scripts/` that back up, copy and verify are the only readers and are named as such.
- [ ] **K14** Every page or layout that reads the DB is dynamic on purpose (session read, `await connection()`, or dynamic params) — check the build output for unexpected `○ (Static)` routes; mutations call `revalidatePath('/', 'layout')`. Cache Components stay off.
- [ ] **K15** Migrations are applied from the owner's PC, never in the Vercel build (`build` stays `next build`).
- [ ] **K16** Live-data drift: backup, checksums and copy happen in one sitting; the final report includes the post-deploy re-copy and the drift report (C4).
- [ ] **K17** No agent writes to legacy tables through the old app: no create/edit form submission until the data layer is switched (C5). Verification data is marked and removed from the new tables.

Security
- [ ] **K18** Session checked inside every mutating handler/action; 401 JSON for APIs; UI hiding is additional.
- [ ] **K19** Missing `SESSION_SECRET`/`AUTH_PASSWORD_HASH` ⇒ logged-out behaviour and a refused login, never a crash of public pages.
- [ ] **K20** Password hash format without `$` (e.g. `scrypt:<N>:<salt hex>:<hash hex>`), `timingSafeEqual`, secrets only in `.env.local`; the password is never written to `docs/overhaul/*`, commit messages or logs — it appears once, in the final report.
- [ ] **K21** DB text is never rendered through `dangerouslySetInnerHTML` (snippets included, H17).
- [ ] **K22** The DB URL is never printed; scripts load env through `@next/env` or `process.loadEnvFile`, not `dotenv`.

Platform
- [ ] **K23** Versions pinned as in [C] §6 (TS 6.0.3, ESLint 9.39.5, postgres 3.4.9, drizzle-orm 0.45.4 / kit 0.31.11, iron-session 9.1.1, Next 16.4.6, React 19.3.1). Read the version-matched docs in `node_modules/next/dist/docs/` rather than memory; `middleware` is `proxy.ts` in Next 16.
- [ ] **K24** Lockfile committed; `engines.node` set; `start` = `next start`.
- [ ] **K25** Sass: `@use` only, shared partials via `sassOptions.loadPaths`, partials contain no CSS output, breakpoints exist only in the mixins file.
- [ ] **K26** Git: branch `overhaul`, local commits per workstream, no push/PR/deploy/Vercel change.

Import
- [ ] **K27** Claude CLI: not on PATH and not logged in on this machine; the script must detect both and explain; never use `--bare`; prompt through stdin; success test as in M18; no parallel chunk calls.
- [ ] **K28** Merge policy enforced in code (H19); one transaction per source; same hash is a no-op without `--force`.

Weapon creator
- [ ] **K29** Q1–Q14 preserved (3.2); data tables copied byte for byte, typos included; golden JSON is read-only reference and is never regenerated or edited.

Process
- [ ] **K30** Anything that deviates from the spec's letter (pinned versions below latest, rows not copied, states made unreachable, import not exercised) is listed in the final report.

### 3.2 Weapon creator: quirks to preserve and how the golden file is used

Quirks (full text in [D] §6) and where each one must live after the refactor:

| Quirk | Must be preserved in |
|---|---|
| Q1 style state is not reset on proficiency change; the select shows the first option while state holds the stale value; returning restores it | reducer (`setProficiency` leaves `style`) + a `displayedStyle(state)` selector = `style` if it is in the new list, else the first option |
| Q2 type select and Smart checkbox are only pointer-blocked under specialization Devouring | UI layer — subject to owner decision O3; the derive function supports those states either way |
| Q3, Q4 smart ignored for simple-weapon dice; smart changes die type for martial | derive function (dice table) |
| Q5 empty attack bonus leaves a double space; Q6 `3 +` for both two-handed martial, `2 +` otherwise, Laser only | derive function / line assembly |
| Q7 leaving Devouring via specialization resets type to Laser, smart stays false; Q8 selecting Devouring by either select clears smart; Q13 one event per render | reducer |
| Q9, Q10 Devouring ranged keeps range, unlimited ammo; total ammo ignores type | derive function |
| Q11, Q12 verbatim texts (`Halbert`, `ACR`, `it's`, `proned`, psychic/WIS on Acidic, double space in `mass increase  -`), template-literal newlines | data module — copy the literals, do not retype or reformat them (disable Prettier/ESLint auto-fix on that file) |
| Q14 Back = `router.back()` | navigation, not weapon logic: may get a fallback to `/` when there is no history |

**How a test uses the golden JSON after `react-scripts`, `jsdom` and `sucrase` are gone.**
`generate-weapon-golden.mjs` stops working in Step 1 (its `jsdom` and `sucrase` come only through `react-scripts`, and it needs React 18's `react-dom/test-utils`). It stays in the repo as documentation of the method; `weapon-creator-golden.json` stays as the fixed reference. No DOM library is needed for the tests.

Shape of the golden file (checked): top-level `options`, `initialState`, `entries[5612]`, `specialRaw` (20 keys), `unreachable[60]`, `staleStyle[30]`, `counts`. Each entry: `input {proficiency, style, specialization, type, smart}`, `reach`, `styleVia`, `ui {typeSelectDisabledClass, smartCheckboxDisabledClass}`, `output {attack, damage, range, ammo, special}` (whitespace-collapsed full lines including the `Attack:` etc. prefix), `raw {attack, damage, range, ammo}` (exact `textContent`). `specialRaw` is keyed by the collapsed full line **including** the `Special: ` prefix, i.e. by `entry.output.special`.

Pure module to extract: (1) data tables; (2) `deriveWeapon(state) → {attack, damage, range, ammo, special}` returning the five **full line strings exactly as the DOM text**, assembled as the JSX does — `` `Attack: ${bonus ?? ''} ${attribute} modifier + proficiency bonus` `` (note the double space when there is no bonus), `` `Damage: ${damage} ${damageType}` ``, `` `Range: ${range} feet` ``, `` `Ammo: ${clip}, ${total} total ammo` ``, `` `Special: ${text}` ``; (3) `weaponReducer(state, action)` with `setProficiency | setStyle | setSpecialization | setType | toggleSmart`; (4) selectors `displayedStyle(state)` and `controlsLocked(state)` (= `specialization === 'Devouring'`).

Tests (plain assertions, any runner):
1. **Outputs — all 5612 entries.** `const lines = deriveWeapon(entry.input)`; for each of the five keys `collapse(lines[k]) === entry.output[k]` where `collapse = s => s.replace(/\s+/g, ' ').trim()`; additionally exact equality `lines[k] === entry.raw[k]` for the four short lines and `lines.special === specialRaw[entry.output.special]` (catches a "tidied" template literal or a lost double space). `entry.input.style` is the value the select *shows*; style never affects output, so the function may ignore it, and the test asserts that by also calling it with a different style.
2. **Options.** Option values, labels and order equal `options.*` (proficiencies, labels, `stylesByProficiency`, specializations, types).
3. **Transitions / reachability.** Breadth-first search from `initialState` applying every reducer action with every option value: the set of `(proficiency, specialization, type, smart)` reached equals the 732 distinct states in `entries`, and none of the 60 `unreachable` states is reached. Repeat with `setType`/`toggleSmart` skipped whenever `controlsLocked(state)`: the reached set equals the states of entries with `reach: "pointer"` (606). This is the test that pins Q2, Q7, Q8.
4. **UI flags.** `controlsLocked(entry.input) === entry.ui.typeSelectDisabledClass === entry.ui.smartCheckboxDisabledClass` for all entries.
5. **Stale style — 30 samples.** From `fromProficiency` with `setStyle(styleChosenThere)`, then `setProficiency(toProficiency)`: `state.style === reactStyleStateAfter` and `displayedStyle(state) === styleShownInSelectAfter`.
6. **DOM assembly without jsdom.** [D] warns that a pure-function test is not enough unless the assembly is also checked. Render the result/readout component with `renderToStaticMarkup` from `react-dom/server` (already a dependency) for the 732 distinct states; the component marks the five lines with stable hooks (e.g. `data-line="attack"`); the test extracts each marked element's text (strip tags and React's `<!-- -->` separators, decode entities such as `&#x27;`), collapses whitespace and compares with `entry.output`. Decorative schematic elements must sit outside the marked elements. V5 then spot-checks a handful of states in a real browser, including one keyboard-only state.

If O3 is answered "truly disable": tests 1, 2, 4, 5, 6 are unchanged (the derive function still covers all 5612); in test 3 only the pointer-mode assertion remains and the report states that exactly the 966 `keyboard-only` entries became unreachable in the UI.

If the golden file ever had to be regenerated: only from a `git worktree` of commit `7b0afe7` with its old `node_modules`. Not expected.

---

## 4. Decisions needed from the owner

Only items the spec does not settle. Each has options, a recommendation and the default taken if the owner does not care.

**O1 — Copy all 35 `ship_records`, or leave test/duplicate rows behind?**
Classification from [B] §3.4 (titles and lengths only; the owner should confirm):
- *Real lore (8):* 1 Ereshkigal, 24 Interspace deathgoop, 25 K82ACA, 28 The Joy Eater, 30 Lena, 31 Yaraslav, 32 Napones, 33 Olkor.
- *Unclear / in-jokes (4):* 10, 11, 12 "Alex is an intergalactic horror" (three identical rows), 13 "Strong cat".
- *Test (23):* 2–9, 14–23, 26, 27, 29, 34, 35.
- *Exact duplicates inside the above (4 redundant rows):* 11 and 12 (of 10), 19 (of 18), 35 (of 34).
Crew (6) and subsystems (8) are all real and are always copied.
Options: (A) copy all 35 as the spec and V4 say, then remove the 23 test rows and 2 duplicate joke rows (11, 12) from **`entities` only** with a reviewed statement after V4 has passed — legacy tables untouched; (B) copy all 35 and leave them; hand over the delete statement unexecuted; (C) copy only selected rows — contradicts spec 5.1 and V4 as written and makes `/ship_record/<skipped id>` a 404.
Recommendation: **A**, keeping 10 and 13 unless the owner says otherwise. Default if the owner does not care: **B** (nothing is deleted without an explicit yes).

**O2 — Unused images and the star map.**
Unused today: `public/galaxy_map.jpg`, `galaxy_map_2.jpg`, `galaxy_map_xaro.png`, `nebula_1.jpg`, `texture_1…6.jfif`, `texture_3_background.jfif`, `texture_7.png`, `manifest.json`; all of `src/icons/` (map, planet, star, system, cluster icons) — about 14 MB. The right-hand panel is static text; no star map exists, though the spec names a "star map" panel.
Options: (A) keep the panel as a styled "current location" readout, reuse one or two textures/nebula (converted to WebP/AVIF) as atmosphere, delete the rest from the working tree (they remain in git history); (B) same, but keep the map images and icons in a non-deployed `assets-archive/` folder for a future star map; (C) build a real interactive star map now — new scope, needs content (systems, coordinates) the repo does not have.
Recommendation: **B**. Default: **B** (nothing the owner may want is lost, nothing unused is deployed).

**O3 — Weapon creator under Devouring: keep the 966 keyboard-only states or truly disable the controls?**
Today the type select and Smart checkbox only ignore the pointer; with a keyboard one can build e.g. Devouring + Plasma + Smart. Options: (A) preserve exactly — controls look locked but stay focusable and operable (also what a custom select must then imitate); (B) truly disable them (`disabled`) — mouse/touch behaviour is identical, the 966 keyboard-only combinations can no longer be produced, the calculation itself is unchanged and still tested against all 5612 golden entries.
Recommendation: **B** — the coupling rules ([D] §4.3–4.4) show the lock is the intent, and a control that looks disabled but is not is an accessibility defect the spec asks to avoid. Default if the owner does not care: **B**. If there is no answer at all: **A**, because "logic is frozen" is a hard rule.

**O4 — Test runner.** Spec §3 requires approval for technology it does not name. Options: (A) `node:test` + `tsx` — no extra dependency (`tsx` is needed anyway for `import`/`set-password`), plain `node:assert`, enough for the golden comparison, slugging, chunking, zod and hashing tests; (B) Vitest 5 — nicer output, watch mode, file snapshots; adds Vite as a dev-only dependency.
Recommendation: **A**. Default: **A**.
(Same low-stakes bundle, no separate question needed unless the owner objects: remove `distDir: 'build'` so the output is the default `.next` — the owner must then confirm in Vercel → Settings → Build that "Output Directory" has no `build` override; set `engines.node` to `22.x` to match the local machine. Default: do both and list the dashboard check in the final report. If the owner prefers zero dashboard risk, keep `distDir`.)

**O5 — Claude CLI for the import.** The standalone CLI is not installed/logged in here ([C] §4.5). Options: (A) the owner installs it (`irm https://claude.ai/install.ps1 | iex`), runs `claude` once to log in with the subscription, before Phase 4 — the import is then verified for real with `samples/`; (B) build and unit-test the import against a stubbed CLI response and leave the first real run to the owner, reported as "not verified end to end".
Recommendation: **A**. Default: **B** with the gap stated in the final report.

**O6 — Verification data in production.** Verifying login → create → edit and the sample import writes to the production `entities`/`import_sources` tables. Options: (A) verify on production, mark everything, delete it from the new tables afterwards (sample entities included); (B) same, but keep the imported sample entities as demo content; (C) the owner supplies a second, empty database URL for verification — production then only receives the migration and the legacy copy.
Recommendation: **A**. Default: **A**.

**O7 — Delete action for entries.** The spec covers add and edit only. Without delete, junk rows, duplicates and wrong import results can only be removed with SQL. Options: (A) add a login-protected Delete on the entry page (danger button, confirmation, server-side session check; relations removed by cascade); (B) no delete; clean-up by SQL snippets in the README.
Recommendation: **A** — the spec already asks for a `danger` button variant and an import that will sometimes be wrong. Default: **A**.

**O8 — Naming of subsystems in the new model** *(only if the owner has a preference; otherwise the planner proceeds)*. `ship_subsystems.type` is a category that repeats; the unique label is `current`. Proposed: name = `current` ("Warp", "Fusion drive", "Rail cannon", …) with the category as alias and attribute; id 8, whose `current` is the placeholder "Unknown", is named "Core". Default: as proposed.

Not owner decisions (settled by the spec or left to the planner): Drizzle, FTS + `pg_trgm`, iron-session, SCSS modules, local Claude script (spec §3); ship records → type `record` (5.1); `zod`, `sass`, `drizzle-kit`, `tsx` (small utilities); the secondary font; throttle storage; keeping `react-swipeable`; generated vs empty `summary` for copied crew/subsystems (recommend a generated one-liner, documented).

---

## 5. Open questions that need a browser check during execution

Before the rewrite (old code, read-only — nothing is submitted, see K17):
- **B1** Does edit hang on "Updating"? `redirect()` is called inside a `.then` in a client component (`ShipRecordCreator.js:62-64`). This can only be observed by submitting, which writes to `ship_records` — **do not test on the old code**. Treat as broken; verify the replacement (`router.push`/server action) on the new tables instead.
- **B2** Does Back misbehave after an `href="#"` button was pressed (hash entry in history)? Informational; the new `Button` removes the cause.
- **B3** Does a tap on a subsystem tile open the top drawer on a touch device without a swipe (D7)?
- **B4** Is the search dropdown hidden behind the expanded detail view ([A] §4, computed)?

After the rewrite (V2/V3/V5):
- **B5** `/entry/[slug]` after an edit shows the new text immediately, and the crew list/ship bar in the layout refresh after a mutation (K14).
- **B6** Build output: which routes are `○ Static`? None that read the DB may be.
- **B7** Long record (ids 25, 33) scrolls by touch in all three layouts; pinch-zoom works; no horizontal scroll at 1440×900, 844×390, 390×844.
- **B8** Mobile URL-bar collapse/expand and the on-screen keyboard do not hide the search box, the form buttons or the focused field (`dvh`, safe-area insets) — needs a real phone or true device emulation.
- **B9** Drawers: closed drawers are not focusable (`inert`), swipes do not fire while scrolling a list, typing, or operating a select.
- **B10** 844×390 with touch emulation (the baseline used a mouse and desktop UA).
- **B11** Login cookie flags in the browser (HttpOnly, SameSite=Lax, Secure in a production build, ~30-day expiry); login works on `http://localhost` in dev.
- **B12** Extra sizes that broke the old layout: 1366×650, 820×1180, 360×640, 2560×1080.
- **B13** Weapon creator in a real browser: default state, martialRanged2h + Devouring, one Q1 stale-style sequence, and (per O3) either a keyboard-only state or proof that the locked controls cannot be focused; custom selects usable with keyboard and touch.
- **B14** Legacy URLs: `/ship_record/1`, `/crew_member/1`, `/subsystem/7`, `/edit_ship_record/1` (logged out → login), `/add_ship_record`, `/ship_record/abc` (404, not 500).

Non-browser checks still open: `CREATE EXTENSION pg_trgm` and `jsonb_to_tsvector` in a generated column on this host (dry run, K6); `--json-schema` with `--tools ""` and `--system-prompt-file` on a logged-in CLI; whether Vercel's Output Directory has an override.
