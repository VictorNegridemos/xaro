# Phase 5 verification, iteration 1: V3 (auth and security)

Verifier: `v3`. Date: 2026-11-24. Branch `overhaul` at `0650406`. Target: the shared `next dev` on http://localhost:3000. For the checks that need a different environment (no `proxy.ts`, missing secrets, changed password), I used a scratch clone of the branch on port 3133. That clone had its own `npm ci` and copied `.env`/`.env.local`, and I deleted it afterwards.
Scripts and raw outputs are in the scratchpad folder `…/scratchpad/v3/` (`p1-endpoints.mjs`, `p1b.mjs`, `p2-login.mjs`, `p3-flow.mjs`, `p3b-flow.mjs`, `clone-check.mjs`, `run-clone.sh`, `secrets.mjs`, `logscan.mjs`, `xfh.mjs`, `db.mjs` and the `*.out` files). Every HTTP check uses Node `fetch` with `redirect: 'manual'` and its own `X-Forwarded-For` (198.51.100.31–39). The password was read from `.secrets/initial-password.txt` inside the scripts. It was never printed.

## Result

- **Scripted checks: 271 PASS, 0 security FAIL.** p1 116+13, p2 67, p3/p3b 32 (after a retry), clone 43.
- On top of that: unit tests 64/64, secret scans 5/5, a code review of the production `Secure` flag, and the DB before/after comparison. All pass.
- **5 transient failures** in the first flow run (`p3.out`): `DELETE /api/entries/60` → 503 `database_unavailable`, then `/entry/<slug>` → 500, a second DELETE → 503 and a create → 503, all within a few seconds. A retry a minute later (`p3b.out`) passed every step. The cause is unknown (other verifiers were writing to the same production database at the same time). The handlers failed safe: no partial write, and the row was still intact. This is not counted as a security failure, but it is recorded as observation O1.
- No FAIL needs a fix in this scope. Observations O1–O5 are listed at the end.

## 1. Inventory of handlers

`find src/app -name route.ts` gives 7 route files. `grep -rln "use server" src` finds nothing, so there are **no server actions**. `src/proxy.ts` is the only interceptor.

| Route | Methods | Mutates | Guard (first line) |
|---|---|---|---|
| `src/app/api/auth/login/route.ts` | POST | yes (throttle row, cookie) | `checkSameOrigin`, then `getAuthConfig` (503), then `readJsonBody(2048)` + zod, then throttle, then scrypt (`src/lib/auth/login-handler.ts:32-69`) |
| `src/app/api/auth/logout/route.ts` | POST | yes (cookie) | `checkSameOrigin` |
| `src/app/api/entries/route.ts` | POST | yes | `requireApiAuth` (`src/lib/entries/handlers.ts:36`) |
| `src/app/api/entries/[id]/route.ts` | PUT, DELETE | yes | `requireApiAuth` (`handlers.ts:50,67`) |
| `src/app/api/import/route.ts` | POST | yes | `requireApiAuth` (`src/lib/import/handlers.ts:30`) |
| `src/app/api/import/[id]/route.ts` | DELETE | yes | `requireApiAuth` (`handlers.ts:51`) |
| `src/app/api/search/route.ts` | GET | no | public |

Pages that call `requirePageAuth` as their first await: `src/app/entry/new/page.tsx:14`, `src/app/entry/[slug]/edit/page.tsx:20`, `src/app/import/page.tsx:19`. The code has no `dangerouslySetInnerHTML`, `innerHTML` or `eval(` (grep over `src`).

## 2. Mutating endpoints: auth, Origin, methods, bodies (`p1-endpoints.mjs`, `p1b.mjs`)

For each of `POST /api/entries`, `PUT /api/entries/999999`, `DELETE /api/entries/999999`, `POST /api/import` and `DELETE /api/import/999999`:

| Check | Expected | Actual | |
|---|---|---|---|
| valid Origin, no cookie | 401 | 401 `unauthorized` ×5 | PASS |
| valid Origin, garbage cookie | 401 | 401 ×5 | PASS |
| foreign Origin `https://evil.example`, no cookie | 403 | 403 `bad_origin` ×5 | PASS |
| foreign Origin + valid cookie | 403 | 403 ×5 | PASS |
| **no Origin** + valid cookie (plan 5.8: Origin required for non-GET) | 403 | 403 ×5 | PASS |
| `Origin: null` + valid cookie | 403 | 403 ×5 | PASS |
| valid Origin + `Sec-Fetch-Site: cross-site` + valid cookie | 403 | 403 ×5 | PASS |
| `Origin: http://localhost:3000.evil.example` + cookie | 403 | 403 ×5 | PASS |
| `Origin: http://localhost:3001` (other port) + cookie | 403 | 403 ×5 | PASS |
| valid session, unknown id (PUT/DELETE entries, DELETE import) | passes auth, 404 | 404 ×3 | PASS |
| valid session `POST /api/import` `zz-verify-v3-upload.txt` | 201 | 201, id 2, `pending` | PASS |
| valid session `DELETE /api/import/2`, then again | 200, 404 | 200 `{deleted:true}`, 404 | PASS |

Login and logout (Origin check only):

| Check | Expected | Actual | |
|---|---|---|---|
| login, foreign Origin / no Origin | 403 | 403 / 403 | PASS |
| logout, foreign Origin | 403, cookie not cleared | 403, no Set-Cookie | PASS |
| logout, no Origin | 403 | 403 | PASS |
| logout, valid Origin | 200, cookie cleared | 200 `xaro_session=; Path=/; Max-Age=0; HttpOnly; SameSite=lax` | PASS |
| logout with no cookie | 200 (idempotent) | 200 | PASS |

Method confusion (with a valid session): GET/PATCH `/api/entries`, GET/PATCH/POST `/api/entries/1`, GET/PUT `/api/import`, GET/PATCH `/api/import/1`, GET/PUT `/api/auth/login`, GET/DELETE `/api/auth/logout`, POST/DELETE `/api/search`. All 15 returned **405**: PASS. HEAD `/api/entries` gave 405. OPTIONS gave 204 `Allow: OPTIONS, POST` with no `Access-Control-Allow-Origin`. A preflight from a foreign Origin also got no ACAO/ACAC header: PASS (no CORS opening).

Bodies (with a valid session):

| Check | Expected | Actual | |
|---|---|---|---|
| Content-Type `text/plain`, form-urlencoded, multipart, none (entries POST, PUT; import POST) | 415 | 415 ×12 | PASS |
| `{bad json`, empty body | 400 `invalid_json` | 400 ×6 | PASS |
| `null`, `[]`, `"str"`, `{"__proto__":{…}}` | 400 `invalid_body` | 400 ×12 | PASS |
| unknown fields `slug`, `id`, `legacy_table` | 400 | 400 `Unknown field: slug, id, legacy_table` (entries); `Unrecognized keys` (import) | PASS |
| PUT ids `0`, `-1`, `abc`, `1e3`, `9999999999`, `1%20OR%201=1`, `..%2F1` | 404, never 500 | 404 ×7 | PASS |
| POST entries, 700 kB JSON (with Content-Length) | 413 | 413 `payload_too_large` | PASS |
| POST entries, 800 kB **chunked** (no Content-Length) | 413 | 413 `{limit:600000}` | PASS |
| POST entries, body of 100,001 characters (below the byte cap) | 400 field error | 400 `The text may hold at most 100,000 characters.` | PASS |
| POST import, 1.6 MB | 413 | 413 `payload_too_large` | PASS |
| POST import, 1.1 MB content (below the request cap) | 413 | 413 `file_too_large` | PASS |
| POST entries, 700 kB **without a cookie** | 401 (auth before body) | 401 | PASS |
| import filename `../x.txt`, `.exe`, NUL, `C:\x.txt`, leading space | 400 | 400 ×5 | PASS |

Note: after the chunked 413 the server closed the socket. Node's keep-alive pool then reused that socket for the next request and got `ECONNRESET`. That is client-side; the server stayed up (`/` 200), and I reran the remaining checks in `p1b.mjs`.

## 3. Protected pages and open redirect (`p2-login.mjs`, `clone-check.mjs noproxy`)

| Check | Expected | Actual | |
|---|---|---|---|
| logged out GET `/entry/new`, `/entry/k82aca/edit`, `/import`, `/import/anything`, `/entry/new?x=1` | redirect `/login?next=…` | 307 `/login?next=%2Fentry%2Fnew` etc. ×5 | PASS |
| logged out, proxy-matcher evasion: `/entry/k82aca/%65dit`, `/entry/%6eew`, `/%69mport`, `x-middleware-subrequest: src/proxy:…` (CVE-2025-29927 style), `RSC: 1`, `?_rsc=` + prefetch, `/entry/new/`, `/Import` | redirect or 404, never the form | 307 to login ×6, 308 `/entry/new` (trailing slash), 404 (`/Import`); no form in any body | PASS |
| logged in, same three pages | 200 | 200 ×3 | PASS |
| **scratch clone with `src/proxy.ts` deleted**, logged out, the three pages | still redirect (page-level check) | 307 `/login?next=…` ×3 | PASS |
| same clone, valid session | 200 | 200 ×3 | PASS |
| logged in `GET /login?next=X` for X = `//evil.example`, `/\evil.example`, `https://evil.example`, `%2F%2Fevil.example`, `javascript:alert(1)`, `/%2F%2Fevil.example`, `%2F%5Cevil.example`, `/%09/evil.example`, `///evil.example`, `http:evil.example` | same-origin redirect to `/` | 307 `Location: /` ×10 | PASS |
| `GET /login?next=/%252F%252Fevil.example` | same-origin | 307 `Location: /%2F%2Fevil.example` (a path on this site; the browser does not decode it into `//`) | PASS |
| `GET /login?next=/entry/new` | 307 `/entry/new` | 307 `/entry/new` | PASS |
| `POST /api/auth/login` with `next` = `//evil.example`, `https://evil.example`, `/\evil.example`, `%2F%2Fevil.example`, `javascript:alert(1)`, `/\tevil`, ` //evil.example` | response `next: "/"` | `/` ×7 | PASS |
| `next` `/search?q=x` | kept | `/search?q=x` | PASS |

`LoginForm.tsx` navigates only to the `next` returned by the server. The server applies `safeNextPath` (`src/lib/auth/origin.ts:31-37`), and the page applies it again.

## 4. Login, throttle, cookie (`p2-login.mjs`)

| Check | Expected | Actual | |
|---|---|---|---|
| 5 wrong passwords, XFF 198.51.100.32 | 401 ×5, no cookie | 401 `invalid_credentials` ×5 | PASS |
| 6th wrong | 429 + Retry-After | 429 `throttled`, `Retry-After: 894` | PASS |
| `auth_throttle` row for that bucket (HMAC computed by the script) | failures 6 | `failures: 6` | PASS |
| correct password as the 7th attempt | 429 (by design) | 429, `Retry-After: 892`, no cookie | PASS |
| malformed bodies (XFF .33): 3,000-byte password, 201-character password, not JSON, text/plain, empty password, number, `next` of 300 characters | 413/400/415, **no throttle row** | 413, 400, 400, 415, 400, 400, 400; bucket row absent | PASS |
| correct password (XFF .34) | 200 + cookie | 200 `{ok:true,next:"/"}` | PASS |
| cookie attributes | HttpOnly, SameSite=Lax, Path=/, about 30 days | `Path=/; Max-Age=2591940; HttpOnly; SameSite=lax` (30 days minus iron-session's 60 s skew) | PASS |
| `Secure` on `next dev` over http | absent (expected) | absent | PASS |
| `Secure` in production | `secure: true` when `NODE_ENV=production` | `src/lib/auth/session-options.ts:20` `secure: process.env.NODE_ENV === 'production'`. Run with tsx: production → `{"httpOnly":true,"secure":true,"sameSite":"lax","path":"/"}`, development → `secure:false`. **Not testable over HTTP on the dev server.** | PASS (code) |
| bucket after a successful login | removed | removed | PASS |
| logout | 200, `Max-Age=0` | yes | PASS |
| own buckets cleared (targeted `DELETE … WHERE bucket = ANY(…)`, not the global `--throttle`) | 0 | 0 for .31–.39 | PASS |

## 5. Session integrity and binding to the password hash

How the code enforces it: `startSessionWith` stores `pw = first 16 hex chars of SHA-256(AUTH_PASSWORD_HASH)` (`src/lib/auth/config.ts:18-20,39`, `session.ts:30-33`). `isSessionValid` requires `isLoggedIn === true` and `pw` equal to the fingerprint of the current hash (`session-options.ts:25-27`). It is used by `isLoggedInWith` (and so by `requireApiAuth`, `requirePageAuth` and the layout) and by `proxy.ts:20`.

Tests: I sealed forged cookies with iron-session 9.1.1 from the project, using the real `SESSION_SECRET` inside the script. Each one was sent to `PUT /api/entries/999999` and `GET /entry/new`.

| Forged cookie | Expected | Actual | |
|---|---|---|---|
| correct secret + correct `pw` (control) | PUT 404 (auth ok), page 200 | 404 / 200 | PASS |
| correct secret + `pw` of a different hash | 401 / redirect | 401 / 307 | PASS |
| correct secret + no `pw` | 401 / redirect | 401 / 307 | PASS |
| correct secret + `isLoggedIn: "true"` (string) | 401 / redirect | 401 / 307 | PASS |
| correct secret + `isLoggedIn: false` | 401 / redirect | 401 / 307 | PASS |
| wrong secret + correct `pw` | 401 / redirect | 401 / 307 | PASS |
| real cookie with one character flipped (tampered) | 401 / redirect | 401 / 307 | PASS |
| **real password change (plan row):** in the clone, `npm run set-password -- --generate --out <scratch>` (hash changed, `SESSION_SECRET` kept, checked by script), restart, old valid cookie | all five mutating APIs 401, `/entry/new` redirect, `/login` shows the form | 401 ×5, 307, form | PASS |

## 6. Fail-closed (clone with `.env.local` edited; unit tests)

Code: `getAuthConfig` (`config.ts:31-40`) returns `ok:false` for a missing or short secret and a missing or malformed hash. `isLoggedIn`/`isLoggedInWith` return false without calling iron-session. `handleLogin` returns 503 (`login-handler.ts:35-36`). `endSession` deletes the cookie (`session.ts:71-72`). `proxy.ts` redirects. The `/login` page shows the "not configured" state (`login/page.tsx:29-40`).

| Condition (clone restarted each time) | public `/`, `/search?q=warp`, `/entry/k82aca` | `/login` | login POST | 5 mutating APIs with a previously valid cookie | `/entry/new` | |
|---|---|---|---|---|---|---|
| `SESSION_SECRET` removed | 200 ×3 | 200, "Authentication is not configured" | 503 `auth_not_configured` | 401 ×5 | 307 | PASS |
| `AUTH_PASSWORD_HASH` removed | 200 ×3 | 200, not configured | 503 | 401 ×5 | 307 | PASS |

The server log printed `[auth] not configured: SESSION_SECRET is not set…` / `AUTH_PASSWORD_HASH is not set…` with no value in it. Logout with no configuration gave 200.
Unit tests (clone): `node --import tsx --test "src/lib/auth/**/*.test.ts" src/components/auth/messages.test.ts scripts/set-password.test.ts src/lib/entries/handlers.test.ts src/lib/import/handlers.test.ts` gave **64/64 pass**. This includes "fail closed without SESSION_SECRET…", "fail closed without AUTH_PASSWORD_HASH…" and "pw check: a session sealed under password hash A is rejected under hash B and accepted again under A". `proxy.test.ts` is 3/3 (it failed only while I had deleted `proxy.ts` in the clone; it passes once the file is restored).

## 7. Secrets (`secrets.mjs`, values compared in-process, never printed)

| Check | Actual | |
|---|---|---|
| `git log -p --all` (7.3 MB, every branch), searched for the password (with and without hyphens), the full hash, its digest, `SESSION_SECRET`, `DATABASE_URL`, the DB password | 0 matches | PASS |
| plan pattern `AUTH_PASSWORD_HASH=.+\|SESSION_SECRET=.+\|postgres(ql)?://` | 9 hits, all code/doc templates (`=${result…}`, `=old`, the plan's own grep line). One hard-coded `postgres://…@localhost:5432/xaro_db`, added in `dfb6fab` (2025-04-19, on `main`) and removed in `7ee8de4`: a local development URL from before the overhaul, not the production one (see O4) | PASS |
| every non-ignored working-tree file (310, docs/ included) | 0 matches | PASS |
| `backups/`, `.next/static`, `.next/dev/static`: secret values; `.next/**` also env names / `scrypt:` | 0 | PASS |
| served HTML of `/`, `/login`, `/search?q=warp`, `/entry/k82aca`, `/kodning_weapon_creator` plus all 36 referenced `/_next/static` chunks: values and the strings `SESSION_SECRET`, `AUTH_PASSWORD_HASH`, `DATABASE_URL`, `postgres://`, `scrypt:` | 0 | PASS |
| server logs: my clone server logs (4 runs incl. failed logins and fail-closed) and all script outputs; plus the retained log of the earlier `xaro-dev` preview server (`postgres` search, errors) | 0 secret values, no URL. I had no access to the log of the server currently on :3000 (not started via preview) | PASS (partial) |

## 8. XSS (`p3-flow.mjs`)

I created entry id 60 as an authenticated user. Its name was `zz-verify-v3-xss <script>alert(1)</script><img src=x onerror=alert(2)>`, its aliases had `<b onmouseover=…>` and `"><svg onload=…>`, its summary had an `<iframe src=javascript:…>`, its body had `<script>`, `<img onerror>`, a markdown `javascript:` link and `</textarea><a href="javascript:…">`, and its attributes had `<img onerror>` and `javascript:alert(11)`. Each page was scanned for the raw strings `<script>alert(`, `<img src=x`, `<b onmouseover`, `<svg onload`, `<iframe` and `href="javascript:` (also `'`/unquoted forms) anywhere in the HTML, including the inline RSC payload.

| Page | Actual | |
|---|---|---|
| `/entry/<slug>` logged out | 200, 0 raw hits, name shown as `&lt;script&gt;alert(1)&lt;/script&gt;` | PASS |
| `/entry/<slug>` logged in (Edit/Delete controls) | 0 raw hits | PASS |
| `/entry/<slug>/edit` (values in inputs/textarea) | 0 raw hits | PASS |
| `/search?q=` `zzqv3marker`, `zz-verify-v3-xss`, `<script>alert(1)</script>`, `"><img src=x onerror=alert(1)>`, `onerror` | 200, 0 raw hits, entry found | PASS |
| `/api/search?q=…` (same five) | `application/json`, `X-Content-Type-Options: nosniff` | PASS |

The slug was derived safely (`zz-verify-v3-xss-script-alert-1-script-img-src-x-onerror-alert-2`).

## 9. Full flow over HTTP (`p3-flow.mjs`, `p3b-flow.mjs`)

| Step | Actual | |
|---|---|---|
| login → create (201, id 60) → edit (PUT 200, slug unchanged, page shows the edit) | as expected | PASS |
| delete id 60, first attempt | **503 `database_unavailable`**, page 500, second DELETE 503, next create 503 (O1) | transient |
| retry: login → DELETE 60 | 200 `{deleted:true,id:60}` | PASS |
| `/entry/<slug>` after delete | 404 | PASS |
| search no longer lists it; DELETE again | not listed; 404 | PASS |
| create `zz-verify-v3-flow` (201, id 93) → edit (200) → logout (200) | as expected | PASS |
| PUT with the cookie a browser keeps after logout (cleared) / with no cookie | 401 / 401 | PASS |
| PUT replaying the **pre-logout cookie value** | 200 (O2) | note |
| fresh login → delete id 93 | 200 | PASS |

## 10. Clean-up and database proof

- Starting snapshot (read-only transaction; columns without `updated_at`/`search_vector` for all entities, and with `updated_at` for the legacy-copied rows): entities **49**, md5 `32adae1b243a4e3e7415c1858c5183aa`; legacy-copied rows (`legacy_table IS NOT NULL`) **49**, md5 `d6f38ffa2328a7877bd34e7a71c8c744`; relations 0; import_sources 0; auth_throttle 0.
- Final snapshot: **identical in every value** (entities 49 / `32adae1b…`, legacy 49 / `d6f38ffa…`, relations 0, import_sources 0, auth_throttle 0).
- `entities WHERE name ILIKE 'zz-verify-v3-%'`: 0. `import_sources WHERE filename ILIKE 'zz-verify-v3-%'`: 0. My buckets (XFF .31–.39): 0 rows.
- Rows I wrote: entities 60 and 93 (deleted through the API), import_sources 2 (deleted through the API), and throttle buckets (deleted with a targeted DELETE). I wrote nothing to `crew_members`/`ship_subsystems`/`ship_records`, ran no schema command and never printed `DATABASE_URL`.
- The scratch clone (with its copied `.env`/`.env.local` and the throwaway password file) is deleted, and port 3133 is free. I changed no file in D:\React\xaro except this report.

## Observations (no fix required in V3 scope; owner may decide)

- **O1 (transient, not reproduced): 503 `database_unavailable` and a 500 page for a few seconds.** It happened during the first flow run on :3000 at the same time as other verifiers' DB writes. The handlers returned 503 without partial writes (`src/lib/entries/handlers.ts:21-24`), and a retry one minute later passed. Worth a look by V2/V4 if they saw the same thing: the entry page answers 500 rather than a friendly error while the DB is unreachable.
- **O2 (design, accepted by plan 5.6 "Stateless"): logout does not revoke a copied cookie.** `POST /api/auth/logout` clears the browser's cookie, but a saved copy of the old value still works for up to 30 days (verified: PUT 200 after logout). Sessions are revoked by changing the password (verified) or `SESSION_SECRET`. A suggestion, if wanted: store a server-side "logged out before" timestamp, or shorten the TTL. Severity if treated as a defect: minor.
- **O3 (deployment assumption): client-supplied headers.** The throttle bucket comes from `x-real-ip`, then `x-forwarded-for` (`src/lib/auth/throttle.ts:28-33`). The same-origin check compares Origin with `x-forwarded-host`, then `host` (`src/lib/auth/origin.ts:20`). On a bare Node server a client can set these: rotating `X-Real-IP` gives fresh throttle buckets (verified: a new `X-Real-IP` with an exhausted XFF got 401, not 429). A non-browser client that already holds the cookie can also pass the origin check with `Origin: evil` + `X-Forwarded-Host: evil` (verified: 404, auth passed). Neither is a CSRF vector: a browser cannot send `X-Forwarded-Host` cross-origin without a preflight, and the preflight gets no CORS allow (verified). On Vercel the platform overwrites these headers. The 119-bit password makes guessing pointless anyway. A suggestion: state "deploy only behind a proxy that sets x-real-ip / x-forwarded-host" in the README.
- **O4 (pre-existing, outside the overhaul): git history on `main` contains a hard-coded local dev connection string** (`postgres://…@localhost:5432/xaro_db`, commit `dfb6fab`, removed in `7ee8de4`, 2025). It points at localhost, not production. Rotate that local password only if it is reused anywhere.
- **O5: no CSP header.** `next.config.ts` sets `nosniff`, `X-Frame-Options: DENY` and `Referrer-Policy`, but no `Content-Security-Policy`. React escaping held against every payload I tried. A CSP would be defence in depth only (not in the plan).

## Checks I could not run as specified

- `Secure` cookie at runtime under `NODE_ENV=production`: not testable over http on `next dev`. Checked in code and by evaluating `sessionOptions` with `NODE_ENV=production`.
- Server log of the currently running :3000 server: not accessible to me. Logs from my own clone runs and the retained preview-server log were scanned instead.
- The `next build` `.next/static` grep from the plan: I did not build (forbidden in the project). I scanned the existing `.next/static` and `.next/dev/static` folders and every chunk served by the dev server instead.
