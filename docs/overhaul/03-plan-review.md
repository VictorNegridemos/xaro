# 03 — Plan review

Independent review of `03-plan.md` against `UPGRADE_PROMPT.md` (sections 2, 4, 5, 8), `02-diagnosis.md` (C/H items, K1–K30) and the Phase 1 investigations.

**Counts: 1 blocker, 20 should-fix, 19 nits.**

How the SQL was checked: the three SQL blocks were extracted from the plan by line range (not retyped) and run on a throwaway local PostgreSQL 17.5 cluster (`C:\pgsql`, own data directory in the session scratchpad, port 54329, `pg_trgm` 1.6) against a fixture of the three legacy tables built from the columns and rows in `01-investigation-data.md` §3.3–3.4. The production database was not contacted. No project file other than this one was written.

What that run showed:

- Migration 0000–0002 applies cleanly in one transaction. The generated column that calls `xaro_entity_search_vector`, the expression GIN index on `xaro_array_to_text(aliases)`, the regex in `xaro_fold_apostrophes` and `jsonb_to_tsvector` inside the function all work on PG 17.
- Applying the migration a second time by hand fails cleanly at `CREATE TYPE entity_type` ("already exists") and rolls back; nothing is half-applied.
- The copy inserts 49 rows; the 49 slugs are exactly the list in plan 3.3; a second run inserts 0. `ON CONFLICT (legacy_table, legacy_id) WHERE legacy_table IS NOT NULL` matches the partial index.
- Attributes are verbatim (`"current": "Warp drone matrix "` keeps its trailing space, `??` and `Unknown` kept).
- The search query runs for every input tried, including `%`, `???`, `a`, `ka`, `o'dun`, `X'aro`, an unbalanced quote and a leading minus. Two problems came out of it (findings 3 and 4).
- All contrast ratios in plan 7.2 were recomputed with the WCAG formula and match to two decimals.

Not testable here: `CREATE EXTENSION` permission and behaviour on Prisma Postgres (the plan's dry run covers it), drizzle-kit's generated text for 0001, anything involving the Claude CLI.

---

## Blocker

**1. The "no legacy table names in `src/`" guard cannot pass with the plan's own code** — plan 2.2, 3.5, 3.8, 9.1 (acceptance), 9.3 (acceptance), 10.2 V4.

- Plan 3.8 puts `export type LegacyTable = 'crew_members' | 'ship_subsystems' | 'ship_records'` in `src/lib/data/types.ts`, and plan 2.2 has the redirect pages call `getSlugByLegacy('ship_records', id)`. Step 1 also adds `src/components/legacy/adapters.ts`.
- Plan 3.5 has `tests/repo-guards.test.ts` assert that `src/` contains none of the three names, and the Step 1, Step 3 and V4 checks are `git grep -nE "crew_members|ship_subsystems|ship_records" -- src` → "no match".
- Both cannot be true. The first agent to hit this will either weaken the guard on its own or rename the stored `legacy_table` values, and the second would break the copy's idempotency key.

Correction:
- Keep the stored values as they are (`legacy_table` = the real table name; spec 5.1).
- Put the three strings in exactly one file, `src/lib/data/legacy-keys.ts`: `export const LEGACY_KEYS = { record: 'ship_records', crew: 'crew_members', subsystem: 'ship_subsystems' } as const; export type LegacyTable = (typeof LEGACY_KEYS)[keyof typeof LEGACY_KEYS]`. Redirect pages and adapters import the constants.
- Guard and all three acceptance checks become: `git grep -nE "crew_members|ship_subsystems|ship_records" -- src ":!src/lib/data/legacy-keys.ts"` → no match, plus a second assertion that no file under `src/` matches `/(from|join|into|update|table)\s+("?public"?\.)?"?(crew_members|ship_subsystems|ship_records)/i` (this one includes `legacy-keys.ts`).
- State in 3.8 that the constants are only ever bound as query parameters compared with `entities.legacy_table`.

---

## Should-fix

### Migration and copy SQL (plan section 3)

**2. The empty-slug fallback violates `entities_slug_format` for `ship_system`** — plan 3.3 (`s.type::text || '-' || s.legacy_id`) and slug rule 2 ("`<type>` in create and import").
`ship_system` contains an underscore; the check is `^[a-z0-9]+(-[a-z0-9]+)*$`. Verified: a subsystem whose `current` is `---` makes the whole copy statement fail with a check violation. Not hit by today's data, but the same rule is used for create and import, where a punctuation-only name of type `ship_system` gives a 500.
Correction: `replace(s.type::text, '_', '-')` in SQL and `type.replace(/_/g, '-')` in `slugBase`/`uniqueSlug`; add a unit test for it. Corrected statement in Appendix A.

**5. The migration guard is specified as a keyword blacklist that the reviewed SQL itself trips** — plan 3.5.
"Contains `UPDATE` / `DELETE FROM` as a statement keyword" is ambiguous: 0001 has `ON DELETE cascade ON UPDATE no action` four times and 0002 has `BEFORE UPDATE ON public.entities`. A naive implementation blocks the approved migration; a loosened one lets things through.
Correction: specify an allow-list. Split each file on `--> statement-breakpoint`, strip comments, and require every statement to match one of: `CREATE EXTENSION IF NOT EXISTS pg_trgm`; `CREATE OR REPLACE FUNCTION public.xaro_…`; `CREATE TYPE "public"."(entity_type|import_status)"`; `CREATE TABLE "(import_sources|entities|entity_relations|auth_throttle)"`; `ALTER TABLE "(…same four…)" ADD CONSTRAINT`; `CREATE [UNIQUE] INDEX … ON "(…same four…)"`; `CREATE TRIGGER … ON public.entities`. Anything else fails. Keep the "legacy name anywhere" scan. Unit-test the guard with the three real files (must pass) and with one injected bad statement per class (must fail).

**6. `drizzle.config.ts` blocks by blacklist and misses `studio`** — plan 3.5.
`drizzle-kit studio` opens a data browser on the live database as a superuser role; rows and tables, including the legacy ones, can be edited or dropped there. `export` and any future sub-command are also unblocked.
Correction: allow-list instead — `const ALLOWED = ['generate', 'check']; const cmd = process.argv.slice(2).find((a) => !a.startsWith('-')); if (!cmd || !ALLOWED.includes(cmd)) throw …`. Remove `dbCredentials` from the config altogether (`generate` and `check` are offline and do not need it), so the file holds no path to the database. Add `studio` to the "must fail" acceptance checks next to `push`.

### Search (plan section 4)

**3. The search query cannot use any of the three GIN indexes** — plan 4.2 and the bullet "The operators are index-capable".
Verified with `SET enable_seqscan = off` and a generic plan: the plan is always `Seq Scan on entities` with one big `Join Filter`. Two reasons: every operand comes from the cross-joined CTE `q` rather than from a parameter, and the `WHERE` is one `OR` chain in which two arms (`e.name <% q.raw`, `starts_with(lower(e.name), …)`) have no index support, which rules out a `BitmapOr`. Removing the `starts_with` arm alone does not change the plan. Results are correct, and 49 rows do not care, but the spec asks for GIN-indexed search, the plan claims index use, and the dry run's `EXPLAIN` (3.6 step 2.6) will show a sequential scan no matter what.
Correction: Appendix B. Candidates are collected as a `UNION` of single-predicate arms whose operand is a scalar sub-select on `q`. Verified: `entities_search_vector_idx` (twice), `entities_name_trgm_idx` (twice) and `entities_aliases_trgm_idx` are used, and the output is identical to the original for all 28 test inputs. The two inherently unindexable arms stay as scans of the same table; say so in 4.2 instead of "index-capable".

**4. A query that is only a negated word returns the whole archive** — plan 4.1/4.2.
`websearch_to_tsquery` turns `-foo` into `!'foo'`, which matches every row that lacks the word (verified: 49 of 49 rows, all with score ≈ 0). A user typing `-` before a word, or pasting a hyphen-led fragment, gets every entry.
Correction: in the normalisation of 4.1, before the string is bound as `$1`/`$2`, replace `(^|\s)-+(?=\S)` with the captured whitespace (leading minus signs are dropped; inner hyphens such as `semi-organic` are untouched). Add eval case `-warp` → same results as `warp`.

### Auth (plan section 5)

**12. A stolen or forgotten session survives a password change** — plan 5.5, 5.6.
The cookie payload is `{ isLoggedIn, at }` and `set-password` keeps `SESSION_SECRET` unless `--rotate-secret` is given. After the owner changes the password, every existing cookie stays valid for up to 30 days.
Correction: put `pw: <first 16 hex chars of SHA-256(AUTH_PASSWORD_HASH)>` in the session at login and have `isLoggedIn()`/`requireApiAuth()` compare it with the current value; a mismatch is "logged out". No secret rotation needed, and it is one line in each place. Add a unit test.

**13. `auth_throttle` only shrinks after a successful login** — plan 5.9, risk 16.
Every distinct client IP that posts to the login route leaves a row; rows older than a day are removed only when the owner logs in successfully. On a public site this table grows with every scanner.
Correction: fold the clean-up into the attempt statement (verified on PG 17):

```sql
WITH gc AS (
  DELETE FROM public.auth_throttle WHERE window_start < now() - interval '1 day'
)
INSERT INTO public.auth_throttle AS t (bucket, failures, window_start)
VALUES ($1, 1, now())
ON CONFLICT (bucket) DO UPDATE SET
  failures     = CASE WHEN t.window_start < now() - interval '15 minutes' THEN 1 ELSE t.failures + 1 END,
  window_start = CASE WHEN t.window_start < now() - interval '15 minutes' THEN now() ELSE t.window_start END
RETURNING failures,
          ceil(extract(epoch FROM (window_start + interval '15 minutes' - now())))::int AS retry_after;
```

**14. The throttle test locks the other verifiers out** — plan 10.2 V3 with V2/V4 running in parallel.
Locally every request falls into the same bucket (`local`), and the attempt is counted before the password is checked. V3's "six wrong passwords" therefore makes V2's and V4's correct logins return 429 for 15 minutes.
Correction: V3 sends its six wrong attempts with a dedicated `X-Forwarded-For: 203.0.113.77` header (the bucket is derived from it) and deletes that bucket afterwards with `npm run verify:cleanup -- --throttle`; the same in the Auth workstream's own check in 9.2 A. Also state that a correct password on attempt 6+ is refused by design.

**20. No cap on the password length before `scrypt`** — plan 5.3, 5.8.
`POST /api/auth/login` is public; without a limit a multi-megabyte `password` is canonicalised and hashed (32 MiB and ~100 ms per call) five times per window per IP.
Correction: `readJsonBody(request, 2_048)` for the login route and zod `password: z.string().min(1).max(200)`; reject before the throttle row is written only for malformed bodies, not for wrong passwords.

### Import (plan section 6)

**7. `--dry-run` writes to the database** — plan 6.7 state machine versus 6.6 "`--dry-run` prints this plan and writes nothing", and 10.1 "Guard before the real sample import".
As drawn, a dry run of a new file inserts a `pending` row with origin `cli`, claims it (`status = 'processing'`, `attempts + 1`, `error = NULL`) and then "restores the previous status". On production that leaves a queue row the owner did not ask for, and a crash mid-run leaves it in `processing`. The Step 2 acceptance check "no row left in `processing`" hints at the same problem.
Correction: with `--dry-run` the script never inserts and never claims. For a file path it works from the file content in memory (the hash lookup is a read). For `--pending --dry-run` it reads the queue rows without updating them. Add the assertion to the Import acceptance checks: `SELECT count(*), max(attempts) FROM import_sources` is identical before and after a dry run.

**8. `existingId` from the model is trusted without a plausibility check** — plan 6.6 step 2.1.
"Only if that id is in the index that was sent" still lets one wrong digit merge an entity into an unrelated one (aliases added, body addendum appended, relations attached). The source text is also able to steer this field, since it is the only model output that addresses existing rows directly.
Correction: honour `existingId` only when `normKey` of the incoming name or of one of its aliases equals a name/alias key of that entity. Otherwise ignore it, fall through to rule 2.2 and count it under `skipped` as "existingId rejected". Unit test for both branches.

**9. Alias-key matching merges across types** — plan 6.6 step 2.2 ("prefer the same type, then the lowest id").
Aliases copied from legacy data are ordinary words: `Weapons`, `Shields`, `Sensors`, `Propulsion`, `FTL`, `Kal`, `Triple`, `Blink`. A text that mentions a faction called "The Shields" or a location "Blink" is merged into the ship system or the crew member.
Correction: an automatic match needs either (a) name key = name key, any type, or (b) an alias key involved **and** equal type. An alias-only match with a different type becomes a create, reported in the plan output as "possible duplicate of <slug>".

**10. Three different body limits, and none on the merged result** — plan 6.4 (20,000 per chunk), 6.6 (addenda appended without limit), 9.3 (form: 50,000).
After a few imports an entity's body can exceed 50,000 characters; the edit form then rejects every save of that entry with a 400. Far beyond that, `to_tsvector` fails at 1 MB of vector and the write transaction aborts.
Correction: one constant `MAX_BODY_CHARS = 100_000` in `src/lib/data/types.ts`, used by the form schema and by `planImport` (an addendum that would exceed it is not appended and is reported as "body full, addendum skipped").

**11. The entry form only accepts string attribute values** — plan 9.3 task 1 versus 6.4 and `EntityAttributes = Record<string, string | number | boolean>`.
An imported entity with `{"age": 41, "hostile": true}` cannot be saved through the form unchanged; depending on the implementation it is rejected or silently turned into strings.
Correction: state the rule. Simplest: the import schema coerces numbers and booleans to strings (`String(v)`) so that attributes are always `Record<string, string>` everywhere, and `EntityAttributes` is narrowed to that. The legacy copy already produces strings only.

### Design system (plan section 7)

**16. The portrait layout flips to landscape when the keyboard opens on short phones** — plan 7.3 with `interactiveWidget: 'resizes-content'` in 7.4.
With `resizes-content` the layout viewport shrinks when the on-screen keyboard opens (Chrome on Android), and `orientation` is computed from that viewport. At 360×640 the visible area becomes roughly 360×320: `width < 1000 and orientation: landscape` → the **landscape** grid, whose two 3.5rem rails leave 248 px for six tiles plus the search box, while the user is typing in that search box. 390×844 escapes only because about 450 px remain. The mutual-exclusion proof in 7.3 is right (see the table below); the problem is which layout wins while typing.
Correction (keeps exclusivity and exhaustiveness, checked against the same ten viewports):

```scss
@mixin desktop   { @media (width >= 1000px) and (height >= 600px) { @content; } }
@mixin portrait  { @media (width < 600px), (600px <= width < 1000px) and (orientation: portrait) { @content; } }
@mixin landscape { @media (600px <= width < 1000px) and (orientation: landscape), (width >= 1000px) and (height < 600px) { @content; } }
```

A phone on its side is at least 640 px wide (360×640 rotated), so it still gets the landscape layout; anything narrower than 600 px is always portrait, keyboard or not. Add 360×320 and 390×450 to the Design workstream's size list and to V2.

### Workstreams (plan section 9)

**15. Two Step 2 checks cannot be run under the Step 2 rules** — plan 9.0 versus 9.2 A and 9.2 C.
- Auth: "Dev server started with `SESSION_SECRET` unset" needs a second dev server; 9.0 forbids starting one, and a second `next dev` in the same folder is refused anyway. Correction: replace it with a unit test of `getAuthConfig()`/`isLoggedIn()`/the login handler with the variables deleted from `process.env`; the live check stays in V3, where it already is.
- Import: its `/import` page cannot be looked at during Step 2. Foundation's `requirePageAuth` stub always redirects, and once Auth lands the page needs the password. Correction: say so — the Import agent verifies the page by rendering `UploadForm`/`ImportQueue` in a test with fixture data; the visual check of `/import` is a Step 3 task (it is styled there anyway).

**17. Ownership gaps and one soft overlap in Step 2** — plan 9.2. The globs themselves are disjoint (see the table at the end); these are the loose ends:
- `.env.local` and `.secrets/initial-password.txt` are written by Auth but are in nobody's ownership list. Add both to Auth.
- `src/styles/_tokens.scss` is created by Foundation with the 7.2 names and then "finalised" by Design while four other agents are using those names. Add the rule: in Step 2 token **names** are frozen; Design may change values and add tokens.
- Auth's clean-up uses `npm run verify:cleanup -- --throttle`; Foundation's task 7 must list that flag.
- `tests/repo-guards.test.ts` is run by Design but owned by nobody; a failing guard caused by another stream's file must be reported, not fixed (already implied by 9.0; say it for this file).
- Search deletes the legacy `POST /api/search` and the five legacy pages while `src/components/legacy/**` (unowned) still imports nothing from them; confirm in Foundation's task 10 that no file under `legacy/` imports from `src/app/**`, otherwise Search's deletion breaks the Step 2 gate.

### Verification, scope, sign-off (plan sections 10, 11)

**18. Items that should be put to the owner at the checkpoint rather than decided in the plan** — plan header "Deliberate deviations", 11.2.

| Item | Within the spec? | Needs owner sign-off? |
|---|---|---|
| IBM Plex Sans + IBM Plex Mono via `next/font/google` | Spec 5.5 asks for "a legible secondary font" via `next/font`; the family is the planner's choice. Two families instead of one is a small extension | **No** separate approval; mention it in the checkpoint summary (fonts are downloaded from Google at build time and self-hosted; no runtime request to Google) |
| `auth_throttle` table | Not in spec 5.1. Additive, and diagnosis H18 leaves throttle storage to the planner | **Yes, as part of the migration approval**: name it explicitly in the checkpoint text ("one extra table for login throttling"), since the owner approves the exact SQL |
| Removing `use-debounce` | Spec 5.8 (remove unused) and 5.3 (live suggestions optional) | **No** |
| `node:test` + `tsx` | `tsx` is the same class of small utility as `zod`/`sass` and is needed for the approved local scripts. A test runner is not named in the spec; `node:test` is built in | **Yes, lightweight**: it is diagnosis decision O4 and must appear in the checkpoint list with its default. No argument needed beyond "no new dependency" |
| Delete action (O7), `drizzle` schema with `__drizzle_migrations`, four SQL functions and one trigger | Additive | Covered by O7 and by the SQL approval; list the functions and the trigger in the checkpoint summary, not only the tables |

**19. Quiet scope reductions to state openly** — none of these is hidden deliberately, but each should be in the "deviations" list at the top of the plan:
- Typo tolerance covers names and aliases only (4.2 "Known limits"); spec 5.3 says "partial words and typos still match" without that restriction.
- The "star map" panel of spec 5.5 becomes a static location readout (`[O2]`); it is tagged as an owner decision but missing from the deviations list.
- Between Step 1 and Step 3 the site has no create/edit at all ("Writes are offline during refit"). Fine on a local branch; say it.
- Entry create/edit/delete, which is goal 3's main consumer, is built by the sequential Integration agent rather than by a Step 2 stream. That is allowed, but it is the largest single task outside Step 2 and has no unit-test list; add one (zod schema cases, `updateEntity` never changes slug/legacy columns, delete cascades relations).

**21. `restore.sql` is generated by hand-quoting in JavaScript and is never exercised** — plan 3.4 step 3.
This is the only recovery path for the legacy data. Bodies contain apostrophes and newlines.
Correction: let Postgres do the quoting in the same read-only transaction, e.g. `SELECT format('INSERT INTO public.ship_records (id, title, text) VALUES (%s, %L, %L);', id, title, text) FROM public.ship_records ORDER BY id` (and `OVERRIDING SYSTEM VALUE` for `crew_members`). Unit-test the generator against a fixture row containing `'`, `\`, a newline and `$$`.

---

## Nits

22. **Copy: `created_at` lies up to ~3 s in the future** (`now() + (tbl_ord * 1000000 + legacy_id) µs`). Subtract a constant so nothing is post-dated (Appendix A uses `now() - interval '5 seconds' + …`).
23. **Copy: the placeholder "Unknown" reaches the search vector at weight B** through the generated summary of subsystem 8 ("Current capability: Unknown."), against [B] M7. Appendix A drops the sentence when the value is `unknown`/`??`. It stays in `attributes` (weight D), which is unavoidable if attributes are verbatim.
24. **Copy assertion 3 (`slugBase` in TypeScript equals the SQL slug) fails for any future non-ASCII legacy title**: TypeScript strips diacritics after NFKD, SQL turns the letter into `-`. Either drop NFKD from `slugBase` for the comparison or compare only when the name is ASCII.
25. **Copy: `<base>-<legacy_id>` can in theory collide across tables** (crew 11 and record 11 with the same non-first base) or with a real title such as "Test13 19". The statement then fails cleanly on `entities_slug_uq`; the plan already says the script reports it. No change needed beyond mentioning the cross-table case.
26. **Crew rule `attributes ? 'crew_rank'`**: a legacy crew row with a NULL rank would lose the key through `jsonb_strip_nulls` and vanish from the crew list. No NULLs today. Safer rule: `legacy_table = <crew key> OR attributes ? 'crew_rank'`.
27. **Tuning the search function later** (3.1): `CREATE OR REPLACE` plus `UPDATE entities SET name = name` also fires the `updated_at` trigger on every row, and a change to `xaro_array_to_text` additionally needs `REINDEX INDEX entities_aliases_trgm_idx`. Put both in the README note.
28. **Dry run step 2.9** (`to_regclass('public.entities') IS NULL`, no `pg_trgm` row) is only valid before the first real migration; make it conditional on "there were unapplied migrations".
29. **`count(*) OVER ()`** gives no `total` when `page` is past the end (zero rows). Return `total` from the facet query instead.
30. **One- and two-character queries** match names by `starts_with` but not aliases (`ft` does not find Warp via `FTL`); the prefix tsquery covers it only for whole tokens of the alias. Acceptable; add to "Known limits".
31. **`InteractiveText` links** must build the href with `encodeURIComponent` (`X'aro`, `semi-organic`, `&`).
32. **`ts_headline` fragments can start inside an apostrophe word** ("aro is equipped with 2 rail cannons" for `X'aro is…`), because the parser splits at the apostrophe. Cosmetic; `MaxFragments=0` avoids it at the price of a single window.
33. **Ranking**: `who is the captain` puts "Triple Blink" (Vice Captain) above "Jagoda Migdal"; eval case 28 passes only because it accepts either position. Leave or tighten after tuning.
34. **Danger button**: `--c-blood-deep` `#8f1420` on `--c-hull` is 2.10:1, below the 3:1 the plan sets for control boundaries. Give the danger variant a `--c-blood` border (6.30:1).
35. **`z.number().finite()`** is deprecated in zod 4 (numbers are finite by default); moot if finding 11 is adopted.
36. **CLI child environment**: besides `ANTHROPIC_API_KEY`, also remove `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL`, `CLAUDE_CODE_USE_BEDROCK`, `CLAUDE_CODE_USE_VERTEX` so the call cannot leave the subscription path.
37. **Prompt delimiters** `<<<`/`>>>` are fixed strings that a source text can contain. Use a per-call random marker (`SOURCE-<16 hex>`). With no tools, zod validation and code-enforced merge rules the exposure is limited to wrong data, which findings 8 and 9 bound further.
38. **Stale-claim window**: 30 minutes, but one chunk can legitimately take 3 × 10 minutes plus waits. Update `started_at` after each chunk (heartbeat) or make the window 60 minutes.
39. **`nextProxyCookies(request, response)`** (5.10) is not an iron-session export I can confirm; the Auth agent must take the call form from the installed package's README (`getIronSession(request, response, options)` in a proxy).
40. **`Secure` cookie under `next start` on `http://localhost`** (V2 runs against a production build): Chrome and Firefox accept it for localhost, Safari and some HTTP clients do not. Tell verifiers to use the Chromium-based browser and a cookie jar that is sent explicitly.

---

## Check-by-check summary

### 1. Coverage

Every requirement of spec sections 2, 4, 5.1–5.8 and 8 has a task and an owner. Diagnosis C1–C6 and H1–H22 are each addressed; K1–K30 are honoured with these exceptions:

- **K13** — contradictory as written (finding 1).
- **K3** — honoured in intent, under-specified in mechanism (finding 5).
- **K1** — `studio` gap (finding 6).
- **K28** — one transaction per source and hash no-op are right; `--dry-run` is not write-free (finding 7).

Small coverage gaps: L5 asks to consider `noindex` on `/login` and `/import`; the plan only adds a robots disallow (add `robots: { index: false }` to those pages' metadata). Spec 5.3 detail page, 5.4 env list, 5.8 README/CLAUDE.md and section 8's drop SQL are all present.

### 2. Migration SQL

- No syntax errors; no reference to the legacy tables in 0000–0002; nothing non-additive (the only `ALTER TABLE` statements add foreign keys to new tables; `CREATE OR REPLACE FUNCTION` targets new `xaro_` names, and [B] confirms no user functions exist).
- Generated column: only immutable functions (`to_tsvector(regconfig, text)`, `jsonb_to_tsvector(regconfig, jsonb, jsonb)`, `setweight`, `regexp_matches`, `translate`, `string_agg`, `chr`, the wrapper around `array_to_string`); weights A–D valid. The wrapper functions are schema-qualified where they call each other, which matters for PG 17's restricted `search_path` during index maintenance.
- Indexes valid; partial unique index and `ON CONFLICT` predicate match.
- Enum plus check constraints are consistent with the zod limits, except the slug fallback (finding 2).
- `updated_at` trigger correct. Extension first, one transaction, clean failure on manual re-run.
- Legacy copy: mapping matches the real columns in [B] §3.3 (`details` included); deterministic, collision-free on the known duplicates; read-only towards the old tables; findings 2, 22–26.
- Backup/checksum SQL is valid; `REPEATABLE READ READ ONLY` is the right isolation; finding 21 on `restore.sql`.

### 3. Search SQL

Injection-safe (all values bound; the `to_tsquery` string is built from `[\p{L}\p{N}]` tokens only; `ts_headline` options are a constant parameter). Empty, one-character, punctuation-only and apostrophe queries behave as the plan says. `ts_headline` output is safe: control-character sentinels, stripped from the source first, rendered as React nodes. Findings 3, 4, 29–33.

### 4. Auth

Fail-closed table is sound; every mutating route, import upload and both deletes call `requireApiAuth`; cookie flags right; scrypt N=32768/r=8/p=1 with `maxmem` 64 MiB and `timingSafeEqual` right; DB-backed throttle works on serverless; `SameSite=Lax` plus `Origin`/`Sec-Fetch-Site` check plus JSON content type closes CSRF, including login and logout; `safeNextPath` closes the open redirect; password kept out of docs and git. Findings 12, 13, 14, 20, 39, 40.

### 5. Import

CLI invocation matches [C] §4.5 flag for flag (`-p --output-format json --tools "" --disallowedTools "mcp__*" --strict-mcp-config --disable-slash-commands --no-session-persistence --system-prompt`, prompt on stdin, temp `cwd`, `shell: false`, no `--bare`; success = exit 0 and `is_error === false` and zod). Merge rules cannot change slugs or overwrite existing attribute keys. Upload limits fit under Vercel's body limit. Findings 7–11, 36–38.

### 6. Design system — layout conditions

Plan conditions: desktop `W ≥ 1000 and H ≥ 600`; portrait `W < 1000 and H ≥ W`; landscape `(W < 1000 and W > H) or (W ≥ 1000 and H < 600)`.

| Viewport | Desktop | Portrait | Landscape | Result |
|---|---|---|---|---|
| 390×844 | – | yes | – | portrait |
| 844×390 | – | – | yes | landscape |
| 820×1180 | – | yes | – | portrait |
| 1024×768 | yes | – | – | desktop |
| 1366×650 | yes | – | – | desktop |
| 1440×900 | yes | – | – | desktop |
| 1920×1080 | yes | – | – | desktop |
| 932×430 | – | – | yes | landscape |
| 360×640 | – | yes | – | portrait |
| 2560×1440 | yes | – | – | desktop |

Exactly one layout for each; no viewport matches zero or two (also true for squares, `W = H < 1000` → portrait, and for `W ≥ 1000, H < 600` → landscape). With the correction of finding 16 the table is unchanged.

Contrast claims are correct. The search box has its own grid track in all three layouts and cannot cover `main`. The shell is in the root layout. Findings 16, 34.

### 7. Workstreams — ownership

| Path or glob | Step 2 owner | Overlap? |
|---|---|---|
| `package.json`, lockfile, `tsconfig.json`, `eslint.config.mjs`, `next.config.ts` | nobody (frozen) | none |
| `src/app/layout.tsx`, `globals.scss`, `page.tsx`, error/loading/not-found, `robots.ts`, `icon.svg` | Design | none |
| `src/styles/_tokens.scss`, `_mixins.scss`, `_index.scss` | Design | soft: all streams consume token names (finding 17) |
| `src/styles/_layout.scss`, `src/lib/layout.ts` | frozen | none |
| `src/components/ui/**`, `shell/**`, `src/lib/nav.ts` | Design | none (props frozen) |
| `src/lib/data/**`, `src/lib/db/**`, `src/lib/http.ts`, types | frozen | none; but see finding 1 for `types.ts` |
| `src/lib/auth/**`, `src/app/login/**`, `src/app/api/auth/**`, `src/components/auth/**`, `src/proxy.ts`, `scripts/set-password*` | Auth | none; `.env.local`, `.secrets/` unlisted |
| `src/lib/search/**`, `src/app/api/search/**`, `src/app/search/**`, `src/app/entry/[slug]/{page,not-found}.tsx`, five legacy route folders, `src/components/{search,entry}/**`, `scripts/search-eval.ts` | Search | none (`entry/new`, `entry/[slug]/edit`, `components/entry-form`, `lib/entries`, `api/entries` are Step 3) |
| `scripts/import.ts`, `src/lib/import/**`, `src/app/import/**`, `src/app/api/import/**`, `src/components/import/**`, `samples/**` | Import | none |
| `src/lib/weapon/**`, `src/components/weapon/**`, `src/app/kodning_weapon_creator/**` | Weapon | none; reads `src/assets/tendrils.webp` from Design (ordering handled in the plan) |
| `src/components/legacy/**` | nobody | must not import from `src/app/**` (finding 17) |
| `docs/overhaul/04-execution-log.md` | orchestrator | serialised |

The stubs are sufficient for each stream to compile alone. Ordering is sound (custom migration 0000 is generated before 0001, so its snapshot is the empty one). Acceptance checks are runnable commands except the two in finding 15.

### 8. Verification plan

V1–V5 are all covered, with the spec's three viewports plus four more. `verify:cleanup` deletes from `entity_relations`, `entities`, `import_sources` and `auth_throttle` only, never from the legacy tables, and is bracketed by a snapshot/compare of the new tables and by `db:verify-legacy`. Findings 7 (dry run before the sample import) and 14 (throttle test).

### 9. Scope and technology

See findings 18 and 19.

---

## Appendix A — corrected legacy copy statement (replaces plan 3.3; tested)

Changes against the plan: slug fallback uses `replace(type, '_', '-')` (finding 2); `created_at`/`updated_at` are not post-dated (22); a placeholder capability is left out of the generated summary (23). Everything else is unchanged. On the fixture it inserts 49 rows with the same 49 slugs, 0 on re-run, and a subsystem named `---` gets `ship-system-<id>` instead of aborting the statement.

```sql
WITH crew AS (
  SELECT c.id,
         nullif(nullif(btrim(c.first_name), ''), '??')     AS fn,
         nullif(nullif(btrim(c.last_name), ''), '??')      AS ln,
         nullif(nullif(btrim(c.crew_rank), ''), '??')      AS rnk,
         nullif(nullif(btrim(c.race), ''), '??')           AS race,
         nullif(nullif(btrim(c.composition), ''), '??')    AS comp,
         nullif(nullif(btrim(c.expertise), ''), '??')      AS expertise,
         jsonb_strip_nulls(jsonb_build_object(
           'first_name', c.first_name, 'last_name', c.last_name, 'crew_rank', c.crew_rank,
           'race', c.race, 'composition', c.composition,
           'current_status', c.current_status, 'expertise', c.expertise)) AS attributes
  FROM public.crew_members c
),
sub AS (
  SELECT s.id, s.details,
         nullif(btrim(s.current), '') AS cur,
         CASE WHEN nullif(btrim(s.type), '') IS NULL THEN NULL
              WHEN char_length(btrim(s.type)) <= 3 THEN upper(btrim(s.type))
              ELSE initcap(lower(btrim(s.type))) END AS cat,
         nullif(btrim(s.status), '') AS st,
         nullif(btrim(s.value), '')  AS val,
         jsonb_strip_nulls(jsonb_build_object(
           'type', s.type, 'status', s.status, 'current', s.current, 'value', s.value)) AS attributes
  FROM public.ship_subsystems s
),
sub_named AS (
  SELECT sub.*,
         coalesce(
           CASE WHEN sub.cur IS NULL OR lower(sub.cur) IN ('unknown', '??') THEN sub.cat ELSE sub.cur END,
           'Subsystem ' || sub.id) AS name
  FROM sub
),
src AS (
  -- crew_members -> character
  SELECT 'crew_members'::text AS legacy_table, crew.id AS legacy_id, 1 AS tbl_ord,
         'character'::public.entity_type AS type,
         coalesce(nullif(concat_ws(' ', crew.fn, crew.ln), ''), 'Crew member ' || crew.id) AS name,
         CASE WHEN crew.fn IS NOT NULL AND crew.ln IS NOT NULL
              THEN ARRAY[crew.fn, crew.ln] ELSE '{}'::text[] END AS aliases,
         concat_ws(' ',
           crew.rnk || '.',
           nullif(concat_ws(', ', crew.race, crew.comp), '') || '.',
           'Expertise: ' || crew.expertise || '.') AS summary,
         ''::text AS body,
         crew.attributes
  FROM crew
  UNION ALL
  -- ship_subsystems -> ship_system
  SELECT 'ship_subsystems', n.id, 2,
         'ship_system'::public.entity_type,
         n.name,
         CASE WHEN n.cat IS NULL OR lower(n.cat) = lower(n.name)
              THEN '{}'::text[] ELSE ARRAY[n.cat] END,
         concat_ws(' ',
           n.cat || ' system, ' || coalesce(n.st, 'status unknown') || '.',
           'Current capability: ' || CASE WHEN lower(n.val) IN ('unknown', '??') THEN NULL ELSE n.val END || '.'),
         coalesce(n.details, ''),
         n.attributes
  FROM sub_named n
  UNION ALL
  -- ship_records -> record                                    [O1] all rows
  SELECT 'ship_records', r.id, 3,
         'record'::public.entity_type,
         coalesce(nullif(btrim(r.title), ''), 'Record ' || r.id),
         '{}'::text[],
         ''::text,
         coalesce(r.text, ''),
         CASE WHEN r.title IS NOT DISTINCT FROM coalesce(nullif(btrim(r.title), ''), 'Record ' || r.id)
              THEN '{}'::jsonb
              ELSE jsonb_strip_nulls(jsonb_build_object('title', r.title)) END
  FROM public.ship_records r
),
slugged AS (
  SELECT s.*,
         coalesce(
           nullif(btrim(left(btrim(lower(regexp_replace(s.name, '[^A-Za-z0-9]+', '-', 'g')), '-'), 80), '-'), ''),
           replace(s.type::text, '_', '-') || '-' || s.legacy_id) AS base
  FROM src s
),
todo AS (
  SELECT g.* FROM slugged g
  WHERE NOT EXISTS (SELECT 1 FROM public.entities e
                    WHERE e.legacy_table = g.legacy_table AND e.legacy_id = g.legacy_id)
),
ranked AS (
  SELECT t.*,
         row_number() OVER (PARTITION BY t.base ORDER BY t.tbl_ord, t.legacy_id) AS rn,
         EXISTS (SELECT 1 FROM public.entities e WHERE e.slug = t.base) AS base_taken
  FROM todo t
),
final AS (
  SELECT r.*,
         CASE WHEN r.rn = 1 AND NOT r.base_taken AND r.base <> 'new'
              THEN r.base
              ELSE r.base || '-' || r.legacy_id END AS slug
  FROM ranked r
)
INSERT INTO public.entities
  (type, name, slug, aliases, summary, body, attributes, legacy_table, legacy_id, created_at, updated_at)
SELECT f.type, f.name, f.slug, f.aliases, f.summary, f.body, f.attributes, f.legacy_table, f.legacy_id,
       now() - interval '5 seconds' + (f.tbl_ord * 1000000 + f.legacy_id) * interval '1 microsecond',
       now() - interval '5 seconds' + (f.tbl_ord * 1000000 + f.legacy_id) * interval '1 microsecond'
FROM final f
ORDER BY f.tbl_ord, f.legacy_id
ON CONFLICT (legacy_table, legacy_id) WHERE legacy_table IS NOT NULL DO NOTHING
RETURNING id, legacy_table, legacy_id, type, name, slug;
```

## Appendix B — corrected search statement (replaces plan 4.2; tested)

Same parameters (`$1` q, `$2` folded, `$3` prefix, `$4` type or NULL, `$5` limit, `$6` offset, `$7` hlOptions), same columns, same scoring. The only change is the new `ids` CTE and the `FROM` of `cand` (finding 3). `$1` and `$2` are bound after the leading-minus clean-up of finding 4. The facet query uses the same `q`, `ids` and `cand` CTEs.

```sql
WITH q AS (
  SELECT
    $1::text AS raw,
    $2::text AS folded,
    (   websearch_to_tsquery('english'::regconfig, $1::text)
     || websearch_to_tsquery('simple'::regconfig,  $1::text)
     || websearch_to_tsquery('english'::regconfig, $2::text)
     || websearch_to_tsquery('simple'::regconfig,  $2::text) ) AS tsq,
    CASE WHEN $3::text <> '' THEN to_tsquery('simple'::regconfig, $3::text) END AS prefix_tsq
),
ids AS (
  SELECT e.id FROM public.entities e WHERE e.search_vector @@ (SELECT tsq FROM q)
  UNION
  SELECT e.id FROM public.entities e WHERE e.search_vector @@ (SELECT prefix_tsq FROM q)
  UNION
  SELECT e.id FROM public.entities e WHERE e.name % (SELECT raw FROM q)
  UNION
  SELECT e.id FROM public.entities e WHERE (SELECT raw FROM q) <% e.name
  UNION
  SELECT e.id FROM public.entities e WHERE (SELECT raw FROM q) <% public.xaro_array_to_text(e.aliases)
  UNION
  SELECT e.id FROM public.entities e WHERE char_length(e.name) >= 4 AND e.name <% (SELECT raw FROM q)
  UNION
  SELECT e.id FROM public.entities e WHERE starts_with(lower(e.name), lower((SELECT raw FROM q)))
),
cand AS (
  SELECT
    e.id, e.type, e.name, e.slug, e.summary, e.body,
    ts_rank_cd('{0.05, 0.2, 0.5, 1.0}'::float4[], e.search_vector, q.tsq, 32) AS fts,
    CASE WHEN q.prefix_tsq IS NULL THEN 0
         ELSE ts_rank_cd('{0.05, 0.2, 0.5, 1.0}'::float4[], e.search_vector, q.prefix_tsq, 32) END AS pfx,
    GREATEST(
      similarity(e.name, q.raw),
      word_similarity(q.raw, e.name),
      word_similarity(q.raw, public.xaro_array_to_text(e.aliases)),
      CASE WHEN char_length(e.name) >= 4 THEN word_similarity(e.name, q.raw) ELSE 0 END
    ) AS trgm,
    (   lower(e.name) = lower(q.raw)
     OR translate(lower(e.name), '''`' || chr(8217), '') = lower(q.folded)
     OR EXISTS (SELECT 1 FROM unnest(e.aliases) AS a WHERE lower(a) = lower(q.raw)) ) AS exact,
    starts_with(lower(e.name), lower(q.raw)) AS name_prefix
  FROM ids
  JOIN public.entities e ON e.id = ids.id
  CROSS JOIN q
),
scored AS (
  SELECT c.*,
         (  1.00 * c.fts
          + 0.50 * c.pfx
          + 0.90 * c.trgm
          + CASE WHEN c.exact THEN 1.50 ELSE 0 END
          + CASE WHEN c.name_prefix THEN 0.40 ELSE 0 END )::float8 AS score
  FROM cand c
),
filtered AS (
  SELECT s.*, count(*) OVER () AS total
  FROM scored s
  WHERE ($4::text IS NULL OR s.type = $4::public.entity_type)
),
page AS (
  SELECT * FROM filtered
  ORDER BY score DESC, name ASC, id ASC
  LIMIT $5 OFFSET $6
)
SELECT p.id, p.type, p.name, p.slug, p.summary, p.score, p.total::int AS total,
       ts_headline(
         'english'::regconfig,
         translate(CASE WHEN p.body <> '' THEN p.body ELSE p.summary END, chr(1) || chr(2), ''),
         CASE WHEN q.prefix_tsq IS NULL THEN q.tsq ELSE q.tsq || q.prefix_tsq END,
         $7::text
       ) AS snippet
FROM page p
CROSS JOIN q
ORDER BY p.score DESC, p.name ASC, p.id ASC;
```

Plan observed with `enable_seqscan = off`: bitmap index scans on `entities_search_vector_idx` (both tsqueries), `entities_name_trgm_idx` (`%` and `<%`) and `entities_aliases_trgm_idx`; the arms `e.name <% raw` and `starts_with(…)` remain scans. A prefix tsquery of NULL makes its arm return no rows.

## Appendix C — migration SQL

No correction to the three migration files of plan 3.2 is required; they applied unchanged on PostgreSQL 17.5. The changes this review asks for are in the copy statement (Appendix A), the search statement (Appendix B), the throttle statement (finding 13) and the tooling around the migrations (findings 5 and 6).
