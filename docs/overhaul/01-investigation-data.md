# 01 — Investigation B: data layer and live database

Scope: `src/db.js`, `src/app/api/*/route.js`, every caller of the db functions, and the live Postgres database.
Method: code reading plus **read-only** catalog/SELECT queries, every one executed inside `BEGIN READ ONLY` (`SHOW transaction_read_only` returned `on`). Nothing was written, no extension was created.
Snapshot time of all live figures: **2026-11-23 ~09:50 UTC**.

Helper scripts (outside the project):
`C:\Users\nkara\AppData\Local\Temp\claude\d99098be4306fc80\2ba05b36-9dcf-4842-a31f-141d6e8b8940\scratchpad\agent-b\` — `lib.cjs` (loads the URL from `.env` without echoing it, wraps everything in a read-only transaction), `q1.cjs` (schema/privileges), `q2.cjs` (profiling), `q3.cjs` + `checksum.sql` (checksums), `q4.cjs` (text-search tokenisation).

---

## 1. Summary

| Item | Finding |
|---|---|
| Host | **Prisma Postgres** (managed; direct TCP on 5432, not a pooler hostname, `sslmode` is the only URL parameter). Region not evident from the hostname |
| Version | PostgreSQL **17.2** (x86_64 musl/Alpine), UTF8, timezone UTC, `default_text_search_config = pg_catalog.english` |
| Database / schema | database `postgres`, schema `public` (search_path `"$user", public`). One extra provider schema `ppg` (not ours) |
| Role | `prisma_migration`; catalog reports `rolsuper = true`, `rolcreatedb = true`, member of `pg_read_all_data` / `pg_write_all_data`; owns the three tables; `CREATE` on schema `public` and on the database = true |
| Tables | `crew_members` **6** rows, `ship_subsystems` **8** rows, `ship_records` **35** rows. No other user tables. DB size 7.6 MB |
| Extensions installed | `plpgsql` 1.0, `prisma_postgres` 0.4.0 (provider) |
| `pg_trgm` | **not installed, available** (default version 1.6, `trusted = true`) |
| `unaccent` | **not installed, available** (default version 1.1, `trusted = true`) |
| Text search configs | `english` and `simple` both present (29 configs total) |
| Top risks | (1) no auth on write routes and the site is live, so the data can change under the migration; (2) 22 of 35 `ship_records` rows are test junk and 4 are exact duplicates; (3) slug collisions; (4) every legacy column is nullable; (5) generated `search_vector` cannot use `array_to_string`/`unaccent` directly |

---

## 2. Code: queries, callers, defects

### 2.1 Connection — `src/db.js:1-3`

```js
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL);
```

Driver: `postgres` ^3.4.5 (package.json:11). All queries use the tagged-template form, so every value is sent as a bound parameter. **No SQL injection was found anywhere.**

Defects:

| # | Where | Defect |
|---|---|---|
| C1 | db.js:3 | No check that `DATABASE_URL` is set; a missing variable fails late with an opaque connection error |
| C2 | db.js:3 | No options: pool size is the driver default (10 per server instance; server `max_connections` = 100), no `idle_timeout`, no `connect_timeout`. On Vercel each warm function instance keeps its own pool |
| C3 | db.js:3 | Module-level client is not cached on `globalThis`, so `next dev` hot reload opens a new pool per reload |
| C4 | db.js (all) | No `try/catch` anywhere in the file or in any caller; every DB error becomes an unhandled 500 |
| C5 | db.js (all) | `SELECT *` everywhere; row shape reaches the client unfiltered (including through client-component props) |

### 2.2 Query inventory

| Function | db.js lines | SQL | Callers |
|---|---|---|---|
| `createRecord(title, text)` | 9-16 | `INSERT INTO ship_records (title, text) VALUES ($1, $2)` (no `RETURNING`) | `src/app/api/create/route.js:11` ← `ShipRecordCreator.js:37` (`fetch POST /api/create`) |
| `updateRecord(id, title, text)` | 20-28 | `UPDATE ship_records SET title=$1, text=$2 WHERE id=$3` | `src/app/api/edit/route.js:11` ← `ShipRecordCreator.js:53` (`fetch PUT /api/edit`) |
| `getCrew()` | 32-38 | `SELECT * FROM crew_members ORDER BY id ASC` | `src/components/Main/Main.js:11` (server component wrapping **every** page) → `MainPanel` → `CrewList.js:28` → `CrewMember.js:3` |
| `getSubsystems()` | 40-46 | `SELECT * FROM ship_subsystems ORDER BY id ASC` | `Main.js:12` → `MainPanel` → `ShipOverview.js:37`, `ShipSystem.js` |
| `getCrewMemberById(id)` | 50-56 | `SELECT * FROM crew_members WHERE id=$1` → `[0]` | `src/app/crew_member/[crew_member_id]/page.js:8` |
| `getShipRecordById(id)` | 58-64 | `SELECT * FROM ship_records WHERE id=$1` → `[0]` | `src/app/ship_record/[record_id]/page.js:8`, `src/app/edit_ship_record/[record_id]/page.js:8` |
| `getSubsystemById(id)` | 66-72 | `SELECT * FROM ship_subsystems WHERE id=$1` → `[0]` | `src/app/subsystem/[subsystem_id]/page.js:8` |
| `globalSearch(keyword)` | 77-85 | runs the three functions below **sequentially** | `src/app/api/search/route.js:11` ← `Form.js:16` (`fetch POST /api/search`) |
| `searchCrewMembers` (private) | 87-105 | `ILIKE '%kw%'` on `first_name, last_name, crew_rank, race, composition, current_status, expertise` and on `first_name \|\| ' ' \|\| last_name`; `LIMIT 10` | `globalSearch` |
| `searchSubsystems` (private) | 107-122 | `ILIKE '%kw%'` on `type, status, current, value, details`; `LIMIT 10` | `globalSearch` |
| `searchShipRecords` (private) | 124-136 | `ILIKE '%kw%'` on `title, text`; `LIMIT 10` | `globalSearch` |

Column usage by the UI (needed to keep behaviour after the move to `entities`):

- `CrewMember.js:3,9-15`: `id, first_name, last_name, crew_rank` (label "Rank"), `race`, `composition` (label "Type"), `current_status` (label "Status"), `expertise`.
- `ShipOverview.js:38-46`: `id, type, current, status, value` (label "Current capability"), `details`. Status is rendered **Online only if the string is exactly `'Online'`**, anything else shows Offline (`ShipOverview.js:25`, `ShipSystem.js:11`).
- `FormResults.js:14`: link is `/${source}/${id}` and the label is `row[displayProperty]`: `first_name` for crew, `current` for subsystems, `title` for records.
- `SearchResult.js:37-43`: renders every key except `id` as `key : value`, splitting each value on spaces.
- `ShipRecordCreator.js:11-14,57`: uses `id, title, text`.

### 2.3 API routes

#### `POST /api/create` — `src/app/api/create/route.js`

| # | Line | Defect | Severity |
|---|---|---|---|
| A1 | 6-15 | **No authentication/authorisation.** Anyone on the internet can insert rows | Critical |
| A2 | 7 | `await request.json()` not guarded: malformed or empty body throws → 500 | Medium |
| A3 | 10 | Validation is only truthiness + `.length`. No type check (an array or an object with a `length` key passes and is handed to the driver), no `trim` (whitespace-only passes; the client requires > 2 trimmed chars at `ShipRecordCreator.js:78,85`, the server does not), no maximum length | High |
| A4 | 10-11 | `title` is `varchar(255)`: a longer title raises Postgres error 22001, unhandled → 500. `text` is unbounded: no size cap at all | High |
| A5 | 9,14 | Validation failure returns **200** with `[]`, identical to success (the driver's result for an INSERT without `RETURNING` is also an empty array). The client cannot tell success from failure | High |
| A6 | db.js:10-13 | No `RETURNING id`, so the UI cannot link to the new record | Low |
| A7 | — | No duplicate protection and no idempotency; the live data shows double/triple submits (ids 10-12, 18-19, 34-35 are identical) | Medium |
| A8 | — | No rate limit, no CSRF consideration (becomes relevant once a cookie session exists) | Medium |

#### `PUT /api/edit` — `src/app/api/edit/route.js`

| # | Line | Defect | Severity |
|---|---|---|---|
| E1 | 6-15 | **No authentication.** Anyone can overwrite any record by id | Critical |
| E2 | 10 | `body.id` only checked for truthiness. A non-numeric string reaches Postgres → `invalid input syntax for type integer` → 500 | High |
| E3 | 11, db.js:21-25 | No existence check: updating a non-existent id affects 0 rows and still returns 200 `[]` | Medium |
| E4 | 7, 10 | Same as A2-A5 (unguarded JSON parse, no type/trim/length validation, 200 on rejection) | High |
| E5 | — | No optimistic concurrency / `updated_at`; last write wins silently | Low |

#### `POST /api/search` — `src/app/api/search/route.js`

| # | Line | Defect | Severity |
|---|---|---|---|
| S1 | 6 | Read operation exposed as `POST`: not cacheable, not shareable, no URL state (spec 5.3 requires `GET /api/search?q=`) | Medium |
| S2 | db.js:89-96,109-113,126-127 | `%` and `_` in the keyword are **not escaped**. Parameterised, so not an injection, but `%` or `_` alone matches every row, and `50%` does not mean what the user typed | Medium |
| S3 | 10 | No type check (non-string with `length` passes), no minimum length, no maximum length, no trim | Medium |
| S4 | db.js:80-82 | Three queries awaited one after another instead of `Promise.all` | Low |
| S5 | db.js:97,114,128 | `LIMIT 10` without `ORDER BY`: arbitrary, non-deterministic subset, no ranking | Medium |
| S6 | db.js:96 | `first_name \|\| ' ' \|\| last_name` is NULL if either part is NULL (both columns are nullable) | Low |
| S7 | db.js:87-136 | Leading-wildcard `ILIKE` cannot use any existing index: always a sequential scan. The two btree indexes on `crew_members` (`searchable_column`, `full_name`, see 3.3) serve no query in the code | Low (tiny tables) |
| S8 | db.js:100-104 | Presentation metadata (`source`, `displayProperty`) is produced in the data layer; the response shape is `[{source, displayProperty, data: rows[]}]` with full rows | Low |
| S9 | 7 | Unguarded `request.json()` | Medium |
| S10 | Form.js:14-29 | Client fires a request on **every keystroke**: no debounce, no `AbortController`, so responses can arrive out of order and show stale results; no `response.ok` check, no `catch`. Clearing the box leaves the old results in place (`Form.js:26`) | Medium |

### 2.4 Page-level callers

| # | Where | Defect | Severity |
|---|---|---|---|
| P1 | `crew_member/[crew_member_id]/page.js:8`, `ship_record/[record_id]/page.js:8`, `subsystem/[subsystem_id]/page.js:8`, `edit_ship_record/[record_id]/page.js:8` | Route param passed straight to `WHERE id = $1`. `/ship_record/abc` → Postgres integer-syntax error → 500. No `notFound()` | High |
| P2 | same pages + `SearchResult.js:37` | A missing id returns `undefined`; `Object.entries(undefined)` throws → 500 instead of 404. On the edit page `predefinedData={undefined}` falls back to `{}` and the form silently turns into "Add record" | High |
| P3 | `SearchResult.js:19,40` | `createInteractiveText(value)` calls `value.split(' ')`: any NULL column crashes the page. All legacy columns are nullable (currently 0 NULLs) | Medium |
| P4 | `SearchResult.js:40` | `key.replace('_', ' ')` only replaces the first underscore; raw column names are the UI labels | Low |
| P5 | `SearchResult.js:61` | Edit link built with backslashes: `` `\\edit_ship_record\\${data.id}` `` | Medium |
| P6 | `ship_record/[record_id]/page.js:12` | `editable={true}` unconditionally; `/edit_ship_record/[id]` and `/add_ship_record` are public | Critical (with A1/E1) |
| P7 | `Main.js:11-12` | Two sequential queries on **every** page render, no caching/`Promise.all`; makes every route dynamic and DB-dependent, including the weapon creator | Medium |
| P8 | `ShipRecordCreator.js:45-48, 62-64` | `fetch(...).then(...)` never checks `response.ok` and has no `.catch`; a failed save still shows "Record added" / navigates. `redirect()` from `next/navigation` is called inside a promise callback in a client event flow (line 63); `router.push` is the supported API there | High |
| P9 | `ShipRecordCreator.js:92` | `titleValid & dataValid` uses bitwise AND (works by accident, returns 0/1) | Low |
| P10 | `ShipRecordCreator.js:28-33` | Button is not disabled while the request is in flight (only the inputs are), which is how the duplicates in A7 are produced | Medium |
| P11 | `ShipOverview.js:38` | `subsystem.id == selectedTab` loose comparison between number and DOM attribute string | Low |

Not a defect: XSS. All DB text is rendered through React text nodes; there is no `dangerouslySetInnerHTML` in the data paths.

---

## 3. Live database

### 3.1 Server and role

| Property | Value |
|---|---|
| `version()` | PostgreSQL 17.2 on x86_64-pc-linux-musl (Alpine, gcc 13.2.1), 64-bit |
| Host type | Prisma Postgres (managed). Direct connection, port 5432 |
| `current_database()` | `postgres` (owner `postgres`, size 7611 kB) |
| `current_schema()` | `public` (owner `pg_database_owner`) |
| `search_path` | `"$user", public` |
| Encoding / TZ | UTF8 / UTC |
| `default_text_search_config` | `pg_catalog.english` |
| `standard_conforming_strings` | `on` |
| `max_connections` | 100 |
| `statement_timeout` | 0 (none) |
| Role | `prisma_migration` (`current_user` = `session_user`) |
| `rolsuper` | **true** (as reported by `pg_roles`) |
| `rolcreatedb` / `rolcreaterole` / `rolreplication` / `rolbypassrls` | true / false / false / false |
| Member of | `pg_read_all_data`, `pg_write_all_data` |
| `has_schema_privilege('public','CREATE')` | **true** → can create tables in `public` |
| `has_database_privilege(current_database(),'CREATE')` | **true** → can create schemas; required for `CREATE EXTENSION` of a trusted extension |
| Table privileges (all three tables) | SELECT, INSERT, UPDATE, DELETE, TRUNCATE all true; the role **owns** the tables, so it could also ALTER/DROP them |

Can the role create extensions? Everything the catalog shows says yes: the role is reported as superuser, has database-level `CREATE`, and both `pg_trgm` and `unaccent` are flagged `trusted = true` in `pg_available_extension_versions` (a trusted extension only needs `CREATE` on the database). **This was not exercised** because `CREATE EXTENSION` is a write. A managed platform can still intercept it, so the migration should run `CREATE EXTENSION IF NOT EXISTS pg_trgm;` as its first statement inside the transaction and abort cleanly if it fails.

Because the role owns the legacy tables and can TRUNCATE/DROP them, nothing at the database level protects them. The protection in section 4 of `UPGRADE_PROMPT.md` has to come from tooling discipline (see pitfall M12).

### 3.2 Objects in non-system schemas

| Schema | Object | Kind | Owner | Notes |
|---|---|---|---|---|
| public | `crew_members` | table | prisma_migration | 6 rows, 64 kB total, RLS off |
| public | `ship_subsystems` | table | prisma_migration | 8 rows, 32 kB, RLS off |
| public | `ship_records` | table | prisma_migration | 35 rows, 32 kB, RLS off (planner estimate says 28: statistics are stale) |
| public | `crew_members_id_seq` | sequence | prisma_migration | integer, last_value 6 (identity sequence) |
| public | `ship_subsystems_id_seq` | sequence | prisma_migration | bigint, last_value 8 |
| public | `records_id_seq` | sequence | prisma_migration | bigint, last_value 35. Name shows `ship_records` was once called `records` |
| ppg | `query_stats` | view | postgres | Provider-managed (32 columns of query statistics). Not ours |
| ppg | functions `_query_stats_internal`, `backup_info`, `create_backup`, `diagnostics`, `query_stats_reset`, `start_backup`, `verify` | functions | — | Provider-managed. Not ours; do not call |

There are **no other user tables**: no `_prisma_migrations`, no `__drizzle_migrations`, no `drizzle` schema, no views, no triggers, no user functions, no foreign keys, no check or unique constraints beyond the primary keys.

### 3.3 Table definitions

#### `public.crew_members` — 6 rows

| # | Column | Type | Nullable | Default |
|---|---|---|---|---|
| 1 | `id` | integer | NO | **`GENERATED ALWAYS AS IDENTITY`** |
| 2 | `first_name` | varchar(255) | YES | — |
| 3 | `last_name` | varchar(255) | YES | — |
| 4 | `crew_rank` | varchar(255) | YES | — |
| 5 | `race` | varchar(255) | YES | — |
| 6 | `composition` | varchar(255) | YES | — |
| 7 | `current_status` | varchar(255) | YES | — |
| 8 | `expertise` | varchar(255) | YES | — |

Constraints: `crew_members_pkey PRIMARY KEY (id)`.
Indexes:
- `crew_members_pkey` — unique btree `(id)`
- `full_name` — btree `(((first_name)::text || ' '::text) || (last_name)::text)`
- `searchable_column` — btree `(first_name, last_name, crew_rank, race, composition, current_status, expertise)`

(Both secondary indexes are useless for the `ILIKE '%…%'` queries; they are only listed for completeness. Note the generic index names `full_name` and `searchable_column` live in the schema-wide index namespace: new indexes must not reuse them.)

#### `public.ship_subsystems` — 8 rows

| # | Column | Type | Nullable | Default |
|---|---|---|---|---|
| 1 | `id` | integer | NO | `nextval('ship_subsystems_id_seq'::regclass)` |
| 2 | `type` | varchar(255) | YES | — |
| 3 | `status` | varchar(255) | YES | — |
| 4 | `current` | varchar(255) | YES | — |
| 5 | `value` | varchar(255) | YES | — |
| 6 | `details` | text | YES | — |

Constraints: `ship_subsystems_pkey PRIMARY KEY (id)`. Indexes: `ship_subsystems_pkey` unique btree `(id)`.

#### `public.ship_records` — 35 rows

| # | Column | Type | Nullable | Default |
|---|---|---|---|---|
| 1 | `id` | integer | NO | `nextval('records_id_seq'::regclass)` |
| 2 | `title` | varchar(255) | YES | — |
| 3 | `text` | text | YES | — |

Constraints: `ship_records_pkey PRIMARY KEY (id)`. Indexes: `ship_records_pkey` unique btree `(id)`.

No table has timestamps, so `created_at`/`updated_at` for copied rows can only be the migration time.

### 3.4 Data profile

Column statistics (`nulls` = IS NULL, `empty` = `''`, `untrimmed` = value differs from `btrim`, lengths in characters). **No NULLs, no empty strings and no non-ASCII characters exist in any column of any table.** No tabs, no HTML, no URLs.

**crew_members** (ids 1-6, contiguous)

| Column | nulls | empty | untrimmed | distinct | min / max / avg len |
|---|---|---|---|---|---|
| first_name | 0 | 0 | 0 | 6 | 3 / 13 / 5.8 |
| last_name | 0 | 0 | 0 | 5 | 2 / 6 / 4.2 |
| crew_rank | 0 | 0 | 0 | 3 | 7 / 15 / 13.2 |
| race | 0 | 0 | 0 | 6 | 2 / 9 / 6.2 |
| composition | 0 | 0 | 0 | 2 | 7 / 12 / 8.7 |
| current_status | 0 | 0 | 0 | 1 | 5 / 5 / 5.0 |
| expertise | 0 | 0 | 0 | 6 | 6 / 39 / 13.5 |

All six rows (the table is small enough to show in full):

| id | first_name | last_name | crew_rank | race | composition | current_status | expertise |
|---|---|---|---|---|---|---|---|
| 1 | Jagoda | Migdal | Captain | Plant | organic | alive | Botany |
| 2 | Triple | Blink | Vice Captain | Pabariali | organic | alive | Real estate |
| 3 | Kik | `??` | Privileged crew | Eyin Samt | organic | alive | Engineering |
| 4 | Chak | Marak | Privileged crew | Human | organic | alive | Chalga |
| 5 | Kal | O'Dun | Privileged crew | Yolotli | semi-organic | alive | Medicine |
| 6 | Ir'Htelekmari | `??` | Privileged crew | `??` | semi-organic | alive | Infiltration and Intelligence Gathering |

Oddities: the literal string **`??` is used as an "unknown" placeholder** (`last_name` of ids 3 and 6, `race` of id 6). Apostrophes inside names (`O'Dun`, `Ir'Htelekmari`). Values are lower case for `composition`/`current_status`, title case elsewhere.

**ship_subsystems** (ids 1-8, contiguous)

| Column | nulls | empty | untrimmed | distinct | min / max / avg len |
|---|---|---|---|---|---|
| type | 0 | 0 | 0 | 6 | 3 / 10 / 6.9 |
| status | 0 | 0 | 0 | 2 | 6 / 7 / 6.5 |
| current | 0 | 0 | **1** | 8 | 4 / 23 / 13.0 |
| value | 0 | 0 | 0 | 8 | 5 / 33 / 15.1 |
| details | 0 | 0 | 0 | 8 | 7 / 491 / 250.4 |

| id | type | status | current | value | details (len) |
|---|---|---|---|---|---|
| 1 | FTL | Online | Warp | 365 C | "Faster than light travel system can be active for up 10 days (10% energy per day) until energy reserves are depleted. Ac…" (256) |
| 2 | PROPULSION | Offline | Fusion drive | 0.9 C | "Sub-FTL travel can be active for up to 12 million years (0.000008% energy per year) before energy reserves are depleted.…" (162) |
| 3 | PROPULSION | Offline | Thrusters | 0.01 C | "Thrusters can be active for up to 12 billion years (0.000000008% energy per year) before energy reserves are depleted. A…" (280) |
| 4 | WEAPONS | Offline | Rail cannon | 15 kt every 6 sec | "X'aro is equipped with 2 rail cannons positioned on each side of the ship. Canno…" (310) |
| 5 | WEAPONS | Offline | Inertia wave emitter | 1 pulse every 6 sec | "X'aro is equipped with 1 inertia wave emitter positioned on the underside of the…" (255) |
| 6 | SHIELDS | Online | Alpha tempora monolayer | Can negate a total of 5 Gtons | "The shield constitutes of a single layer of crystalized alpha tempora particles …" (242) |
| 7 | SENSORS | Online | `Warp drone matrix ` | FTL within 1 light second, then C | "The ship can deploy a net of 100 small (10 cm diameter) drones 1 light second aw…" (491) |
| 8 | CORE | Online | Unknown | Unknown | "Unknown" (7) |

Oddities: `type` is an upper-case **category, not a name** and repeats (PROPULSION ×2, WEAPONS ×2); the per-row unique label is `current`. Id 7 `current` has a **trailing space**. Id 6 `details` contains a double space. Id 8 uses the word `Unknown` as a placeholder in three columns. `status` is exactly `Online` or `Offline`, and the UI compares to the exact string `'Online'`.

**ship_records** (ids 1-35, contiguous, no gaps)

| Column | nulls | empty | untrimmed | distinct | min / max / avg len |
|---|---|---|---|---|---|
| title | 0 | 0 | 0 | 31 (of 35) | 4 / 31 / 10.2 |
| text | 0 | 0 | 0 | 31 (of 35) | 4 / 721 / 64.4 |

3 rows contain newlines in `text` (ids 25, 28, 33); id 33 is a dash-bulleted list. 1 row has a double space.

Samples:

| id | title | text |
|---|---|---|
| 1 | Ereshkigal | "Ereshkigal is the queen of the Other world and leader of the annunaki. She is also known as the Queen of Lies." |
| 25 | K82ACA | "The sole initial occupant on X'aro's newly (re?)formed corre…" (719 chars, 3 newlines) |
| 28 | The Joy Eater | "Unknown.\nDo not try to know.\nKeep it unknown.\nFor all your sakes." |

Full title list with text length (needed for the junk/duplicate decision below):

| id | title | len | | id | title | len |
|---|---|---|---|---|---|---|
| 1 | Ereshkigal | 110 | | 19 | Test13 | 6 |
| 2 | Test title | 9 | | 20 | Test14 | 6 |
| 3 | Test 2 | 7 | | 21 | test16 | 6 |
| 4 | Test 3 | 8 | | 22 | Test15 | 6 |
| 5 | Test 4 title | 11 | | 23 | Test17 | 6 |
| 6 | Test 5 | 11 | | 24 | Interspace deathgoop | 35 |
| 7 | Test 6 | 11 | | 25 | K82ACA | 719 |
| 8 | Test 7 | 11 | | 26 | Create title 3 | 13 |
| 9 | Test 8 | 11 | | 27 | Create title 11 | 15 |
| 10 | Alex is an intergalactic horror | 37 | | 28 | The Joy Eater | 65 |
| 11 | Alex is an intergalactic horror | 37 | | 29 | Test after deployment | 21 |
| 12 | Alex is an intergalactic horror | 37 | | 30 | Lena | 122 |
| 13 | Strong cat | 33 | | 31 | Yaraslav | 114 |
| 14 | new test 1 | 15 | | 32 | Napones | 18 |
| 15 | Test10 | 7 | | 33 | Olkor | 721 |
| 16 | Test11 | 6 | | 34 | siuu | 4 |
| 17 | Test12 | 6 | | 35 | siuu | 4 |
| 18 | Test13 | 6 | | | | |

Oddities:

- **Exact duplicate rows** (same title and same text): ids **10, 11, 12**; ids **18, 19**; ids **34, 35**. 4 redundant rows.
- **Test junk**: ids 2-9, 14-23, 26, 27, 29, 34, 35 are obviously test entries (22 rows). Ids 10-13 look like jokes. Roughly **8 rows are real lore**: 1, 24, 25, 28, 30, 31, 32, 33.
- Inconsistent casing between otherwise similar titles (`Test15` vs `test16`); no two titles differ only by case.
- No record title contains a crew first name or a subsystem `type`/`current`, so there is no cross-table name overlap today.
- In several rows `text` equals `title` (ids 16-23, 27, 34, 35).

### 3.5 Extensions

Installed (`pg_extension`):

| Extension | Version | Schema |
|---|---|---|
| plpgsql | 1.0 | pg_catalog |
| prisma_postgres | 0.4.0 | public (provider-managed) |

Available (`pg_available_extensions`, 48 in total), the relevant ones:

| Extension | Default version | Installed | Trusted |
|---|---|---|---|
| **pg_trgm** | 1.6 | no | **yes** |
| **unaccent** | 1.1 | no | **yes** |
| fuzzystrmatch | 1.2 | no | — |
| btree_gin | 1.3 | no | — |
| citext | 1.6 | no | — |
| pgcrypto | 1.3 | no | — |
| uuid-ossp | 1.1 | no | — |
| pg_stat_statements | 1.11 | no | — |
| vector | 0.8.1 | no | — (not wanted; listed only for completeness) |

`similarity()` and `unaccent()` do not exist yet (confirmed: 0 matching rows in `pg_proc`).
`unaccent` is of little use for the current data (zero non-ASCII characters anywhere), but future imports may contain accented names.

### 3.6 Text search

Configurations present: arabic, armenian, basque, catalan, danish, dutch, **english**, finnish, french, german, greek, hindi, hungarian, indonesian, irish, italian, lithuanian, nepali, norwegian, portuguese, romanian, russian, serbian, **simple**, spanish, swedish, tamil, turkish, yiddish.

Tokenisation of real campaign vocabulary, measured read-only on this server:

| Input | Config | Result |
|---|---|---|
| `X'aro Ir'Htelekmari O'Dun K82ACA semi-organic` | simple | `'x':1 'aro':2 'ir':3 'htelekmari':4 'o':5 'dun':6 'k82aca':7 'semi-organic':8 'semi':9 'organic':10` |
| `… Napones Olkor Yaraslav Thrusters semi-organic` | english | `'napon'`, `'olkor'`, `'yaraslav'`, `'thruster'`, `'semi-organ'`, `'organ'` |
| `websearch_to_tsquery('english', 'X''aro')` | english | `'x' <-> 'aro'` |
| `to_tsvector('english', '??')` | english | empty |

Function volatility on this server (decides what a generated column may contain):

| Function | Volatility |
|---|---|
| `to_tsvector(regconfig, text)` | immutable |
| `to_tsvector(text)` (config from GUC) | stable — **not allowed** in a generated column |
| `jsonb_to_tsvector(regconfig, jsonb, jsonb)` | immutable |
| `to_tsvector(regconfig, jsonb)` | immutable |
| `array_to_string(anyarray, text)` | **stable** — not allowed in a generated column |

### 3.7 Checksums (baseline for the later verifier)

Exact SQL (also saved as `checksum.sql` in the scratchpad; run it with `standard_conforming_strings = on`, which is the server default):

```sql
SELECT 'crew_members' AS tbl, count(*)::int AS n, md5(coalesce(string_agg(x::text, E'\n' ORDER BY x.id), '')) AS md5 FROM public.crew_members x
UNION ALL
SELECT 'ship_subsystems', count(*)::int, md5(coalesce(string_agg(x::text, E'\n' ORDER BY x.id), '')) FROM public.ship_subsystems x
UNION ALL
SELECT 'ship_records', count(*)::int, md5(coalesce(string_agg(x::text, E'\n' ORDER BY x.id), '')) FROM public.ship_records x;
```

`x::text` is the whole row in Postgres composite text form, in column order, so the hash covers every column of every row and changes if a column is added, dropped or reordered.

Result at 2026-11-23 ~09:50 UTC:

| Table | Rows | md5 |
|---|---|---|
| `crew_members` | 6 | `449aea455cfa5dc63630b6900da10602` |
| `ship_subsystems` | 8 | `44efa0e3c840e42c0481f7b115100c3a` |
| `ship_records` | 35 | `bb8110bd90477e95bd1f8f855fa8cb57` |

Per-row hashes, to pinpoint a difference (`SELECT id, md5(x::text) FROM <table> x ORDER BY id`):

```
crew_members    1 fd5745dd689ddb33b91d79e84f9aaf7d   2 01ebd22dd817f18e965b4ebdba78eefb   3 86ddd71c6ef6b6f4490a32ec8bc369d2
                4 40e12deefa93fe9dfa48d288af66c597   5 b71609f702e24d89eb78e015d14e1e06   6 915518bfa80fc34cc92871ab85e846ce
ship_subsystems 1 b3d2e6a2247d1bb8db144240c68cc86a   2 2699530b7130f3f7f78ea2ef832527be   3 957ec4c31a8c4b8382248dd78c537f5e
                4 e940c68b03d31ac0d449586ca60a97e8   5 0385d71689ef3b81c37bab255daf481b   6 b932a284cd7606bfbbe0e017c3e812fc
                7 f1315798b94cde85e3286eb2b23f2ce6   8 390dae23378ac16fee78b5ee976a61dc
ship_records    1 a990906cf8fdc735a09020a16abc5094   2 dcbfc93ffa47aacd64cdebb704b4f622   3 bc538bd4b503d5b8bbe5a97b0105787a
                4 e1983d88a24dd58bc8a33f135cc332e5   5 7f1707e520877eb1dd2bc34f684637e8   6 4d2251e1d795f26bf06420b0243baf56
                7 7032f558d7954a76347fad6f8cdf674b   8 d8d9fa9c3bfef0b17024ca430b5a7591   9 9a3cd0478138caeec6f5355a0a8c0082
               10 aa3d51328f63dfab0faf0e6b79ee9414  11 fb0befb7fef86ee21168b8d8ab3714c0  12 e7dcc1f6b53a35457feb468799ff3c31
               13 79787c7fb5f3df65eab2f4b6ba3f45e3  14 77cbb7c5ba566b921ba16c4e6319f179  15 aedc3c9a2310629cbe299c2031f2fc19
               16 bbc6f377b0aceab19e568a275cc81922  17 2ad6236ac726b7a0fb87da0b9c28fb3d  18 0a0ee62c630ae44a0e8ec06eb47ae593
               19 5f11646df42410eab0a9cc68b0f70252  20 d39a5be5ef4044b65dd5f83cca4fc325  21 45d3ceb424799e9a0c6c7203f46816d6
               22 f26b029b6d2193a353ca140780eb5024  23 550a9c3aa0595263cacb7edde5fda25b  24 3fd40f41b511727b71f6c995ff7b8e7c
               25 5589f48223d3cf299090acd51672f6a1  26 ec956c899d21bf4ec9252dc70212a102  27 113dd26f3a3fa5d2011811ce28274b24
               28 db93fc4b5695a45603269f988fac8568  29 3c54237618314ed1ccaa0a89404e65ad  30 58124f36e4eabc54246ff25f1d66bbc9
               31 03d64b232322569ae86e10aa36dd0b72  32 b72cf6706aae0bb52498d7bb117f00aa  33 cb8dc2f5aa194a4f328402f3e33c607a
               34 1ecc37f34c929a7f83a1e763b1182e05  35 690159b60a5994350e875e7c9b8b82bb
```

**Caveat for the verifier.** The production site is live and `/api/create` and `/api/edit` are unauthenticated, so `ship_records` can legitimately change between this snapshot and the migration (a player adding a record changes the count and hash; an edit changes the hash). A mismatch against this file is therefore not proof that the overhaul damaged anything. The authoritative comparison for V4 is: recompute these hashes **in the same session that writes the `backups/` export, immediately before the first write**, store them next to the backup, and compare against those. Use this section as a cross-check and use the per-row hashes to explain any difference.

---

## 4. Migration pitfalls and mapping suggestions (legacy → `entities`)

### 4.1 Suggested column mapping

**crew_members → `type = 'character'`**

| Target | Source | Notes |
|---|---|---|
| `name` | `first_name` + `' '` + `last_name`, **dropping the `??` placeholder** | "Kik", "Ir'Htelekmari", not "Kik ??". Use `concat_ws` + `NULLIF`, not `\|\|` (NULL-safe) |
| `slug` | from `name` | `jagoda-migdal`, `triple-blink`, `kik`, `chak-marak`, `kal-o-dun`, `ir-htelekmari` (no collisions) |
| `aliases` | `{first_name}` when a real last name exists; optionally the last name too | Today's search hits on first name alone and the result label is `first_name` |
| `summary` | generated sentence, e.g. "Captain of the X'aro. Plant, organic. Expertise: Botany." | No prose column exists. Alternatively leave NULL; decide once and document |
| `body` | NULL / empty | There is no long text |
| `attributes` | **all seven columns verbatim**: `first_name, last_name, crew_rank, race, composition, current_status, expertise` | Keep the original keys and the original values (including `??`) so the copy is lossless and the crew panel can render Rank / Race / Type / Status / Expertise unchanged |
| `legacy_table`, `legacy_id` | `'crew_members'`, `id` | |

**ship_subsystems → `type = 'ship_system'`**

| Target | Source | Notes |
|---|---|---|
| `name` | `btrim(current)` | `type` is a repeated category (PROPULSION ×2, WEAPONS ×2) and cannot be the name. `current` is unique and is already the search result label. Id 8 becomes "Unknown": consider `name = 'Core'` for that single row, or `type \|\| ' — ' \|\| current`; planner's call |
| `slug` | from name | `warp`, `fusion-drive`, `thrusters`, `rail-cannon`, `inertia-wave-emitter`, `alpha-tempora-monolayer`, `warp-drone-matrix`, `unknown` (id 8: poor slug, see above) |
| `aliases` | `{type}` in a readable case, e.g. `{FTL}`, `{Propulsion}` | Lets "weapons" find both weapon systems |
| `summary` | generated: "`type` system, `status`. Current capability: `value`." | |
| `body` | `details` | |
| `attributes` | `type` (as `category` or keep key `type`), `status`, `current` (**untrimmed original**), `value` | The ship panel needs `type`, `current`, `status`, `value`, `details`. Beware the key name `type` clashing conceptually with `entities.type` |
| `legacy_table`, `legacy_id` | `'ship_subsystems'`, `id` | |

**ship_records → `type = 'record'`**

| Target | Source | Notes |
|---|---|---|
| `name` | `title` | varchar(255) → fits any text column |
| `slug` | from `title`, de-duplicated | See M2 |
| `aliases` | `{}` | |
| `summary` | NULL, or first sentence / first ~160 chars of `text` | Do not invent content. Many rows have `text` shorter than a sentence |
| `body` | `text` verbatim, newlines preserved | Detail page needs `white-space: pre-line` (ids 25, 28, 33) |
| `attributes` | `{}` (optionally `{"legacy_title": title}`) | |
| `legacy_table`, `legacy_id` | `'ship_records'`, `id` | Needed for the `/ship_record/[id]` and `/edit_ship_record/[id]` redirects |

Several real records are actually characters (Ereshkigal, Lena, Yaraslav, Napones, Olkor, K82ACA). Spec 5.1 says ship records → `record`; reclassifying them is a content decision for the owner or a later Claude import, not for the mechanical copy.

### 4.2 Pitfalls, ranked

| # | Pitfall | Detail / recommendation |
|---|---|---|
| M1 | **Live data can change under you** | Write routes are public on production. Take the backup, recompute the checksums and run the copy in one sitting; make the copy re-runnable so rows added later can be picked up (see M4) |
| M2 | **Slug collisions with a unique constraint** | Measured with a naive slug (`lower`, non-alphanumerics → `-`): `alex-is-an-intergalactic-horror` ×3 (ids 10,11,12), `test13` ×2 (18,19), `siuu` ×2 (34,35); and if `ship_subsystems.type` were used as the name, `propulsion` ×2 and `weapons` ×2. The slug rule must be **deterministic** so re-runs produce the same slug: e.g. first occurrence by lowest `legacy_id` keeps the plain slug, the others get `-<legacy_id>`; or always suffix records with the legacy id. No cross-table collision exists today, but the rule must handle one (and must handle slugs created later by imports) |
| M3 | **Empty slugs** | A name made only of punctuation gives an empty slug (`??` → ``). Not hit today once `??` is stripped from crew names, but the slug function needs a fallback (`<type>-<legacy_id>`) |
| M4 | **Idempotency key** | Use a unique index on `(legacy_table, legacy_id)` (partial: `WHERE legacy_table IS NOT NULL`) and `INSERT … ON CONFLICT (legacy_table, legacy_id) DO NOTHING`. Do not key idempotency on slug or name: duplicates exist. Decide explicitly whether a re-run should refresh already-copied rows (`DO UPDATE`) or leave them (`DO NOTHING`); after cut-over the new tables are the source of truth, so `DO NOTHING` is the safe choice |
| M5 | **Copy everything vs. clean up** | 22 of 35 records are test junk and 4 are exact duplicates. Spec 5.1 and check V4 require *every* legacy row to have exactly one copy, so the copy must include them. They will pollute search results and the import prompt's "existing entities" list. Recommend: copy all, then give the owner a list of junk ids (2-9, 14-23, 26, 27, 29, 34, 35; jokes 10-13) to delete from `entities` through the UI or a reviewed script. Needs an owner decision; do not drop them silently |
| M6 | **Every legacy column is nullable** | No NULLs today, but the copy SQL must be NULL-safe (`concat_ws`, `coalesce`, `jsonb_strip_nulls` or explicit handling) because a row can be inserted before the migration runs. `entities.name` will be NOT NULL: define the fallback |
| M7 | **Placeholder values** | `??` (crew last_name ×2, race ×1) and `Unknown` (subsystem id 8, three columns). Keep them verbatim in `attributes` for losslessness; keep them out of `name`, `slug` and ideally out of the search vector. `to_tsvector('english','??')` is empty, but `Unknown` is indexed and would make "unknown" match the Core |
| M8 | **Whitespace** | `ship_subsystems.id = 7` `current` has a trailing space; trim for `name`/`slug`, keep the original in `attributes` if byte-exact preservation matters. Double spaces exist in two long texts (harmless) |
| M9 | **Status string is load-bearing** | UI logic is `status === 'Online'`. Preserve the exact case in `attributes.status`, or normalise once and change the comparison in the same commit |
| M10 | **Generated `search_vector` restrictions** | Generation expressions must be immutable. `array_to_string(aliases, ' ')` is *stable* and `unaccent()` is *stable*, so neither can appear directly. Options: a small `IMMUTABLE` SQL wrapper function for the alias array, or maintain the vector with a trigger. Always use the two-argument `to_tsvector('english'::regconfig, …)`; the one-argument form is stable. `jsonb_to_tsvector('english', attributes, '["string"]')` is immutable and can index attribute values. Remember `coalesce(…, '')` on every part: one NULL makes the whole concatenated vector NULL |
| M11 | **Text search vs. invented names** | `english` stems proper nouns (`Napones` → `napon`, `Thrusters` → `thruster`) and drops stop words; apostrophes split tokens (`X'aro` → `x` + `aro`, `O'Dun` → `o` + `dun`), and `websearch_to_tsquery` turns `X'aro` into the phrase `'x' <-> 'aro'`. Consistent on both sides, so exact matches work, but prefix/partial matching on names is unreliable. Suggest `simple` config for name + aliases (weight A), `english` for summary/body, and rely on `pg_trgm` for names; consider normalising apostrophes in a separate search-name expression so `xaro` finds `X'aro` |
| M12 | **Drizzle tooling can destroy the legacy tables** | The role owns the tables and may DROP/TRUNCATE them. `drizzle-kit push`, or `generate` after an `introspect`/`pull`, will propose dropping tables that are missing from the schema file. Use **generated SQL migration files only**, review each for `DROP`/`ALTER … crew_members\|ship_subsystems\|ship_records`, never run `push` against this database, and set `schemaFilter: ['public']` plus a `tablesFilter` that excludes the three legacy tables (and nothing in schema `ppg`, and not the `prisma_postgres` extension) |
| M13 | **Provider objects** | Schema `ppg` and extension `prisma_postgres` (installed in `public`) belong to the platform. Do not touch, dump with ownership, or include in backups/restores. The backup of the three tables should be plain data (CSV/JSON/`INSERT`s), not a `pg_dump` of the schema, unless `pg_dump` is confirmed to work against this host |
| M14 | **Extension creation is untested** | Catalog says `pg_trgm` and `unaccent` are available and trusted and the role is superuser, but `CREATE EXTENSION` was not run. Put it first in the migration, inside the transaction, so a refusal aborts before any table is created. Install into `public` (default) so `gin_trgm_ops` resolves with the current `search_path` |
| M15 | **No timestamps in legacy data** | `created_at`/`updated_at` for copied rows will be the migration time. Use `ship_records.id` order as the only available chronology (e.g. `created_at = now() + legacy_id * interval '1 microsecond'` if stable ordering by date is wanted) |
| M16 | **Identity/sequence details** | `crew_members.id` is `GENERATED ALWAYS` (irrelevant unless someone tries to restore the backup with explicit ids: that needs `OVERRIDING SYSTEM VALUE`). `ship_records`' sequence is named `records_id_seq`. A restore script must also reset the sequences. New tables should not reuse the names `full_name` or `searchable_column` for indexes |
| M17 | **Legacy URL redirects need the legacy ids** | `/ship_record/[id]`, `/crew_member/[id]`, `/subsystem/[id]`, `/edit_ship_record/[id]` must resolve via `(legacy_table, legacy_id)` → slug. The lookup must reject non-numeric ids (today they cause a 500) |
| M18 | **Behavioural parity of search** | Today a search for a rank, race or status (e.g. "Captain", "organic", "Online") finds entities because every column is searched. That only survives if `attributes` values are part of the search vector (weight C/D). Note the false-positive risk: "organic" also matches "semi-organic" by substring today |
| M19 | **Connection budget** | `max_connections` = 100; the driver default is 10 per instance and the current code runs 2 queries per page render. Set an explicit small `max` (and `idle_timeout`) for the serverless runtime and a separate single connection for migration/import scripts. Platform-specific pooling guidance for Prisma Postgres should be confirmed by investigation C |
| M20 | **Stale planner statistics** | `reltuples` says 28 for `ship_records` while `count(*)` is 35. Never use estimates for verification; always `count(*)` |

### 4.3 Open questions for diagnosis / owner

1. Copy the 22 test rows and 4 duplicates into `entities` and delete them afterwards, or exclude them from the copy (which contradicts "copy every row" and V4 as written)?
2. Name for subsystem id 8 (`current = 'Unknown'`): "Unknown", "Core", or "CORE — Unknown"?
3. Should real lore records that describe people (Ereshkigal, Lena, Yaraslav, Napones, Olkor, K82ACA) stay `record` after the copy, as the spec says, or be reclassified later through an import?
4. Is `summary` for copied crew/subsystem rows generated from the attributes or left empty?
