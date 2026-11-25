# 05 — Verification, iteration 1, V4 (data and search quality)

Verifier: V4, independent. Branch `overhaul` at `0650406`. Date 2026-11-24.
Scratch scripts and raw outputs: `C:\Users\nkara\AppData\Local\Temp\claude\d99098be4306fc80\2ba05b36-9dcf-4842-a31f-141d6e8b8940\scratchpad\v4\`.
Every database read ran inside a `READ ONLY` transaction (`lib.cjs` `ro()`), except the steps listed under "Writes".

## Summary

| Result | Count |
|---|---|
| PASS | 27 |
| FAIL | 3 (1 blocker, 1 major, 1 minor) |
| Not run | 1 (`drizzle-kit push/studio/migrate`: the common brief forbids running them) |

| # | Severity | Finding | Where |
|---|---|---|---|
| F1 | **blocker** | One public `GET /api/search` request (or `/search?q=`) with a repeated word, e.g. `"warp "×40` (199 chars), breaks the production database connection. During the next ~5 s every other query fails with `CONNECTION_CLOSED` / "Failed to connect to upstream database". This is an unauthenticated denial of service against the live database | `src/lib/search/sql.ts:13-16, 77` (statement of plan 4.2), `src/lib/search/query.ts` (`normalizeQuery`/`prepareSearch`) |
| F2 | major | The O1 clean-up (plan 3.3 option A) and the documented post-deploy step `npm run db:copy-legacy` work against each other. The copy inserts every legacy row that has no copy, so the first copy run after the O1 delete re-creates all 25 deleted test records. `db:verify-legacy -- --coverage` then also reports those 25 ids as missing | `scripts/db-copy-legacy.ts`, `scripts/sql/copy-legacy.sql`, `README.md:132`, plan 11.2 action 8 |
| F3 | minor | Ranking: one extra token stops the exact-name bonus from applying. `🚀 warp` and `warp warp …` rank "Warp drone matrix" above "Warp" | `src/lib/search/sql.ts` score expression (exact / name_prefix compare the whole raw string) |

## 1. Legacy tables, checksums, drift

| Check | Command / steps | Actual result | Verdict |
|---|---|---|---|
| Tables still exist | `pg_class` lookup (`v4/legacy.cjs`) | `crew_members`, `ship_records`, `ship_subsystems` present (relkind r) | PASS |
| Row counts | investigation checksum SQL (`agent-b/checksum.sql`; identical to `scripts/sql/checksums.sql` except for the trailing `;`) | 6 / 8 / 35 | PASS |
| Checksums vs. investigation | same SQL, `standard_conforming_strings = on` | crew `449aea455cfa5dc63630b6900da10602`, subsystems `44efa0e3c840e42c0481f7b115100c3a`, records `bb8110bd90477e95bd1f8f855fa8cb57`: **all equal** | PASS |
| vs. backup `backups/20261124T002021Z` (LATEST) | table md5, per-row md5 of every row, and a byte comparison of the three JSON exports with `SELECT * … ORDER BY id` | all equal; JSON exports identical to the live rows | PASS |
| `npm run db:verify-legacy` | — | "OK — no differences" | PASS |
| `npm run db:verify-legacy -- --drift` | — | 6/8/35 rows now = 6/8/35 in copy-log; "No drift." | PASS |

Drift: none. The old site is still deployed and its write routes are unauthenticated, so `ship_records` (and the other two tables) can change at any time. Any later mismatch is not, by itself, a sign of overhaul damage. `--drift` and the per-row hashes would show which rows changed. At the time of this check, nothing had changed since the investigation snapshot of 2026-11-23.

## 2. Copy completeness and mapping

| Check | Command / steps | Actual result | Verdict |
|---|---|---|---|
| `copy-legacy.sql` = plan 3.3 | `diff` of plan lines 707–813 against the file (CR stripped) | identical | PASS |
| Coverage | `npm run db:verify-legacy -- --coverage`; my own `GROUP BY legacy_table, legacy_id HAVING count(*) <> 1` | "0 rows without exactly one copy"; 0 duplicates; per table crew_members 6, ship_subsystems 8, ship_records 35 = 49 | PASS |
| Column mapping: **all 49 rows** (more than the requested spot check) | `v4/mapping.cjs`: my own JS implementation of the plan 3.3 rules (name, aliases, summary, body, attributes, slug, type, `source_id` null), compared with `entities` | 392 field comparisons, **0 mismatches**. Checked by eye: `Kik` (aliases `{}`, `last_name: "??"` kept), `Ir'Htelekmari` (summary "Privileged crew. semi-organic. …", race `??` dropped from the summary and kept in attributes), `Core` (no capability sentence, `value: "Unknown"` kept), `Warp drone matrix` (`current` keeps its trailing space), records 1, 13, 19, 25, 35 (body verbatim, attributes `{}`) | PASS |
| Attributes verbatim | inside the same comparison | all seven crew keys and four subsystem keys verbatim; records `{}` (no title changes when trimmed) | PASS |
| Slugs | the plan's 49-slug list compared position by position; regex/length check over all entities | equal to the plan list; 49 distinct; 0 invalid | PASS |
| Order and dates | `ORDER BY created_at, id` | reproduces crew, then subsystems, then records, each in legacy id order; `updated_at = created_at` on all 49, so no legacy copy has been edited since the copy | PASS |
| Re-run is a no-op | plan 3.3/3.6 document the copy as idempotent (`ON CONFLICT DO NOTHING`, refuses when the legacy checksums differ from LATEST). `npm run db:copy-legacy -- --dry-run`, then `npm run db:copy-legacy` (run twice) | before 6/8/35; each run "0 inserted (crew_members 0, ship_subsystems 0, ship_records 0)"; after 6/8/35; `backups/copy-log.json` byte-identical before and after; checksums unchanged before and after | PASS |

## 3. No application code touches the legacy tables

| Check | Result | Verdict |
|---|---|---|
| `git grep -nE "crew_members\|ship_subsystems\|ship_records" -- src ":!src/lib/data/legacy-keys.ts"` (plus `grep -r` on the working tree, untracked files included) | no match | PASS |
| `git grep -niE "(from\|join\|into\|update\|table)\s+…legacy names" -- src` | no match; `legacy-keys.ts` holds the three names once each as string constants, used only as bound values for `entities.legacy_table` | PASS |
| `scripts/` hits | only `db-backup.test.ts`, `db-verify-legacy.ts`, `lib/legacy.ts`, `lib/migration-guard.ts` (the guard regex), `sql/checksums.sql`, `sql/copy-legacy.sql`: all read-only (SELECT) | PASS |
| `git grep … -- drizzle` | no match | PASS |

## 4. Schema (catalog queries, `v4/schema.cjs`)

| Check | Actual result | Verdict |
|---|---|---|
| Extension | `pg_trgm` 1.6 in `public` (`unaccent` not installed, as planned) | PASS |
| Functions | `xaro_array_to_text`, `xaro_fold_apostrophes`, `xaro_entity_search_vector`: language sql, IMMUTABLE, PARALLEL SAFE, bodies text-identical to plan 3.2. `xaro_set_updated_at`: plpgsql, body identical | PASS |
| Types | `entity_type` (10 labels in plan order), `import_status` (4) | PASS |
| Tables, columns, defaults, identity, generated `search_vector` expression | as plan 3.2 for all four tables | PASS |
| Constraints | all CHECK / UNIQUE / FK constraints of plan 3.2 present with the same definitions and ON DELETE actions | PASS |
| Indexes | the 10 created indexes + 4 primary keys + `import_sources_content_hash_unique`. Definitions equal to plan 3.2, including `entities_aliases_trgm_idx` on `xaro_array_to_text(aliases) gin_trgm_ops` and the partial `entities_legacy_uq` | PASS |
| Trigger | `entities_set_updated_at BEFORE UPDATE … FOR EACH ROW EXECUTE FUNCTION xaro_set_updated_at()`; no trigger on the legacy tables | PASS |
| Bookkeeping | `drizzle.__drizzle_migrations` 3 rows. The legacy tables keep only their original indexes (`*_pkey`, `full_name`, `searchable_column`) | PASS |
| GIN index use (`v4/explain.cjs`) | EXPLAIN of `scripts/sql/search-smoke.sql` (= plan 4.2 verbatim, checked by diff) for `xaro`, `Kal O'Dun`, `Ereshkigl`. Default settings: sequential scans, plus a bitmap scan on `entities_aliases_trgm_idx`. `SET LOCAL enable_seqscan = off`: 0 sequential scans, with bitmap index scans on `entities_search_vector_idx` (both tsquery arms), `entities_name_trgm_idx` (`%`, `<%`) and `entities_aliases_trgm_idx`. The two arms with no index support (`name <% raw`, `starts_with`) use a pkey index scan with a filter, as plan 4.2 says | PASS |

## 5. Search quality

### 5.1 `npm run search:eval`

**34 passed, 0 failed, 0 skipped** (full output `v4/eval.txt`). PASS.

### 5.2 Additional queries over `GET http://localhost:3000/api/search` (59 queries; `v4/http-search.mjs`, outputs `http-search*.txt`)

The results were checked against the real data (dump of all 49 entries in `v4/entities.json`).

| Query | Kind | Top results | Judgement |
|---|---|---|---|
| `K82ACA` | exact | K82ACA (3.8), then Lena, Yaraslav (their bodies name K82ACA) | good |
| `olkor` | exact, lower case | Olkor | good |
| `Migdal` | alias (last name) | Jagoda Migdal | good |
| `propulsion` / `shields` | category alias | Fusion drive + Thrusters (tie) / Alpha tempora monolayer | good |
| `inert`, `alpha temp`, `jag mig` | partial | Inertia wave emitter / Alpha tempora monolayer / Jagoda Migdal | good |
| `Ereshkiagl`, `Chak Marrak`, `Htelekmary` | typos | Ereshkigal / Chak Marak / Ir'Htelekmari top | good |
| `warp drone matrix`, `energy reserves` | multi-word | Warp drone matrix then Warp / the 5 systems whose body says "energy reserves" | good |
| `X'aro` | apostrophe, body-only | 7 results (Olkor, K82ACA, Alpha tempora monolayer, Inertia wave emitter, Lena, …) | acceptable (nothing is named X'aro) |
| `Kal O'Dun`, `Kal O’Dun` (U+2019), ``Ir`Htelekmari``, `ir'htel` | apostrophe variants | the right character on top in every case | good |
| `organic`+`type=character`, `energy`+`type=ship_system`, `test`+`type=record` | type filter | 6 characters / 5 systems / 19 test records; facets also count other types | good |
| `RAIL CANNON`, `eReShKiGaL` | case | Rail cannon / Ereshkigal | good |
| `!!!???...`, `'`, `%`, `_` | punctuation only | 0 results, 200 | good |
| `k`, `1` | single character | Kal O'Dun, Kik, K82ACA / "new test 1" first | good |
| 201 × `w` | too long | 400 `query_too_long` | good |
| `tell me everything about the rail cannon and how far it can shoot please` | long natural | Rail cannon | good |
| `-warp`, `-warp -cannon`, `cannon -rail`, `--` | negation | minus dropped (same as `warp`; `warp cannon`; `cannon rail`); `--` is an empty query | as designed (plan 4.1) |
| `' OR 1=1 --`, `'; DROP TABLE entities; --`, `warp & !cannon \| (core` | SQL-ish / tsquery syntax | 200, no error, no injection (Thrusters at 0.02 through the token `1`; 0 results; Core, Warp, Rail cannon) | good |
| `"queen of lies"`, `warp or cannon` | websearch syntax | Ereshkigal / Warp, Rail cannon, Warp drone matrix | good |
| `Éreshkigal`, `ｗａｒｐ` (full-width), `Ярослав` | unicode | Ereshkigal (trigram) / NFKC → `warp`, same result / 0 results | good (no transliteration, as documented) |
| `warp\u0000core`, `rail\ncannon` | control characters | normalised to `warpcore` (Warp, Core) / `rail cannon` | good |
| `the`, `the joy` | stop words | The Joy Eater | good |
| `ship-system` type, page 0 / 51 / abc, empty, whitespace | bad input | 400 `invalid_type` / 400 `invalid_page` ×3 / empty 200 / empty 200 | good |
| `🚀 warp` | noise token | **Warp drone matrix 1.97 above Warp 1.91** | F3 (minor) |
| `warp ` × 40 (199 chars) | repeated word | **HTTP 500 `search_failed` after ~1.7 s; the following queries also fail** | **F1 (blocker)** |

### F1 — repeated-word query breaks the production database connection (blocker)

**Reproduction.** I ran the query list three times. In each run the 200-character case `"warp "×40` returned 500 after 1.2–1.8 s. Every query in the next ~5 s also returned 500: 7 queries in run 1, 25 in run 2, 9 in run 3. The same list without that one case gave 0 errors. Calling `search()` directly (tsx, `v4/direct.mts`) showed the cause. The first error was `write CONNECTION_CLOSED db.prisma.io:5432`. The next queries got "Failed to connect to upstream database. Please contact Prisma support if the problem persists.", and then the database recovered.

**Root cause.** I reproduced it safely on a local PostgreSQL 17.5 loaded with the migrations and the 49 entities (`v4/local-*.cjs`; the server was stopped and deleted afterwards):
- `ts_headline` with the large tsquery (`q.tsq || q.prefix_tsq`, 4 × `websearch_to_tsquery` of every word, repeats included) grows combinatorially when a query word is repeated and occurs in the document.
- `x`×100 (199 chars; `x` occurs in bodies through "X'aro") makes `search()` fail locally with `XX000 invalid memory alloc request size 1073741824`. That is a 1 GiB allocation request.
- Isolated, `ts_headline` alone fails; `websearch_to_tsquery`, `@@`, `ts_rank_cd` and the trigram functions stay under 250 ms.
- Local time for `warp`×N: 5 words → 36 ms, 20 → 54 ms, 40 → 894 ms.
- 30 *distinct* words (200 chars) take 7 ms, so repetition is the trigger.
- On the Prisma Postgres host the backend apparently runs out of memory and is killed, which drops the connections for a few seconds.

Anyone can trigger this without logging in, from the search box or `GET /api/search`. It affects the live old site too, because it uses the same database.

**Suggested fix.**
1. In `prepareSearch`, de-duplicate words, case-insensitively, before binding `$1`/`$2`, and cap them at about 8–10 distinct words, as is already done for `prefix`. The statement text of plan 4.2 stays unchanged.
2. Additionally, give `ts_headline` a smaller query (for example only `prefix_tsq`, or the de-duplicated tsquery).
3. Set a `statement_timeout` (for example 3 s) on the app's `postgres()` client in `src/lib/db/client.ts`.
4. Add an eval/unit case for `"x "×100` and `"warp "×40`.

**Side effect of this verification.** By running the suite I triggered the outage about 4 times, around 15:45–15:48 UTC. Other verifiers may have seen transient 500s or connection errors in that window. I then stopped sending the query. The database is healthy now: every later query and script succeeded.

### F3 — ranking with a noise token (minor)

`🚀 warp`, and `warp` repeated, put Warp drone matrix above Warp. The `exact` and `name_prefix` bonuses compare the whole raw query, so one extra token removes the 1.5 + 0.4 bonus from the exact name. Suggested fix: compute `exact`/`name_prefix` from the cleaned token string, i.e. letters and digits only, de-duplicated. This can be done together with F1.

Other observations (not failures):
- `warp`+`type=record` returns 0 results with the suggestions "Warp, Warp drone matrix", which are ship systems outside the active filter. This is the behaviour plan 4.2 specifies.
- `test` returns 19 junk records, `alex` 3 identical ones and `siuu` 2. That is data, handled by O1 (section 7).

## 6. Import (stub mode; the real Claude CLI is **not installed**)

`which claude`: not found; `CLAUDE_BIN` unset. Nothing was installed. **The import was not verified end to end with the real CLI.**

File: `v4/zz-verify-v4-sample-log.txt`, a byte-identical copy of `samples/sample-log.txt` (sha256 prefix `3ba83b27f937`). Stub: `IMPORT_STUB_FILE=samples/sample-extraction.stub.json` (plan 6.2). State snapshots: `v4/state-0.txt` … `state-5.txt`.

| Step | Actual result | Verdict |
|---|---|---|
| Before | `import_sources` 0 rows, max(attempts) null; entities 49; relations 0; md5 of the 49 legacy entity rows (all columns) `bfd5145b236ca9e0755bae56234c8c68`; legacy tables 6/8/35 with the md5 values above | — |
| `npm run import -- <file> --dry-run` | "STUB MODE — Claude was not called", "DRY RUN — nothing is written", plan created 9 · updated 0 · relations 8 · skipped 1 (the deliberate "Unknown Foundry"), **no "possible duplicate"**. After: every count, max(attempts) and md5 identical; no row with the file name | PASS |
| Real stub import | source #35, `done`, origin `cli`, `result.stub = true`; created 9 (Dr. Halvard Quist [character, aliases "the Archivist", "Halvard Quist"], Sergeant Odalys Brann, Meridian Salvage Combine [faction], Kessler Drift [location], Lattice core [technology], Pale Chorus [creature], Quist's recorder [item], Kessler blackout [event], Ymir-9 [other]); summaries sensible; attributes are strings (`"hostile":"true"`, `"crew":"14"`); 8 relations (member of, located in, created by, owns). `GET /api/search?q=Halvard`: Dr. Halvard Quist first; `/entry/dr-halvard-quist` shows `zz-verify-v4-sample-log.txt` | PASS |
| Re-import without `--force` | "already imported (source #35) — nothing to do"; counts unchanged | PASS |
| Re-import with `--force` | claims again (attempts 2): created 0 · updated 0 · relations 0 · skipped 10 ("no new information"); the 9 entities are byte-identical (md5 `70d2877f…` before and after, `updated_at` unchanged); relations still 8 | PASS (note: `import_sources.result` is overwritten by the forced run, so the queue now shows "created 0" for a source that created 9 entries. Not a plan violation; could confuse the owner) |
| Legacy entities untouched | md5 of the 49 legacy entity rows `bfd5145b…` before, after the dry run, after the import, after `--force` and after the clean-up; legacy-table checksums unchanged | PASS |
| Clean-up | `npm run verify:cleanup` was **not** used. It deletes every `zz-verify-%` source and every `ZZ-VERIFY` entity, including other verifiers' rows that may be in use right now, and empties `auth_throttle`, which would break V3's throttle test. Instead, a targeted transaction (`v4/cleanup.cjs`) deleted only rows whose `source_id` is my source (#35), and that source: relations 8, entities 9 (`legacy_table IS NULL` guard), import_sources 1 | PASS |
| Counts back | `import_sources` 0, entities 49, relations 0, legacy md5 unchanged; `npm run verify:cleanup -- --compare` (read-only): entities 49 `32adae1b…` and relations 0 equal to `verify-20261124T153230Z.json`; `npm run db:verify-legacy`: no differences | PASS |

## 7. O1 — test and duplicate entries to delete from `entities` (NOT done by me)

Plan 13 (owner: option A, after V4 passes) with diagnosis O1 and the reviewed statement in plan 3.3. Delete `entities WHERE legacy_table = 'ship_records' AND legacy_id IN (…)` for these **25** rows; never touch `ship_records`:

| legacy_id | slug | | legacy_id | slug |
|---|---|---|---|---|
| 2 | `test-title` | | 18 | `test13` |
| 3 | `test-2` | | 19 | `test13-19` |
| 4 | `test-3` | | 20 | `test14` |
| 5 | `test-4-title` | | 21 | `test16` |
| 6 | `test-5` | | 22 | `test15` |
| 7 | `test-6` | | 23 | `test17` |
| 8 | `test-7` | | 26 | `create-title-3` |
| 9 | `test-8` | | 27 | `create-title-11` |
| 11 | `alex-is-an-intergalactic-horror-11` (duplicate) | | 29 | `test-after-deployment` |
| 12 | `alex-is-an-intergalactic-horror-12` (duplicate) | | 34 | `siuu` |
| 14 | `new-test-1` | | 35 | `siuu-35` |
| 15 | `test10` | | | |
| 16 | `test11` | | | |
| 17 | `test12` | | | |

Kept: 1 Ereshkigal, 10 Alex is an intergalactic horror, 13 Strong cat, 24 Interspace deathgoop, 25 K82ACA, 28 The Joy Eater, 30 Lena, 31 Yaraslav, 32 Napones, 33 Olkor.

After the delete:
- remove eval case 27 (`test13`) per plan 4.4;
- `/ship_record/<deleted id>` becomes 404;
- `db:verify-legacy -- --coverage` reports these 25 ids.

### F2 — the copy re-creates the O1-deleted rows (major)

`copy-legacy.sql` inserts every legacy row whose `(legacy_table, legacy_id)` is absent (`todo` CTE). The README (`README.md:132`) and plan 11.2 action 8 tell the owner to run `npm run db:copy-legacy` right after the deploy "to pick up records added on the old site". If the O1 delete is done before that (the orchestrator plans to do it after V4), this step inserts the 25 test records again under the same slugs. `--coverage` cannot tell "deliberately removed" from "missing".

Suggested fix, without changing the approved SQL statement:
- record the deleted ids in a committed exclusion file (for example `scripts/sql/o1-excluded.json`);
- have `db-copy-legacy.ts` delete any re-inserted excluded ids inside the same transaction, or refuse to run;
- have `--coverage`/`--drift` treat those ids as expected-absent;
- document the order in the README.

Alternatively, do the O1 delete only after the owner's post-deploy copy, and say so in the final report.

## 8. Not run

- `npx drizzle-kit push / studio / migrate` (plan 10.2 V4 row): not run, because the common brief forbids these commands. Static check: `drizzle.config.ts` allows only `generate` and `check` and throws for everything else; it has no credentials. The execution log reports the three commands failing with the "disabled" error; I did not re-test this.

## Writes performed by V4 (all removed)

- `npm run db:copy-legacy` ×2 (real runs, each inserted 0 rows; `copy-log.json` unchanged).
- One stub import of `zz-verify-v4-sample-log.txt` (source #35, 9 entities, 8 relations) and one `--force` re-run; all removed by `v4/cleanup.cjs`. Proof: `import_sources` 0, entities 49, relations 0; `verify:cleanup -- --compare` equal to the snapshot.
- No login, so no `auth_throttle` rows. No writes to the legacy tables. No files in the project other than this report.
