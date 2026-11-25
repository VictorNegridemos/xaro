# Verification iteration 2 — R2-A (data, search and security re-check)

Verifier: `r2a`. HEAD `24cb1b9` ("fix: verification round 1 findings"), branch `overhaul`. Dev server at http://localhost:3000, restarted after the fixes. I confirmed it runs the new code before sending anything risky: `🚀 warp` returned Warp 3.81 first. Scratch scripts are in `scratchpad/r2a/`: `norm.mts`, `norm2.mts`, `db1.mts`, `api.mjs`, `o1.mts`, `thr.mts`.

I wrote no rows. One login attempt from a foreign Origin was made (X-Forwarded-For 198.51.100.81). It was rejected with 403 before the throttle is consulted (`login-handler.ts:33`). `auth_throttle` holds 0 rows for my bucket.

## Summary

**PASS 27, FAIL 0.** One observation (N1, not a failure): the prefix arm can still repeat a token. The repetition is bounded at 8 and was measured harmless.

## 1. F1 — repeated-word query (was a blocker)

### 1a. Code review of `searchTerms()` / `prepareSearch()` (`src/lib/search/query.ts:46-84, 114-124`)

- `$1`, `$2` and the prefix string are now all derived from `terms`. `terms` holds at most `MAX_QUERY_TERMS = 8` letter/digit runs, de-duplicated case-insensitively after apostrophe folding. The raw `q` reaches the database nowhere: the rank, facets and suggest queries all bind `terms`/`folded`/`prefix` (`query.ts:241-243`). `q` is only echoed in the response.
- A query with no word skips the database entirely (`query.ts:238`).
- `MAX_QUERY_CHARS` (400 `query_too_long`) still applies before this step.

Every input below was run through the project's own `prepareSearch` (`norm.mts`, `norm2.mts`). Each one prints the number of runs bound in `$1` and the number of prefix operands.

| Bypass attempt | Input | Bound `$1` (runs) | Verdict |
|---|---|---|---|
| repetition | `warp `×40; `x `×100; `x'`×99+`x` | `warp` (1); `x` (1); `x` (1) | PASS |
| mixed separators | `warp_warp/warp.warp,warp;warp:warp+warp` | `warp` (1) | PASS |
| hyphen variants | `warp--warp warp-‐warp warp‑warp warp–warp` | `warp` (1) | PASS |
| zero-width | `warp\u200B`×40 (no spaces); `wa\u200Drp …` | `warp` (1); 5 distinct fragments | PASS |
| full-width | `ｗａｒｐ warp ＷＡＲＰ` | `warp` (1), NFKC | PASS |
| apostrophes | `x'x x\`x x’x xx X'X` | `x` (1) | PASS |
| homoglyphs | `warp wаrp warр ԝarp` (Cyrillic/Komi) | 4 runs, which are distinct lexemes in PostgreSQL too | PASS (bounded) |
| digits | `1 2 … 9`; `01 1 001 0001 1.0 1,0` | 8 (capped); 5 | PASS |
| same lexeme, different words | `warps warp warping warped warpings warper warpers Warp's` | 7 runs. Each english arm stems to `'warp'`×5: 10 identical `'warp'` operands plus the prefix ops | PASS (bounded, see 1b) |
| variation selectors (\p{M}) | `warp\uFE00 … warp\uFE0B` | 8 runs, distinct in JS **and** in PostgreSQL (`'warp︀'` …). The prefix arm strips marks, so it becomes `'warp':*`×8 | bounded, see N1 |
| combining marks | `warp warṕ warp̂ …` (9 variants) | 8 runs, distinct lexemes. Prefix `'warp':*`×6 | bounded, see N1 |
| `x` + variation selectors (`x` was the 1 GiB term) | `x x︀ … x︇` | 8 runs. Prefix `'x':*`×8 | bounded |
| 8 long distinct words | 10 × 60 chars | 400 `query_too_long` (the 200-char limit applies first) | PASS |

**Worst-case `ts_headline` cost.** Each of the 4 `websearch_to_tsquery` arms gets at most 8 operands. The prefix arm gets at most 8 per form, and only one form when the folded form is identical. The total is at most 48 leaf operands; `numnode` was measured at 69–79 for the worst inputs above, including operators. The most identical operands any input reaches is about 16–20: the stemming case gives 10 `'warp'` plus prefix matches, and the variation-selector case gives 8 `'warp':*` plus 1 exact `'warp'`. Round 1 (v4) measured locally: `warp`×5 (about 25 identical operands) 36 ms, `warp`×20 (about 88) 54 ms. The blow-up only began around 168 (`warp`×40, 894 ms) and 408 (`x`×100, OOM). The cap therefore keeps every input well below the dangerous range, whatever the de-dup misses.

### 1b. Live requests (only the inputs proved bounded above; `api.mjs`, each followed by a plain `warp` probe)

| Query | HTTP | Time | Result | Next `warp` probe |
|---|---|---|---|---|
| `warp `×40 (the round-1 crash) | 200 | 83 ms | Warp 3.81, Warp drone matrix 2.37 | 200, 76 ms |
| `x `×100 (the local 1 GiB case) | 200 | 85 ms | 7 results (Olkor …) | 200 |
| `x'`×99 + `x` | 200 | 77 ms | 7 results | 200 |
| `warp\u200B`×40 | 200 | 91 ms | Warp first | 200 |
| plurals (stemming to one lexeme) | 200 | 81 ms | Warp | 200 |
| variation-selector variants (12 sent, 8 bound) | 200 | 90 ms | Warp drone matrix 1.26, Warp 1.24 | 200 |
| combining-mark variants | 200 | 89 ms | Warp | 200 |
| `x` + variation selectors | 200 | 79 ms | 7 results | 200 |
| `1 2 … 9` | 200 | 134 ms | 0 | 200 |

No 500 and no connection errors; every follow-up query succeeded. **PASS.**

### 1c. `statement_timeout` on the app client

- Code: `src/lib/db/client.ts:27-33` passes `connection: { statement_timeout: 5000 }` to `postgres()`.
- Check: `db1.mts` calls the project's own `getDb()`. `SHOW statement_timeout` returned `5s`. A single `SELECT pg_sleep(5.5)` was cancelled after 5034 ms with `57014 canceling statement due to statement timeout`. **PASS.**
- The running dev server's own connection cannot be inspected from outside. It was restarted after the commit and the new search code is active (F3 behaviour), so it uses the same factory.

### N1 (observation, not a failure)

`prefixTokens()` (`query.ts:86-90`) matches `[\p{L}\p{N}]+` and ignores `\p{M}`, while `searchTerms()` de-duplicates on runs that include `\p{M}`. Runs that differ only by a combining mark or a variation selector therefore produce repeated prefix operands: `'warp':* & 'warp':*` ×8. The count is still capped at 8 per form, and this was measured at 90 ms.

Optional hardening: de-duplicate inside `prefixTokens` (`[...new Set(tokens)]`), or strip `\p{M}` before computing the run key.

## 2. F3 — noise tokens

| Query | Top results | Verdict |
|---|---|---|
| `🚀 warp` | Warp 3.81, Warp drone matrix 2.37 (round 1: matrix 1.97 above Warp 1.91) | PASS |
| `warp warp` | Warp 3.81, Warp drone matrix 2.37 | PASS |
| `WARP!` | same | PASS |
| `warp?` | same | PASS |
| `Warp WARP warp-warp wArP` | same | PASS |

Known limitation, not a failure: the variation-selector variant ranks Warp drone matrix (1.26) just above Warp (1.24), because the bound words are not `warp` itself.

## 3. F2 + O1 — exclusions and data

| Check | Command | Actual | Verdict |
|---|---|---|---|
| Entity counts | `o1.mts` (read-only transaction) | 24 total: character 6, ship_system 8, record 10. Per legacy table: crew 6/6 distinct, subsystems 8/8, records 10/10 | PASS |
| 25 excluded record ids have no entity | LEFT JOIN of the records table with entities | all 25 (2–9, 11, 12, 14–23, 26, 27, 29, 34, 35) have 0 copies | PASS |
| 10 kept ids have exactly one | same | 1, 10, 13, 24, 25, 28, 30, 31, 32, 33: 1 copy each; problems `[]` | PASS |
| `npm run db:copy-legacy -- --dry-run` | — | "0 inserted (crew_members 0, ship_subsystems 0, ship_records 0)", "excluded under O1 (never copied): ship_records 25 ids", "DRY RUN — rolled back" | PASS |
| `npm run db:verify-legacy` | — | 6/8/35, md5 `449aea455cfa5dc63630b6900da10602` / `44efa0e3c840e42c0481f7b115100c3a` / `bb8110bd90477e95bd1f8f855fa8cb57` unchanged; "OK — no differences" | PASS |
| `-- --coverage` | — | "0 rows without the expected number of copies — OK"; excluded: records 25 | PASS |
| `-- --drift` | — | 6/8/35 rows = copy log; "No drift." | PASS |
| `/ship_record/2` (excluded), `/ship_record/1` (kept) | curl | 404; 308 → `/entry/ereshkigal` | PASS |
| Exclusion injection robustness | review of `scripts/lib/copy-legacy.ts:93-110` and `scripts/lib/legacy-checks.test.ts:20-40` | see the list below the table | PASS |
| Repo guard (legacy names only in `legacy-keys.ts`) | `tests/repo-guards.test.ts` within `npm test`; grep over `src` | passes; only `src/lib/data/legacy-keys.ts` names the tables | PASS |

How the exclusion injection holds up:

- The anchor regex must match exactly one `FROM public.<records> <alias>` line, or the copy throws. It cannot be disabled silently: a changed alias still matches through `\w+`, while a trailing comment, a renamed table or a second occurrence throws "Expected exactly one …".
- A test on the real `copy-legacy.sql` asserts exactly one filter line and that removing it restores the file byte for byte. That test fails if the anchor line disappears.
- If a later edit put a `WHERE` or `JOIN` right after the anchor, the injected `WHERE` would make the SQL fail loudly; it would not change behaviour silently.
- Second line of defence: the runtime assertion "No excluded row was inserted" (`copy-legacy.ts:146-150`). The count assertion also leaves the excluded rows out.

Note: `backups/copy-log.json` still lists 35 records entries, including the 25 deleted copies. `--drift` handles this correctly: those ids are reported only as "(info)" if they ever change. Informational.

## 4. Search eval and ranking regression

- `npm run search:eval`: **37 passed, 0 failed, 0 skipped**, including new cases 35–38. PASS.
- 24 own queries over `GET /api/search`, compared with the round-1 table in `05-verification-1-v4.md` §5.2. All returned HTTP 200 in 74–147 ms.

| Query | Result now | vs round 1 |
|---|---|---|
| `K82ACA` | K82ACA 3.80, Lena, Yaraslav | same |
| `olkor` | Olkor | same |
| `Migdal` | Jagoda Migdal | same |
| `propulsion` | Fusion drive = Thrusters 3.37 | same |
| `alpha temp` | Alpha tempora monolayer | same |
| `jag mig` | Jagoda Migdal | same |
| `Ereshkiagl` | Ereshkigal | same |
| `Htelekmary` | Ir'Htelekmari first | same |
| `warp drone matrix` | Warp drone matrix 4.00, then Warp | same |
| `energy reserves` | the 5 systems | same |
| `X'aro` | 7 results, Olkor first | same |
| `Kal O'Dun` | Kal O'Dun 4.13 | same |
| `Kal O’Dun` (U+2019) | Kal O'Dun 3.73 | same |
| `ir'htel` | Ir'Htelekmari first | same |
| `RAIL CANNON` | Rail cannon | same |
| `the joy` | The Joy Eater | same |
| `warp\u0000core` | Warp, Core | same |
| `warp & !cannon \| (core` | Core, Warp, Rail cannon | same |
| `Ярослав` | 0 | same |
| 15-word natural-language query | Rail cannon | same |
| `"queen of lies"` | Ereshkigal (0.09) | still top. Quotes no longer form a phrase (documented side effect); the score is low but the ranking is correct |
| `warp or cannon` | Warp, Rail cannon, Warp drone matrix | same |
| `1` | Inertia wave emitter … (7) | changed: round 1's top hit "new test 1" was deleted under O1. Expected |
| `' OR 1=1 --` | 4 results via token `1` (round 1: Thrusters only) | harmless difference: the noise words are dropped. No error, no injection |
| `organic`+character / `energy`+ship_system / `test`+record | 6 / 5 / 0 | `test`+record was 19 before; those 19 test records were deleted under O1. Expected |
| `%`; `🚀🚀`+record; browse `type=record` | 0 / 0 / 10 records | PASS |

No regression found. PASS.

## 5. Security spot-check (unauthenticated, curl)

- Same-origin `Origin: http://localhost:3000`:
  - `POST /api/entries`: 401
  - `PUT /api/entries/1`: 401
  - `DELETE /api/entries/1`: 401
  - `POST /api/import`: 401
  - `DELETE /api/import/1`: 401
- The same five requests with `Origin: http://evil.example`: 403 each.
- Methods that are not routed return 405 (`POST /api/entries/1`, `PUT /api/import/1`, `PATCH *`, …).
- `POST /api/entries` without an Origin header: 403.
- Login from a foreign Origin: 403.
- `/import`, `/entry/new`, `/entry/warp/edit`, `/import/1`: 307 → `/login?next=…`.

All PASS.

## 6. Gate (D:\React\xaro)

| Command | Result |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm test` | exit 0: 278 tests, 278 pass, 0 fail (repo guards and the legacy-checks tests included) |

All PASS. `next build` was not run, as instructed.

## Clean-up

No rows were written to any table. `auth_throttle` shows 0 rows matching my X-Forwarded-For. Legacy tables and checksums are unchanged.
