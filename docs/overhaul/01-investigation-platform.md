# 01 — Investigation C: platform and dependencies

Date: 2026-11-23. Read-only investigation. Nothing in the project was modified, no `npm install` was run in the project, the DB was not touched.

How things were checked:
- Versions: `npm view <pkg> version` / `dist-tags` / `engines` / `peerDependencies` against the npm registry today.
- Usage: grep of every non-relative import in `src/`.
- Next/Drizzle behaviour: two throw-away projects in the session scratchpad (outside the repo), one with `next@16.4.6` + `sass` + `typescript@6.0.3` + ESLint, one with `drizzle-orm@0.45.4` + `drizzle-kit@0.31.11`. Things marked **(verified)** were actually run there; everything else is from the cited docs.
- Claude CLI: `--version`, `--help`, and one tiny `-p` call on this machine.

---

## 0. Things the orchestrator must know first

1. **`claude` is not on PATH on this machine.** `claude`, `where claude` and Git Bash `which claude` all fail. The only CLI present is the copy bundled inside the Claude desktop app (`%LOCALAPPDATA%\Claude-Data\...\claude-code\2.1.330\<hash>\claude.exe`), whose path changes with every app update. Run standalone it is **not logged in** (`"result":"Not logged in · Please run /login"`, exit code 1; `%USERPROFILE%\.claude\.credentials.json` does not exist). The import script therefore needs the owner to install the standalone CLI and log in once (section 4.5). This is an owner action, not something an agent can do.
2. **`postgres` (postgres.js) 4.x came out on 2026-10-29** and is a rewrite with changed parameter typing. Recommendation: stay on the 3.x line (`3.4.9`) for this overhaul (section 1.2).
3. **TypeScript `latest` is 7.0.2, but `typescript-eslint@8.73.0` (pulled in by `eslint-config-next`) declares `typescript >=4.8.4 <6.1.0`.** Use **TypeScript 6.0.3**.
4. **ESLint `latest` is 10.15.0; it works with `eslint-config-next@16.4.6` (verified) but npm prints peer-range overrides** for `eslint-plugin-import`, `eslint-plugin-jsx-a11y`, `eslint-plugin-react` (they declare up to `^9`). Use **ESLint 9.39.5** for a clean install.
5. **`iron-session` is now v9** (ESM-only, needs Node >= 22.13, new `nextProxyCookies` adapter). Local Node 22.14.0 satisfies it; Vercel must not run Node 20 (it no longer offers it anyway).
6. **A generated `tsvector` column cannot call `array_to_string()` directly** (it is not IMMUTABLE), which matters for putting `aliases text[]` into `search_vector` (section 4.4).

---

## 1. Dependencies

### 1.1 Machine

| Tool | Installed | Notes |
|---|---|---|
| Node.js | v22.14.0 (`D:\Programs\node`) | Next 16 needs >= 20.9.0; iron-session 9 needs >= 22.13.0; vitest 5 needs `^22.12 \|\| ^24 \|\| >=26`; eslint 10 needs `^20.19 \|\| ^22.13 \|\| >=24`. All satisfied. |
| npm | 10.9.2 | Global prefix `%APPDATA%\npm` does not exist yet (no global packages have ever been installed; `npm ls -g` errors with ENOENT until the first `npm i -g`). |
| Claude CLI | not on PATH | see section 0 and 4.5 |

### 1.2 Every package in `package.json`

"Used" = imported from `src/` (grep of all non-relative imports; the complete list of external imports in `src/` is `next/server`, `next/link`, `next/navigation`, `react`, `react-swipeable`, `use-debounce`, `postgres`).

| Package | Declared | Installed | Latest stable | Used in `src/`? | Recommendation |
|---|---|---|---|---|---|
| `next` | ^15.3.0 | 15.3.0 | **16.4.6** | yes | **Upgrade** to 16.4.6 |
| `react` | ^18.2.0 | 18.3.1 | **19.3.1** | yes | **Upgrade** to 19.3.1 (Next 16 App Router requires React 19) |
| `react-dom` | ^18.2.0 | 18.3.1 | **19.3.1** | implicitly (Next) | **Upgrade** to 19.3.1 |
| `postgres` | ^3.4.5 | 3.4.5 | 4.1.1 (3.x line: 3.4.9) | yes (`src/db.js`) | **Keep on 3.x → 3.4.9.** 4.0.0 is 3.5 weeks old, ESM-only, removes `sql.array()`, and changes parameter typing (`infer: false`: the server decides parameter types; `Date` vs `timestamp` semantics changed). drizzle-orm's peer range is `>=3`, so 4.x installs, but Drizzle's postgres-js driver has not been exercised against it here. Revisit after the overhaul. Changelog: https://github.com/porsager/postgres/blob/master/CHANGELOG.md |
| `react-swipeable` | ^7.0.1 | 7.0.2 | 7.0.2 | yes (`MainPanel.js`, `TopPanel.js`) | **Keep.** Peer range includes `^19.0.0`. |
| `use-debounce` | ^10.0.4 | 10.0.4 | 10.1.1 | yes (`FormInput.js`) | **Keep / bump** to 10.1.1 (peer `react: *`). Becomes removable if live suggestions are dropped. |
| `dotenv` | ^16.5.0 | 16.5.0 | 18.0.10 | **no** | **Remove.** Next loads `.env*` itself; drizzle-kit loads `.env` itself (verified); scripts can use `process.loadEnvFile()` or `@next/env` (section 4.1). |
| `react-router-dom` | ^6.30.0 | 6.30.0 | 7.18.6 | **no** | **Remove** (CRA leftover) |
| `react-scripts` | ^5.0.1 | 5.0.1 | 5.0.1 | **no** | **Remove** (CRA leftover; drags in most of the 706 MB `node_modules` and old webpack/jest/eslint 8) |
| `@testing-library/jest-dom` | ^5.17.0 | 5.17.0 | 8.0.0 | **no** | **Remove** |
| `@testing-library/react` | ^13.4.0 | 13.4.0 | 16.3.3 | **no** | **Remove** |
| `@testing-library/user-event` | ^13.5.0 | 13.5.0 | 14.6.13 | **no** | **Remove** |
| `web-vitals` | ^2.1.4 | 2.1.4 | 6.2.3 | **no** | **Remove** |
| `@next/eslint-plugin-next` (dev) | ^15.3.4 | 15.3.4 | 16.4.6 | n/a (no ESLint config exists at all) | **Remove** as a direct dependency; it comes with `eslint-config-next`. |

### 1.3 Packages to add (all inside what UPGRADE_PROMPT.md section 3 allows)

| Package | Version today | Kind | Note |
|---|---|---|---|
| `typescript` | **6.0.3** (not 7.0.2) | dev | see section 0.3. Next 16.4 supports TS 7 through the `tsc` CLI (`node_modules/next/dist/docs/01-app/03-api-reference/05-config/02-typescript.md`), but typescript-eslint does not yet. |
| `@types/react`, `@types/react-dom` | 19.3.0 | dev | |
| `@types/node` | use `^22` to match the local runtime (latest is 26.6.6) | dev | |
| `sass` | 1.108.2 | dev | Next peer: `sass ^1.3.0` |
| `drizzle-orm` | **0.45.4** (`latest`) | prod | `1.0.0-rc.6` exists under the `rc` tag — do not use; note that parts of orm.drizzle.team already describe the 1.0 layout (section 4.1) |
| `drizzle-kit` | **0.31.11** (`latest`) | dev | |
| `iron-session` | 9.1.1 | prod | ESM-only, Node >= 22.13 |
| `zod` | 4.6.7 | prod | used by the site (request bodies) and the import script |
| `eslint` | **9.39.5** | dev | see section 0.4 |
| `eslint-config-next` | 16.4.6 | dev | brings `@next/eslint-plugin-next`, `typescript-eslint ^8.56`, react, react-hooks 7, jsx-a11y, import |
| `tsx` | 4.23.15 | dev | to run the TypeScript scripts (`import`, `set-password`). Alternative with no dependency: Node 22.14 cannot strip types without `--experimental-strip-types`, so `tsx` is the simple choice. Flag only; small utility. |
| test runner | see section 5 | dev | |

### 1.4 `package.json` blocks that are obsolete

- `eslintConfig` (`react-app`, `react-app/jest`) — CRA; references configs that will no longer be installed. Remove.
- `browserslist` — CRA. Next 16 with Turbopack has its own default targets (Chrome 111+, Edge 111+, Firefox 111+, Safari 16.4+). Remove.
- `.hintrc` (webhint editor config, also has a `browserslist`) — harmless editor file; optional to keep.
- `public/manifest.json` — still the CRA sample (`"name": "Create React App Sample"`, `"short_name": "React App"`). Replace with real values or delete (frontend agent's area; noted here because it is a CRA leftover).
- `public/robots.txt` — CRA default; fine to keep.

---

## 2. Upgrade path: Next 15.3 → 16.4.6, React 18.3 → 19.3

Sources:
- Next 16 upgrade guide: https://nextjs.org/docs/app/guides/upgrading/version-16
- Next 15 upgrade guide (React 19 + caching defaults, already in effect on 15.3): https://nextjs.org/docs/app/guides/upgrading/version-15
- Proxy file convention: https://nextjs.org/docs/app/api-reference/file-conventions/proxy
- Next 16.4 announcement: https://nextjs.org/blog/next-16-4
- React 19 upgrade guide: https://react.dev/blog/2024/04/25/react-19-upgrade-guide
- Version-matched docs ship inside the package: `node_modules/next/dist/docs/` (after install). Use these in later phases.

### 2.1 What affects this codebase

| Change | Status in this repo | Action |
|---|---|---|
| **Async request APIs are now mandatory** (sync access removed in 16): `params`, `searchParams`, `cookies()`, `headers()`, `draftMode()` | The four dynamic pages already do `await params` (`crew_member/[crew_member_id]`, `edit_ship_record/[record_id]`, `ship_record/[record_id]`, `subsystem/[subsystem_id]`). No `cookies()`/`headers()`/`searchParams` use today. | Nothing breaks. New code (`/search?q=`, iron-session) must `await searchParams` and `await cookies()`. Type pages with the generated helpers: `export default async function Page(props: PageProps<'/entry/[slug]'>)` — **verified** to typecheck. `PageProps`/`LayoutProps`/`RouteContext` are global types generated by `next dev`, `next build` or `npx next typegen`; a bare `tsc --noEmit` on a clean checkout needs `next typegen` first. |
| **Turbopack is the default for `next dev` and `next build`** | `dev` script is `next dev --turbopack`; no custom webpack config | Drop the flag: `"dev": "next dev"`. Build now uses Turbopack too (**verified**: `▲ Next.js 16.4.6 (Turbopack)`). |
| **`middleware` → `proxy`** (file `proxy.ts`, export `proxy`, Node.js runtime only, `runtime` config not allowed) | No middleware exists | If the auth workstream wants a request gate, it is `src/proxy.ts` (same level as `src/app`) — **verified** to build and show as `ƒ Proxy (Middleware)`. Docs explicitly say not to rely on Proxy alone for auth: verify the session inside every route handler / server action. |
| **`next lint` removed; `next build` no longer lints; `eslint` key in next.config removed** | No lint setup exists | Add `eslint.config.mjs` (flat config) and `"lint": "eslint ."` (snippet in section 2.3). |
| **ESLint flat config is the default** for `@next/eslint-plugin-next` | `package.json#eslintConfig` is legacy and unused | Remove the block; use flat config. |
| **React 19 required** | React 18.3.1 | Bump. Grep found no removed APIs: no `propTypes`/`defaultProps`, no string refs, no `ReactDOM.render`, no `forwardRef`, no `useFormState`. `<Context.Provider>` (used via `KeywordContext`) still works in 19 (`<Context>` is the new shorthand). `useRef()` now requires an argument in the React 19 types — relevant during the TS conversion. In React 19 `ref` is a normal prop (no `forwardRef` needed for the new `Button`). |
| **Caching defaults (changed in 15, unchanged in 16):** `fetch` not cached by default; `GET` route handlers not cached by default; client router cache does not reuse page segments on `<Link>` navigation | Already on 15.3, so current behaviour is already the new default. | Design note for the new code: pages that read Postgres through Drizzle (not `fetch`) are **prerendered as static at build time unless something makes them dynamic**. Pages that use `await params`, `await searchParams` or `await cookies()` are dynamic automatically. A page with none of those (e.g. `/` listing crew, or a queue page) will be frozen at build time unless it calls `await connection()` from `next/server` or exports `export const dynamic = 'force-dynamic'`. After a mutation call `revalidatePath()` or `refresh()` (new in 16, `next/cache`, server actions only). |
| `revalidateTag(tag)` single-argument form deprecated → `revalidateTag(tag, 'max')`; `updateTag()` new | not used | Only if tags are adopted. |
| **Cache Components** (`cacheComponents: true`, `'use cache'`) | not used | **Do not enable** as part of this upgrade. The guide says explicitly not to enable it "merely to complete the upgrade"; it changes the rendering model (uncached data outside `<Suspense>` becomes a build error). 16.4 recommends it for new apps, but it is opt-in. |
| **`next/image` defaults:** `images.qualities` default is now `[75]` only (other `quality` values are coerced); `imageSizes` no longer includes 16; `minimumCacheTTL` default 4 h; local `src` with a query string needs `images.localPatterns`; `priority` is superseded by `preload` (prefer `loading="eager"` / `fetchPriority="high"`) | `next/image` is not used at all today (plain CSS backgrounds / `<img>`) | When adopting `next/image` for textures/maps: if any image needs a quality other than 75, add `images: { qualities: [60, 75, 90] }`. Use `fill` + `sizes` for background-like images. |
| **`next/font`** (`@next/font` removed in 15) | `@font-face` in `src/components/Main/Main.css` pointing at `public/Hacked-KerX.ttf` | Move to `next/font/local` (section 4.3; **verified** with this exact TTF). |
| **Separate dev output dir** `.next/dev`; lockfile prevents two `next dev`/`next build` on one project | with `distDir: 'build'` this would be `build/dev` | Another reason to drop `distDir` (section 3). `tsconfig.json` `include` gets `.next/dev/types/**/*.ts` (Next writes this itself). |
| `scroll-behavior: smooth` on `<html>` is no longer overridden during navigation | check global CSS | If smooth scrolling is set globally and instant scroll-to-top on navigation is wanted, add `data-scroll-behavior="smooth"` to `<html>`. |
| Parallel routes need `default.js` | no parallel routes | n/a |
| AMP, `serverRuntimeConfig`/`publicRuntimeConfig`, `experimental.ppr`, `experimental.dynamicIO` removed | none used | n/a |
| `next build` no longer prints `Size` / `First Load JS` | n/a | Use `next analyze` (new command, Turbopack only) if bundle sizes are wanted. |
| Sass: `sass-loader` 16, modern Sass API; Turbopack does not support the `~` import prefix | no Sass yet | Use `@use`, never `@import '~…'` (section 4.3). |
| Minimum TypeScript 5.1; minimum Node 20.9 | n/a | satisfied |

Codemod, if wanted (run on the `overhaul` branch only): `npx @next/codemod@canary upgrade latest`. For this repo it would do little (no middleware, no lint script, no unstable APIs); a manual bump is just as easy.

### 2.2 `tsconfig.json` that Next 16.4.6 generates (verified), to be tightened

Next wrote this on first build; set `"strict": true` (it generates `false` when it creates the file), and add a path alias:

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": false,
    "noEmit": true,
    "incremental": true,
    "module": "esnext",
    "esModuleInterop": true,
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "plugins": [{ "name": "next" }]
  },
  "include": ["next-env.d.ts", ".next/types/**/*.ts", ".next/dev/types/**/*.ts", "**/*.mts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
```

Recommended edits: `"strict": true`, `"allowJs": false` once conversion is complete, `"noUncheckedIndexedAccess": true` (optional), `"paths": { "@/*": ["./src/*"] }`. `next-env.d.ts` is already git-ignored.

### 2.3 ESLint flat config (verified with eslint 10.15.0 + eslint-config-next 16.4.6; same file works on 9.x)

```js
// eslint.config.mjs
import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores(['.next/**', 'build/**', 'next-env.d.ts', 'drizzle/**']),
])
```

Scripts: `"lint": "eslint ."`, `"typecheck": "next typegen && tsc --noEmit"`. Docs: https://nextjs.org/docs/app/api-reference/config/eslint

---

## 3. Build and deploy

### 3.1 Findings

- `next.config.ts`: `distDir: 'build'` — makes Next write its build output to `./build` instead of `./.next`.
- `package.json` `start`: `npx serve@latest ./build` — a **CRA habit** (CRA's `build/` is a static site). A Next `distDir` is not a static site; `serve ./build` only serves raw build artefacts and cannot run the app (no SSR, no route handlers). The script is non-functional for this project.
- `.gitignore` ignores `/build` and `.next`. `git ls-files build` returns 0 files: the local `build/` (81 MB, a Next build from Jul 2025) is **not committed**, just a local artefact.
- `.gitignore` ignores **`package-lock.json`**; it exists locally (782 KB, Jun 2025) but is not tracked.
- No `vercel.json`, no `.vercel/` directory (the project was never linked with the Vercel CLI from this machine; settings live in the Vercel dashboard and could not be inspected).
- No `middleware`, no `tsconfig.json`/`jsconfig.json`, no ESLint config, no `engines` field.
- An untracked `.claude/` directory now exists in the repo root (created during this session by tooling, not by this agent); decide whether to git-ignore it.

### 3.2 What Vercel actually needs

Vercel's Next.js builder runs the install command, then `npm run build` (`next build`), and reads the output location from the Next config. It never runs the `start` script. So:

- `distDir` is **not needed** by Vercel; the deployment works with the default `.next`. It works today with `build` only because the builder honours `distDir`. It is a leftover from the CRA → Next migration (the bundled migration guide `node_modules/next/dist/docs/01-app/02-guides/migrating/from-create-react-app.md` suggests `distDir: './build'` to keep CRA's output folder).
- With no lockfile in the repo, Vercel falls back to npm and resolves **fresh versions on every deploy** ("When no lock file exists, Vercel uses npm by default", https://vercel.com/docs/package-managers). With caret ranges, each deploy can pick up different transitive versions than the ones tested locally. This is the real reproducibility problem.
- Node version: Vercel offers 22.x, 24.x, 26.x; **default is 26.x**; `engines.node` in `package.json` overrides the dashboard setting; a range like `>=22.0.0` resolves to the latest (26.x). https://vercel.com/docs/functions/runtimes/node-js/node-js-versions

### 3.3 Recommended changes

1. **Remove `distDir: 'build'`** from `next.config.ts` (use default `.next`). Keep `/build` in `.gitignore` for a while so the stale local folder is not committed; delete the local `build/` folder.
   - **Owner check required in the Vercel dashboard** (Settings → Build and Deployment): if "Output Directory" has an override set to `build`, it must be cleared (back to the Next.js default) in the same deploy. This could not be verified from here. If the owner prefers zero dashboard risk, keeping `distDir: 'build'` is harmless — but then the `.next/dev` separation becomes `build/dev` and every tool ignore list must name `build/`.
2. **`start`: `next start`**. Full script set:
   ```json
   {
     "dev": "next dev",
     "build": "next build",
     "start": "next start",
     "lint": "eslint .",
     "typecheck": "next typegen && tsc --noEmit",
     "test": "<runner, section 5>",
     "db:generate": "drizzle-kit generate",
     "db:migrate": "drizzle-kit migrate",
     "import": "tsx scripts/import.ts",
     "set-password": "tsx scripts/set-password.ts"
   }
   ```
3. **Stop ignoring `package-lock.json`; commit it.** Remove the line from `.gitignore`, regenerate the lockfile after the dependency changes (`npm install`), commit. Vercel then installs exactly the locked tree.
4. **Add `engines`**: `"engines": { "node": ">=22.13.0" }` (floor required by iron-session 9). Note this resolves to 26.x on Vercel while local is 22.14. To have Vercel match the local machine exactly use `"node": "22.x"`; to follow Vercel's default, upgrade local Node. Either is fine; just make it explicit. Owner decision, low stakes.
5. Do not add `vercel.json`; nothing needs it.
6. Environment variables that must exist in Vercel after the overhaul: `DATABASE_URL` (already there, presumably), `AUTH_PASSWORD_HASH`, `SESSION_SECRET`. Migrations must **not** run in the Vercel build (keep `build` as plain `next build`; migrations are applied from the owner's PC).
7. `.gitignore` additions: `backups/`, `.env*.local` already covered individually (add generic `.env*` with `!.env.example` if an example file is wanted), `*.tsbuildinfo`, `.next`.

---

## 4. Current-docs briefs

### 4.1 Drizzle ORM (0.45.4) + drizzle-kit (0.31.11) with postgres.js

Docs: https://orm.drizzle.team/docs/get-started/postgresql-new · https://orm.drizzle.team/docs/column-types/pg · https://orm.drizzle.team/docs/indexes-constraints · https://orm.drizzle.team/docs/guides/full-text-search-with-generated-columns · https://orm.drizzle.team/docs/guides/postgresql-full-text-search · https://orm.drizzle.team/docs/kit-custom-migrations · https://orm.drizzle.team/docs/drizzle-kit-migrate

**Docs/version caveat (verified):** some pages on orm.drizzle.team already show the 1.0 migration layout (one folder per migration, e.g. `drizzle/20242409125510_init/`) and mention `getColumns` (1.0 beta) instead of `getTableColumns`. With the `latest` packages (0.45.4 / 0.31.11) the actual output is the classic layout:

```
drizzle/0000_extensions.sql
drizzle/0001_init.sql
drizzle/meta/_journal.json
drizzle/meta/0000_snapshot.json
drizzle/meta/0001_snapshot.json
```

**Connection** (`drizzle-orm/postgres-js`):

```ts
// src/db/client.ts
import 'server-only'            // optional guard; needs the `server-only` package
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from './schema'

const globalForDb = globalThis as unknown as { pg?: ReturnType<typeof postgres> }
const client = globalForDb.pg ?? postgres(process.env.DATABASE_URL!, { max: 5 /*, prepare: false */ })
if (process.env.NODE_ENV !== 'production') globalForDb.pg = client   // survive HMR in dev

export const db = drizzle(client, { schema })
// one-liner alternative: export const db = drizzle(process.env.DATABASE_URL!, { schema })
```

- `prepare: false` is required when `DATABASE_URL` goes through a transaction-mode pooler (Supabase pooler port 6543, PgBouncer transaction mode, Neon pooled host). Agent B's report says what the host is; set accordingly.
- Scripts must call `await client.end()` or the process will not exit.

**Config (verified):**

```ts
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL! },
  // Safety: only ever look at the new tables, never the three legacy ones.
  tablesFilter: ['entities', 'entity_relations', 'import_sources'],
  // migrations: { table: '__drizzle_migrations', schema: 'drizzle' },  // defaults
})
```

- drizzle-kit loads `.env` on its own (**verified**: a config file saw a variable defined only in `.env` without any dotenv import). It does **not** load `.env.local`. `DATABASE_URL` is in `.env`, so no `dotenv` dependency is needed.
- For the project's own scripts: `process.loadEnvFile('.env')` (built into Node >= 20.12) or `import { loadEnvConfig } from '@next/env'; loadEnvConfig(process.cwd())` (loads `.env`, `.env.local` etc. with Next's precedence; `@next/env` is already a dependency of `next`).

**Workflow:**

| Command | Effect |
|---|---|
| `npx drizzle-kit generate --name=init` | Diffs `schema.ts` against the last snapshot in `drizzle/meta` and writes a new `.sql`. **Does not connect to the DB** (verified: ran with a dummy URL). |
| `npx drizzle-kit generate --custom --name=extensions` | Writes an empty `.sql` (content: `-- Custom SQL migration file, put your code below! --`) and registers it in the journal (verified). Use for `CREATE EXTENSION`, helper functions, data copy. |
| `npx drizzle-kit migrate` | Applies unapplied files in journal order; records them in `drizzle.__drizzle_migrations` (creates schema `drizzle` — an additive change the owner should see in the checkpoint). |
| `npx drizzle-kit push` | **Do not use here.** It diffs against the live DB; without the `tablesFilter` it would propose dropping tables it does not know. |
| `npx drizzle-kit check` | Validates the migration folder (verified to run). |

Order matters: the custom migration that creates `pg_trgm` (and any helper function) must be generated **before** the migration that uses `gin_trgm_ops`, so it gets the lower index. Statements inside a file are separated by `--> statement-breakpoint`.

Programmatic alternative (e.g. from a script that first takes the backup): `import { migrate } from 'drizzle-orm/postgres-js/migrator'; await migrate(db, { migrationsFolder: './drizzle' })` with a dedicated `postgres(url, { max: 1 })` client.

**Schema features needed (all verified to generate correct SQL with 0.45.4 / 0.31.11):**

```ts
// src/db/schema.ts
import { sql, type SQL } from 'drizzle-orm'
import {
  pgTable, pgEnum, customType, integer, text, jsonb, timestamp,
  index, uniqueIndex, primaryKey,
} from 'drizzle-orm/pg-core'

// tsvector is not built in
export const tsvector = customType<{ data: string }>({ dataType() { return 'tsvector' } })

export const entityType = pgEnum('entity_type', ['character', 'location', /* … */ 'other'])

export const importSources = pgTable('import_sources', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  filename: text().notNull(),
  contentHash: text('content_hash').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const entities = pgTable('entities', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  type: entityType().notNull(),
  name: text().notNull(),
  slug: text().notNull(),
  aliases: text().array().notNull().default(sql`'{}'::text[]`),          // text[]
  summary: text().notNull().default(''),
  body: text().notNull().default(''),
  attributes: jsonb().$type<Record<string, unknown>>().notNull().default({}), // jsonb
  sourceId: integer('source_id').references(() => importSources.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  searchVector: tsvector('search_vector').generatedAlwaysAs((): SQL => sql`
    setweight(to_tsvector('english', ${entities.name}), 'A') ||
    setweight(to_tsvector('english', immutable_array_to_string(${entities.aliases}, ' ')), 'A') ||
    setweight(to_tsvector('english', ${entities.summary}), 'B') ||
    setweight(to_tsvector('english', ${entities.body}), 'C')`),
}, (t) => [
  uniqueIndex('entities_slug_uq').on(t.slug),
  index('entities_search_idx').using('gin', t.searchVector),
  index('entities_name_trgm_idx').using('gin', t.name.op('gin_trgm_ops')),
  index('entities_name_lower_trgm_idx').using('gin', sql`lower(${t.name}) gin_trgm_ops`),
])

export const entityRelations = pgTable('entity_relations', {
  fromEntityId: integer('from_entity_id').notNull().references(() => entities.id, { onDelete: 'cascade' }),
  toEntityId: integer('to_entity_id').notNull().references(() => entities.id, { onDelete: 'cascade' }),
  kind: text().notNull(),
  note: text(),
}, (t) => [primaryKey({ columns: [t.fromEntityId, t.toEntityId, t.kind] })])
```

Generated SQL (excerpt, verbatim from the scratch run):

```sql
"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
"search_vector" "tsvector" GENERATED ALWAYS AS (
    setweight(to_tsvector('english', "entities"."name"), 'A') || …) STORED
CREATE UNIQUE INDEX "entities_slug_uq" ON "entities" USING btree ("slug");
CREATE INDEX "entities_search_idx" ON "entities" USING gin ("search_vector");
CREATE INDEX "entities_name_trgm_idx" ON "entities" USING gin ("name" gin_trgm_ops);
CREATE INDEX "entities_name_lower_trgm_idx" ON "entities" USING gin (lower("name") gin_trgm_ops);
```

Notes:
- The third table-builder argument returns an **array** (the object form is deprecated).
- Column names: pass the snake_case name explicitly (`text('content_hash')`) or set `casing: 'snake_case'` in both `drizzle()` and `defineConfig`.
- `immutable_array_to_string` in the example is a helper that must be created first in the custom migration (see 4.4). The generated SQL was produced by drizzle-kit but **not executed against a database** in this investigation.
- Changing a generated column's expression later means drop + re-add of the column (Postgres limitation); get the expression right in the first migration.
- Because the `search_vector` column is generated, never include it in inserts/updates; for selects that should not return it, list columns explicitly or use `getTableColumns(entities)` and omit it.

**Custom migration content (hand-written, for `0000_extensions.sql`):**

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION immutable_array_to_string(text[], text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$ SELECT array_to_string($1, $2) $$;
```

**Raw SQL / full-text queries:**

```ts
import { sql, desc, getTableColumns } from 'drizzle-orm'

// 1) inside the query builder
const tsq = sql`websearch_to_tsquery('english', ${q})`
const rows = await db
  .select({
    id: entities.id,
    name: entities.name,
    rank: sql<number>`ts_rank_cd(${entities.searchVector}, ${tsq})`.as('rank'),
    snippet: sql<string>`ts_headline('english', ${entities.body}, ${tsq}, 'MaxFragments=2, MaxWords=18, MinWords=6')`,
  })
  .from(entities)
  .where(sql`${entities.searchVector} @@ ${tsq}`)
  .orderBy(desc(sql`rank`))
  .limit(50)

// 2) fully raw (returns the postgres.js result: an array of row objects)
const result = await db.execute<{ id: number; name: string; score: number }>(sql`SELECT … WHERE name % ${q}`)
```

Values interpolated into `` sql`…` `` become bound parameters (safe); `sql.raw()` does not. Transactions: `await db.transaction(async (tx) => { … })`.

### 4.2 iron-session 9.1.1 with the Next 16 App Router

Docs: https://github.com/vvo/iron-session (README; v9: "needs Node 22.13 or later and is ESM-only"; "v9 reads v8 cookies") · https://nextjs.org/docs/app/api-reference/functions/cookies

```ts
// src/lib/session.ts
import 'server-only'
import { cookies } from 'next/headers'
import { getIronSession, type SessionOptions } from 'iron-session'

export type SessionData = { isLoggedIn?: boolean }

const THIRTY_DAYS = 60 * 60 * 24 * 30

export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET!,          // >= 32 characters, required
  cookieName: 'xaro_session',
  ttl: THIRTY_DAYS,                               // seconds; default is 14 days; never 0 for auth
  cookieOptions: {
    httpOnly: true,                               // default
    secure: process.env.NODE_ENV === 'production',// default is true → must be false on http://localhost
    sameSite: 'lax',                              // default
    path: '/',                                    // default
    // maxAge defaults to ttl - 60
  },
}

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions)   // cookies() is async in Next 15+/16
}
```

Use:

```ts
// Route Handler or Server Action — may read AND write
const session = await getSession()
if (!session.isLoggedIn) return Response.json({ error: 'unauthorized' }, { status: 401 })

session.isLoggedIn = true
await session.save()        // must be awaited before the response is sent

session.destroy()           // logout; synchronous; terminal (a later save() is ignored)
```

```ts
// Server Component — READ ONLY (Next does not allow setting cookies during render)
const session = await getSession()
const loggedIn = session.isLoggedIn === true
```

```ts
// src/proxy.ts — optional; v9 needs the adapter here
import { NextResponse, type NextRequest } from 'next/server'
import { getIronSession, nextProxyCookies } from 'iron-session'

export async function proxy(request: NextRequest) {
  const response = NextResponse.next()
  const session = await getIronSession<SessionData>(nextProxyCookies(request, response), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.redirect(new URL('/login', request.url))
  return response
}
export const config = { matcher: ['/import/:path*', '/entry/:slug/edit'] }
```

Points that matter here:
- The session is typed `Partial`-like on read (a new visitor has an empty object) — always check `=== true`.
- Reading the session calls `cookies()`, which makes the page/layout **dynamic**. If the root layout reads the session to show Add/Edit/Logout, every page becomes dynamic. Fine for this site (DB-backed, tiny), but be deliberate; the alternative is a small client component that asks `/api/session`.
- Server Actions are POSTs to the page route; a Proxy matcher does not cover them reliably. Per Next docs and UPGRADE_PROMPT 5.4, **check the session inside every mutating handler/action**; Proxy is at most a convenience redirect.
- Stateless: no server-side revocation. Changing `SESSION_SECRET` logs everyone out; rotation is supported with `password: { 2: new, 1: old }`.
- Cookie size limit ~4 KB; store only the flag.
- `sealData`/`unsealData` exist if a signed token is ever needed outside cookies.
- iron-session uses Web Crypto (`iron-webcrypto`), no native modules; works in route handlers and in Proxy (Node runtime in Next 16).
- `SESSION_SECRET` in `.env.local`: avoid `$` characters (Next expands `$VAR` in env files); generate hex/base64url.

### 4.3 SCSS modules in Next 16.4

Docs: https://nextjs.org/docs/app/guides/sass · upgrade-guide notes on Sass under Turbopack: https://nextjs.org/docs/app/guides/upgrading/version-16#sass-node_modules-imports

- Install: `npm i -D sass` (Dart Sass 1.108.2). Nothing else; `.module.scss` works out of the box under Turbopack (**verified**: build with `next@16.4.6`).
- Shared tokens/mixins with `@use` and a load path (**verified**):

```ts
// next.config.ts
import type { NextConfig } from 'next'
import path from 'node:path'

const nextConfig: NextConfig = {
  sassOptions: {
    loadPaths: [path.join(process.cwd(), 'src/styles')],
    // additionalData: `@use 'tokens' as *;`,   // optional auto-injection; see caveat
    // implementation: 'sass-embedded',          // optional faster compiler (extra package)
  },
}
export default nextConfig
```

```scss
// src/styles/_tokens.scss
$accent: #7CFF6B;
@mixin portrait { @media (orientation: portrait) and (max-width: 600px) { @content; } }

// src/components/X/X.module.scss
@use 'tokens' as t;          // resolved through loadPaths
.title { color: t.$accent; @include t.portrait { font-size: 1rem; } }
```

Caveats:
- **`@use '@/styles/tokens'` does not work** (**verified**: "Can't find stylesheet to import"). The TS path alias is not known to Sass. Use `loadPaths` or relative paths.
- The Webpack-era `~package` prefix is not supported by Turbopack.
- `@import` is deprecated in Dart Sass (removed in Sass 3.0) and prints deprecation warnings; use `@use`/`@forward` only. Global functions (`map-get`, `darken`, `percentage`…) are deprecated too: use `@use 'sass:map'`, `sass:color`, `sass:math`.
- `@use` rules must come first in a file. `additionalData` is prepended to every Sass file, including the partials themselves — if it is used to inject `@use 'tokens' as *;`, `_tokens.scss` would try to `@use` itself. Explicit `@use` per file is simpler and what was verified.
- A file that is `@use`d from many modules should contain only variables, mixins and functions — any real CSS in it is duplicated into every module's output. Put resets and `:root { --custom-properties }` in one global stylesheet (`src/app/globals.scss`) imported once from `layout.tsx`.
- Recommended split: Sass for breakpoints/mixins (media queries cannot use CSS variables), CSS custom properties on `:root` for colours/spacing/fonts so runtime theming (e.g. the *Devouring* look) is a class toggle.
- CSS Modules rule still applies: every selector in a `.module.scss` must contain at least one local class (no bare `body {}`/`html {}`), otherwise the build fails. The current global `Main.css` must become `globals.scss`.
- 16.4 shortens production CSS-module class names; never depend on generated class names.
- `:export { name: $value }` in a `.module.scss` exposes Sass values to TS.

**`next/font/local`** (verified with `public/Hacked-KerX.ttf` copied into the scratch app). Docs: https://nextjs.org/docs/app/api-reference/components/font

```tsx
// src/app/layout.tsx
import localFont from 'next/font/local'
import { IBM_Plex_Mono } from 'next/font/google'        // example secondary font; self-hosted at build time

const display = localFont({ src: '../fonts/Hacked-KerX.ttf', variable: '--font-display', display: 'swap' })
const body = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '600'], variable: '--font-body', display: 'swap' })

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" className={`${display.variable} ${body.variable}`}><body>{children}</body></html>
}
```

`src` is relative to the file calling `localFont`; move the TTF out of `public/` into `src/fonts/` (no need to serve it twice). Font loaders must be called at module scope with literal arguments. Then in SCSS: `font-family: var(--font-display), monospace;`. `next/font/google` downloads at build time, so the Vercel build needs network access to Google Fonts (it has it); no runtime requests to Google.

### 4.4 Postgres full-text search + pg_trgm

Docs: https://www.postgresql.org/docs/current/textsearch-controls.html · https://www.postgresql.org/docs/current/textsearch-indexes.html · https://www.postgresql.org/docs/current/pgtrgm.html · https://www.postgresql.org/docs/current/ddl-generated-columns.html

**Weighted generated column**

```sql
search_vector tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('english', name), 'A') ||
  setweight(to_tsvector('english', immutable_array_to_string(aliases, ' ')), 'A') ||
  setweight(to_tsvector('english', summary), 'B') ||
  setweight(to_tsvector('english', body), 'C') ||
  setweight(jsonb_to_tsvector('english', attributes, '["string"]'), 'D')
) STORED
```

- Generation expressions may use only **IMMUTABLE** functions. `to_tsvector('english', …)` with the config given explicitly is immutable (the one-argument form is not). **`array_to_string` is STABLE**, so it is rejected ("generation expression is not immutable"); wrap it in an IMMUTABLE SQL function (section 4.1) or keep a denormalised `aliases_text text` column. `jsonb_to_tsvector(regconfig, jsonb, jsonb)` should be accepted like the other two-argument `to_tsvector` forms — **confirm on the live server during the migration dry run** (on a scratch table or inside a transaction that is rolled back).
- Columns must be `NOT NULL DEFAULT ''` or wrapped in `coalesce(col, '')`; `NULL || tsvector` is `NULL`.
- Proper nouns and invented sci-fi names: the `english` config stems and drops stop words. Names such as "X'aro" or "Kodning" are safer if the name/aliases are indexed with the `simple` config (no stemming, no stop words) — e.g. `setweight(to_tsvector('simple', name), 'A')` — and queried with both configs. Planner's decision; flagging it.
- Index: `CREATE INDEX … USING gin (search_vector);`

**Query functions**

| Function | Use |
|---|---|
| `websearch_to_tsquery('english', $1)` | Safe for raw user input: never raises a syntax error. Supports `"quoted phrase"`, `or`, `-exclude`. No prefix matching. |
| `plainto_tsquery` / `phraseto_tsquery` | AND of all words / exact phrase. |
| `to_tsquery('english', 'kod:*')` | Needed for **prefix matching** (`:*`). Raises on malformed input, so build it from sanitised tokens only. |
| `ts_rank_cd(vector, query [, normalization])` | Cover-density rank; uses weights. Default weights `{D,C,B,A} = {0.1, 0.2, 0.4, 1.0}`; override with a first argument `'{0.05,0.2,0.5,1.0}'::float4[]`. Normalization `32` scales to 0..1 (`rank/(rank+1)`), useful when mixing with trigram scores. |
| `ts_headline('english', text, query, 'StartSel=<mark>, StopSel=</mark>, MaxFragments=2, MaxWords=18, MinWords=6, FragmentDelimiter=" … "')` | Snippets. Works on the **original text**, not the tsvector; expensive, so apply only to the rows of the final page (after `LIMIT`). The output is not HTML-escaped: escape the source text first or use unusual sentinel markers and convert them in code. |

**pg_trgm**

- `CREATE EXTENSION IF NOT EXISTS pg_trgm;` (a trusted extension since PG 13: a non-superuser with CREATE on the database can install it; Agent B's report covers whether the host allows it).
- `similarity(a, b)` → 0..1 for whole strings; operator `a % b` is true above `pg_trgm.similarity_threshold` (default 0.3).
- `word_similarity(query, text)` → best match of the query against any contiguous part of `text` (good for a short, mistyped query against a longer name); operator `query <% text`, threshold `pg_trgm.word_similarity_threshold` (default 0.6). `strict_word_similarity` / `<<%` respects word boundaries.
- Distance operators `<->`, `<<->` for `ORDER BY` (GiST only for index-ordered scans).
- `CREATE INDEX … USING gin (name gin_trgm_ops);` accelerates `%`, `<%`, `%>`, `LIKE`, `ILIKE`, and regex. To index case-insensitively use an expression index on `lower(name)` and query `lower(name) % lower($1)` (pg_trgm's similarity already ignores case by default, but the expression must match the index expression to be used).
- For aliases (`text[]`) index the flattened text: `gin (immutable_array_to_string(aliases, ' ') gin_trgm_ops)`.
- Trigram matching needs at least ~3 characters to be meaningful; for 1–2 character queries fall back to prefix `ILIKE`.

**Prefix matching ("kod" → "Kodning")**: sanitise in application code, then build a prefix tsquery from the last token:

```ts
const tokens = q.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
const prefixQuery = tokens.map((t) => `${t}:*`).join(' & ')      // only letters/digits reach to_tsquery
// SQL: to_tsquery('simple', ${prefixQuery})   — 'simple' so the partial word is not stemmed away
```

**Combining everything in one query**

```sql
WITH q AS (
  SELECT websearch_to_tsquery('english', $1)                     AS tsq,
         CASE WHEN $2 <> '' THEN to_tsquery('simple', $2) END    AS prefix_tsq,   -- $2 = 'kod:*' form, built in code
         lower($1)                                               AS raw
),
scored AS (
  SELECT e.id,
         ts_rank_cd(e.search_vector, q.tsq, 32)                              AS fts_rank,
         COALESCE(ts_rank_cd(e.search_vector, q.prefix_tsq, 32), 0)          AS prefix_rank,
         GREATEST(similarity(lower(e.name), q.raw),
                  word_similarity(q.raw, lower(e.name)),
                  word_similarity(q.raw, lower(immutable_array_to_string(e.aliases, ' ')))) AS trgm
  FROM entities e, q
  WHERE e.search_vector @@ q.tsq
     OR (q.prefix_tsq IS NOT NULL AND e.search_vector @@ q.prefix_tsq)
     OR lower(e.name) % q.raw
     OR q.raw <% lower(e.name)
     OR q.raw <% lower(immutable_array_to_string(e.aliases, ' '))
     -- AND ($3::entity_type IS NULL OR e.type = $3)   -- wrap the ORs in parentheses when adding filters
)
SELECT e.id, e.type, e.name, e.slug, e.summary,
       (s.fts_rank * 1.0 + s.prefix_rank * 0.6 + s.trgm * 0.8
        + CASE WHEN lower(e.name) = q.raw THEN 1 ELSE 0 END)    AS score,
       ts_headline('english', e.body, q.tsq,
                   'MaxFragments=2, MaxWords=18, MinWords=6')   AS snippet
FROM scored s
JOIN entities e ON e.id = s.id, q
ORDER BY score DESC, e.name
LIMIT 50;
```

Notes: the weights (1.0 / 0.6 / 0.8 / exact-name bonus) are starting points to be tuned against the 15 test queries of V4. `OR` across a GIN tsvector index and GIN trigram indexes is planned as a BitmapOr when the expressions match the index expressions exactly; with a few hundred rows a sequential scan is equally fine. If `prefix_tsq`/`tsq` is empty (query made only of stop words), `@@` simply matches nothing, and the trigram branch still works. For a "did you mean" on zero results: `SELECT name FROM entities ORDER BY lower(name) <-> lower($1) LIMIT 3`.

### 4.5 Claude Code CLI, headless mode

Docs: https://code.claude.com/docs/en/headless · https://code.claude.com/docs/en/cli-reference · https://code.claude.com/docs/en/authentication · https://code.claude.com/docs/en/setup

**State of this machine (verified):**

| Check | Result |
|---|---|
| `claude --version` (PATH) | `claude: command not found` in Git Bash; `where claude` finds nothing |
| Bundled binary | `%LOCALAPPDATA%\Claude-Data\claude_<id>\claude-code\2.1.330\<hash>\claude.exe` → `2.1.330 (Claude Code)`. Path is versioned and private to the desktop app; **do not hard-code it**. |
| Latest on npm | `@anthropic-ai/claude-code` 2.1.330 |
| `echo "Reply with the word OK" \| claude.exe -p --output-format json --tools "" --max-turns 1 --no-session-persistence` | **exit code 1**, stdout is still one JSON object, with `"is_error": true`, `"result": "Not logged in · Please run /login"`, `"subtype": "success"`, `"terminal_reason": "api_error"`. stderr empty. |
| Credentials | `%USERPROFILE%\.claude\.credentials.json` absent → the standalone CLI has never been logged in. The desktop app authenticates its own sessions differently. |

Caveat: the test was run from inside an agent session (many `CLAUDE_CODE_*` variables set). A fresh terminal may behave slightly differently, but with no credentials file the result will be the same.

**Owner prerequisites for `npm run import`** (to be stated in README and the final report):
1. Install the CLI: PowerShell `irm https://claude.ai/install.ps1 | iex` (native build, lands in `%USERPROFILE%\.local\bin\claude.exe`, auto-updates), or `winget install Anthropic.ClaudeCode`, or `npm install -g @anthropic-ai/claude-code@latest` (Node 22+).
2. Open a new terminal, run `claude` once and complete the browser login with the subscription account (or `claude auth login`). Check with `claude auth status --text`.
3. Alternative for unattended use: `claude setup-token` prints a one-year token; set it as `CLAUDE_CODE_OAUTH_TOKEN` (never commit it).
4. Make sure `ANTHROPIC_API_KEY` is **not** set in the environment: in `-p` mode a present API key is always used (and billed) in preference to the subscription.

**Flags for non-interactive use** (all present in this build's `--help`, except where noted):

| Flag | Meaning |
|---|---|
| `-p`, `--print` | Print response and exit. Skips the workspace-trust dialog. Without `--bare` it still loads hooks, plugins, MCP servers, CLAUDE.md and auto-memory from the working directory and `~/.claude`. |
| `--output-format text\|json\|stream-json` | `json` = one JSON object on stdout at the end. |
| `--input-format text\|stream-json` | default `text` |
| `--json-schema <schema>` | JSON Schema passed as a **string argument**; print mode only. Validated result appears in the top-level **`structured_output`** field. Invalid schema → exits with `Error: --json-schema is not a valid JSON Schema`. `format` keywords are not enforced. If the run ends without valid structured output the field is **absent** — check before use. |
| `--system-prompt <text>` / `--system-prompt-file <path>` | Replace the whole default system prompt. (`--system-prompt-file` is in the online reference; `--help` of 2.1.330 lists only `--system-prompt`. Not exercised.) |
| `--append-system-prompt <text>` / `--append-system-prompt-file <path>` | Append to the default prompt. Can be combined with `--system-prompt`. |
| `--tools <list>` | Restrict built-in tools: `""` = none, `"default"`, or names. Does not affect MCP tools. |
| `--disallowedTools "mcp__*"` | Removes all MCP tools as well. |
| `--allowedTools` | Auto-approve list (permission rules), **not** a restriction. Not needed when there are no tools. |
| `--strict-mcp-config` | Ignore all MCP servers except those passed with `--mcp-config` (pass none → no MCP). |
| `--setting-sources ""`/`user` | Limit which settings files load (`user,project,local`). |
| `--disable-slash-commands` | No skills/commands. |
| `--model <alias\|id>` | `sonnet`, `opus`, `haiku`, `fable` or a full model name. |
| `--fallback-model a,b` | Fallback chain when the main model is unavailable. |
| `--max-turns <n>` | Limit agentic turns (print mode). **In the online CLI reference; not listed in `--help` of 2.1.330**, but the binary accepted it without an "unknown option" error in the test above. With no tools, one turn is all there is anyway. |
| `--max-budget-usd <n>` | Spend cap (client-side estimate). |
| `--no-session-persistence` | Do not write the session transcript to disk (print mode). Good for bulk imports. |
| `--effort low\|medium\|high\|xhigh\|max` | Reasoning effort. |
| `--permission-mode`, `--permission-prompts none` | Irrelevant when no tools are available. |
| `--bare` | Minimal mode, but **never reads OAuth/subscription credentials** (API key only). **Do not use it** — the owner decided on subscription auth. Docs say `--bare` "will become the default for `-p` in a future release"; when that happens the script would need an explicit opt-out, so pin behaviour with the flags above and re-test after CLI updates. |
| `--safe-mode` | Disables all customisations (CLAUDE.md, skills, plugins, hooks, MCP) while keeping normal auth. A reasonable substitute for `--bare` with subscription auth. Present in `--help`; not exercised. |

**Prompt via stdin:** print mode reads piped stdin as the prompt (`cat file | claude -p`); if a prompt argument is also given, stdin is added as context. **Piped stdin is capped at 10 MB**; beyond that the CLI exits non-zero with an error. Windows command lines are limited to roughly 32 K characters, so the entity list + text **must** go through stdin, not `argv`. The practical limit is the model's context window, not stdin: chunk on paragraph boundaries (UPGRADE_PROMPT 5.2) and keep each call's prompt well under the context size (budget a few tens of thousands of words per chunk including the existing-entity list).

**JSON output shape (`--output-format json`)** — keys observed on this machine (2.1.330): `type` (`"result"`), `subtype`, `is_error`, **`result`** (the response text as a string), `session_id`, `uuid`, `num_turns`, `duration_ms`, `duration_api_ms`, `total_cost_usd`, `usage{input_tokens, output_tokens, cache_*…}`, `modelUsage{}`, `permission_denials[]`, `stop_reason`, `terminal_reason`, `api_error_status`, plus bookkeeping fields. With `--json-schema`, the validated object is in `structured_output` (per docs; not observed here because no model call succeeded).

**Exit codes / error handling:**
- 0 on success; non-zero when the run fails. Invalid flags → message on **stderr** before the run. Failures inside the run (e.g. not logged in) → the failure text is the **`result` on stdout** with `is_error: true` and exit code 1.
- **`subtype` was `"success"` even though the run failed** — do not use `subtype` to detect success. Check: exit code `=== 0` **and** `is_error === false` **and** (`structured_output` present, or `result` parses and passes zod).
- 143 when killed by SIGTERM.
- A login close to expiry prints `Warning: this sign-in …` on stderr (text output mode).

**Recommended invocation for the import script:**

```
claude -p --output-format json --model <alias> --tools "" --disallowedTools "mcp__*"
       --strict-mcp-config --disable-slash-commands --no-session-persistence
       --system-prompt-file <abs path to prompt file>
       [--json-schema <compact schema string>]
   < prompt on stdin
```

Two ways to get strict JSON, pick one in planning:
- (a) `--json-schema` with a schema derived from the zod schema (`z.toJSONSchema(schema)` in zod 4) and read `structured_output`; still validate with zod afterwards. Passing a large schema as an argument on Windows needs care (quotes): only possible without a shell (see below), and keep it compact. Docs describe it as output "after the agent completes its workflow"; whether it works with `--tools ""` is **untested** here (no login) — the import agent must test it first and fall back to (b).
- (b) No schema flag: instruct "reply with a single JSON object only", take `result`, strip an optional ```` ```json ```` fence, `JSON.parse`, validate with zod, retry up to 2 times feeding back the zod error. Simple and robust; this is what UPGRADE_PROMPT 5.2 describes.

Run the CLI with `cwd` set to an empty temp directory (e.g. `os.tmpdir()` sub-folder) so the repo's `CLAUDE.md`, `.claude/` settings and git status are not pulled into the context of an extraction call. `--system-prompt` (replace) rather than `--append-system-prompt` also removes the coding-agent prompt and saves tokens.

**Spawning from Node on Windows:**

```ts
import { spawn } from 'node:child_process'

function runClaude(prompt: string, args: string[], cwd: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const bin = process.env.CLAUDE_BIN ?? 'claude'            // override hook for odd installs
    const child = spawn(bin, args, { cwd, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = '', stderr = ''
    child.stdout.setEncoding('utf8').on('data', (d) => (stdout += d))
    child.stderr.setEncoding('utf8').on('data', (d) => (stderr += d))
    child.on('error', reject)                                  // ENOENT → "Claude CLI not found, install it …"
    child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }))
    child.stdin.end(prompt, 'utf8')                            // write the whole prompt, then close stdin
  })
}
```

- Native installer and WinGet provide a real **`claude.exe`** on PATH → `spawn('claude', …, { shell: false })` works and arguments need no quoting (Node passes them as an array).
- An **npm global install** exposes the command through npm's bin shims (`claude.cmd` in `%APPDATA%\npm`). Node refuses to spawn `.cmd`/`.bat` files without a shell (EINVAL, since the 2024 security fix) and `spawn('claude')` without a shell does not resolve `.cmd` at all. Not verified on this machine (nothing is installed globally). Handle it by: recommending the native installer in the README, supporting `CLAUDE_BIN` (full path to `claude.exe`), and on `ENOENT` printing an actionable message. Avoid `shell: true`: with a shell, JSON arguments (`--json-schema`) and prompts containing `"`, `%`, `^`, `&` get mangled by cmd.exe quoting.
- Always send the prompt through **stdin** and close it (`stdin.end`) — the CLI waits for EOF.
- Set a timeout (e.g. 10 min per chunk) and kill the child on expiry; treat as a retryable failure.
- Strip `ANTHROPIC_API_KEY` from the child's `env` so the subscription is used; leave `CLAUDE_CODE_OAUTH_TOKEN` if present.
- stdout may be large; collect it fully before `JSON.parse`. Decode as UTF-8 explicitly.
- Calls are sequential by default; subscription rate limits apply, so do not parallelise chunks aggressively. `system/api_retry` events are only visible in `stream-json` mode; with `json` the CLI retries internally.

---

## 5. Test tooling (flag only — no decision)

The project has no tests. Needs: unit tests of pure TS functions (weapon creator golden-file comparison, chunking/merge logic, zod schemas, slugging, password hashing). No DOM tests are required by UPGRADE_PROMPT.md.

| Option | Version | Trade-off |
|---|---|---|
| **Vitest** | 5.1.1 (needs Node `^22.12 \|\| ^24 \|\| >=26` — OK locally) | One dev dependency; runs TS and ESM directly, `tsconfig` path aliases via one config line, snapshot/golden-file helpers (`toMatchFileSnapshot`), watch mode, familiar `describe/it/expect`. Adds Vite as a transitive dependency (dev only, not in the Next build). The usual choice for this kind of project. |
| **`node:test` + `tsx`** | built in (Node 22.14) + tsx 4.23.15 (already wanted for scripts) | Zero additional dependency if `tsx` is installed anyway: `node --import tsx --test "src/**/*.test.ts"`. Assertions through `node:assert/strict`; snapshot support exists but is basic; no path-alias resolution beyond what tsx gives (tsx does honour `tsconfig` paths); less ergonomic output. |
| `node:test` with native type stripping | Node 22.14 needs `--experimental-strip-types` (unflagged from 22.18 / 23.6) | No dependency at all, but experimental on the installed Node, no path aliases, no enums/decorators/`paths`. Not recommended on this Node version. |
| Jest | — | Needs Babel/ts-jest/SWC transform plus ESM workarounds (iron-session 9 and postgres 4 are ESM-only). Heavier for no benefit here. Not recommended. |
| Playwright (`@playwright/test`) | — | Only if browser E2E is wanted as a repeatable suite. Phase 5 V2 uses agent-driven browser checks, so it is not required. Would be a new technology → ask the owner. |

A test runner is arguably a "small utility needed to implement" the required `test` script, but it is not named in UPGRADE_PROMPT.md section 3; flagging it for the orchestrator/owner. Either of the first two rows satisfies section 8's golden-file requirement. `eslint-config-next` needs no changes for either.

---

## 6. Target versions (summary table)

| Package | Target |
|---|---|
| next | 16.4.6 |
| react / react-dom | 19.3.1 |
| typescript | 6.0.3 |
| @types/react / @types/react-dom | 19.3.0 |
| @types/node | ^22 |
| sass | 1.108.2 |
| postgres | 3.4.9 (stay on 3.x) |
| drizzle-orm / drizzle-kit | 0.45.4 / 0.31.11 |
| iron-session | 9.1.1 |
| zod | 4.6.7 |
| eslint / eslint-config-next | 9.39.5 / 16.4.6 |
| react-swipeable | 7.0.2 |
| use-debounce | 10.1.1 |
| tsx | 4.23.15 |
| vitest (if chosen) | 5.1.1 |
| Remove | react-scripts, react-router-dom, @testing-library/* (3), web-vitals, dotenv, direct @next/eslint-plugin-next |

## 7. Not verified / open points

- Vercel dashboard settings (Output Directory override, Node version, env vars) — no `.vercel/` link, not inspectable. Owner must check the Output Directory override when `distDir` is removed.
- No successful Claude model call was made (CLI not logged in): `structured_output` with `--json-schema`, behaviour of `--json-schema` together with `--tools ""`, and `--system-prompt-file` are documented but untested here.
- Whether an npm-global install on Windows yields `claude.exe` or only `claude.cmd` on PATH.
- The generated Drizzle migration SQL was produced but not executed on any database; immutability of `jsonb_to_tsvector(...)` in a generated column should be confirmed in the dry run.
- drizzle-orm 0.45.4 against postgres.js 4.x was not tested (recommendation is to stay on 3.4.9).
- Scratch verification used ESLint 10.15.0; the recommendation is 9.39.5 (same flat config, within every plugin's declared peer range) — not separately run.
