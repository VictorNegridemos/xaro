# X'aro

Ship computer of the X'aro: crew, ship systems, a searchable archive of entries (characters, places,
systems, records, …), a `.txt` import that uses the local Claude CLI, and the Kodning weapon creator.

Next.js 16 (App Router, React 19, TypeScript strict), SCSS modules, Drizzle ORM on PostgreSQL
(`postgres` driver), `iron-session` for the single-password login, `zod` for validation,
`node:test` + `tsx` for tests. Deployed on Vercel.

## Setup

Requires Node 22.x.

```sh
npm ci
cp .env.example .env.local   # then fill in the values (see below)
npm run dev                  # http://localhost:3000
```

### Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `DATABASE_URL` | `.env` / `.env.local`, Vercel | PostgreSQL connection string |
| `AUTH_PASSWORD_HASH` | `.env.local`, Vercel | scrypt hash of the login password (`scrypt:N:r:p:<salt hex>:<hash hex>`, no `$`) |
| `SESSION_SECRET` | `.env.local`, Vercel | 64 hex characters; encrypts the session cookie |
| `CLAUDE_BIN` | local only, optional | path to the `claude` executable when it is not on `PATH` |
| `IMPORT_MODEL` | local only, optional | Claude model alias for the import |
| `IMPORT_TIMEOUT_MS` | local only, optional | timeout of one Claude call |
| `IMPORT_STUB_FILE` | local only, testing | use this JSON file as the model reply; Claude is not called |

Without `AUTH_PASSWORD_HASH` or `SESSION_SECRET` the site fails closed: everything is readable, nobody
can log in, and every write returns 401. Scripts load `.env.local`, then `.env`; they never print values.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run typecheck` | `next typegen && tsc --noEmit` |
| `npm run lint` | ESLint (flat config) |
| `npm test` | all unit tests (`node --test` with `tsx`) |
| `npm run set-password` | change the login password (see below) |
| `npm run import -- …` | import `.txt` files through the local Claude CLI (see below) |
| `npm run search:eval` | the search test queries, in a read-only transaction |
| `npm run db:backup` | export + checksums of the three legacy tables to `backups/<timestamp>/` |
| `npm run db:copy-legacy` | copy new legacy rows into `entities` (idempotent; rows already copied are skipped) |
| `npm run db:verify-legacy [-- --coverage \| --drift]` | read-only checks of the legacy tables against the backup |
| `npm run db:generate` / `db:check` | drizzle-kit `generate` / `check` only |
| `npm run db:migrate [-- --dry-run]` | guarded migration runner (backup first; dry run rolls back) |
| `npm run verify:cleanup [-- --snapshot \| --compare \| --throttle]` | remove marked verification rows from the NEW tables |

drizzle-kit `push`, `pull`, `introspect`, `migrate` and `studio` are disabled on purpose: the database is
production and holds the legacy tables.

## Login

One password, no user accounts. `/login` asks for the access code; the session cookie is HTTP-only,
`SameSite=Lax`, `Secure` in production, valid 30 days. Add entry, Import, Edit and Delete appear only
when logged in, and every write route checks the session on the server.

**Throttling:** 5 attempts per 15 minutes per client address (stored hashed in `auth_throttle`). The
6th and later attempts in the window are refused **even with the correct password**, until the window
ends (the response says how long).

**Change the password:**

```sh
npm run set-password                 # asks twice, writes AUTH_PASSWORD_HASH to .env.local
```

Then copy the new `AUTH_PASSWORD_HASH` into Vercel and redeploy. A password change logs out every
session (the session stores a fingerprint of the hash). `-- --generate` creates a phone-friendly password;
`-- --rotate-secret` also replaces `SESSION_SECRET`.

## Entries

`/entry/new` and `/entry/<slug>/edit` (login required) edit name, type, aliases (one per line), summary,
text and attributes (key/value rows; keys are lower-case `a-z`, `0-9`, `_`). The slug is fixed when an
entry is created, so renaming keeps its address. Delete asks for confirmation and also removes the
entry's links to other entries. API: `POST /api/entries`, `PUT` / `DELETE /api/entries/<id>`.

## Import workflow

The website only **queues** files; processing runs on the owner's PC with the Claude Code CLI on the
subscription account. The deployed site never calls Claude.

1. Install the Claude CLI once (Windows PowerShell): `irm https://claude.ai/install.ps1 | iex`. Open a new
   terminal, run `claude` and log in with the subscription account; `claude auth status --text` checks it.
   Make sure `ANTHROPIC_API_KEY` is **not** set, or the CLI bills the API instead.
2. Queue a file: log in, open **Import**, upload a `.txt` (≤ 1 MiB). It is stored as `pending`.
   Or import a local file directly (step 3, first form).
3. Process on the PC, in the project folder:
   ```sh
   npm run import -- path/to/file.txt --dry-run   # show the plan; writes NOTHING
   npm run import -- path/to/file.txt             # import one file
   npm run import -- --pending                    # process the upload queue
   npm run import -- --pending --retry-failed     # also retry failed uploads
   ```
   `--force` re-imports a file whose content was already imported (otherwise a no-op); `--model <alias>`
   picks the model.
4. Read the summary: created / updated / relations / skipped, plus notes. An alias match with a
   **different type** is not merged; it is created and reported as "possible duplicate of `<slug>`" —
   check those by hand. Long files are split on paragraph boundaries; each source is written in one
   transaction; invalid model output is retried twice, then the source is marked `failed`.

Sample files are in `samples/`.

## Search

`/search?q=…&type=…` and `GET /api/search` combine full-text rank with trigram similarity; names and
aliases rank highest. Clicking a word in an entry searches for it.

Known limits:

- Typo tolerance covers names and aliases only; a misspelt word that occurs only in a body is not corrected.
- A hit found only through the apostrophe-folded form (`xaro` in a body) is listed, but its snippet shows
  the start of the text without a highlight.
- One- and two-character queries match names by prefix but not aliases (`ft` does not find Warp via `FTL`).
- A snippet can start inside an apostrophe word ("aro is equipped…" for "X'aro is…").

**Tuning later.** `entities.search_vector` is generated from the SQL function
`xaro_entity_search_vector`. Change weights with `CREATE OR REPLACE FUNCTION …`, then recompute with
`UPDATE entities SET name = name` — note this also bumps `updated_at` on every row (trigger). A change to
`xaro_array_to_text` additionally needs `REINDEX INDEX entities_aliases_trgm_idx`. Run
`npm run search:eval` afterwards.

## Deploying (owner)

Agents never push or deploy. In Vercel: add `AUTH_PASSWORD_HASH` and `SESSION_SECRET` (from
`.env.local`); keep `DATABASE_URL`; no Output Directory override; Node.js 22.x. Right after a deploy, on
the PC: `npm run db:backup`, `npm run db:copy-legacy` (picks up records added on the old site meanwhile),
`npm run db:verify-legacy -- --drift`, and fix by hand any record it lists as changed.

## Legacy tables

`crew_members`, `ship_subsystems` and `ship_records` are the old site's tables. They are read only by the
backup, copy and verify scripts; the application uses `entities` only (old URLs such as
`/ship_record/<id>` redirect through `entities.legacy_table` / `legacy_id`). When the new site is live
and the drift check is clean, they can be dropped:

```sql
-- !!! NOT EXECUTED. OWNER ONLY, after the new site is deployed,
-- !!! "npm run db:copy-legacy" has been re-run, and "npm run db:verify-legacy -- --drift" is clean.
-- !!! Keep the backups/ folder. There is no undo.
BEGIN;
DROP TABLE public.crew_members;      -- also drops its indexes and identity sequence
DROP TABLE public.ship_subsystems;
DROP TABLE public.ship_records;
DROP SEQUENCE IF EXISTS public.ship_subsystems_id_seq;
DROP SEQUENCE IF EXISTS public.records_id_seq;
COMMIT;
```

No code change is needed afterwards.
