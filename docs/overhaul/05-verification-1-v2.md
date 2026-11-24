# Phase 5 verification, iteration 1, V2: functional checks in a real browser

Verifier: V2 (independent). Date: 2026-11-24. Target: the shared `next dev` server on http://localhost:3000, branch `overhaul` (HEAD 0650406, clean tree).
Browser: the Claude desktop built-in browser pane (Chromium). I used my own tab (`tab-1`), reloaded after every resize, set the tab back to desktop afterwards and closed it. Logged-in checks ran over HTTP from a Node script (`scratchpad/v2/loggedin-check.mjs`) because the permission system blocks logging in inside the pane.
No database writes. No files changed in the project apart from this report and the screenshots in `docs/overhaul/after/v2-*.jpg`.

## Summary

| Result | Count |
|---|---|
| PASS | 41 |
| FAIL | 3 (all minor) |
| Observations (not counted as failures) | 9 |
| Not run | 3 (see the end) |

FAILs:
1. **minor**: the bottom-nav label "Location" breaks in the middle of the word ("LOCATIO / N") at 360 px wide. `src/components/shell/NavList.module.scss:105`
2. **minor**: in the systems drawer the category "PROPULSION" breaks in the middle of the word ("PROPULSIO / N") at 390×844. `src/components/shell/panels.module.scss` (the `overflow-wrap: anywhere` rules on lines 17/24/54/220/226; the category cell of the system row)
3. **minor**: "NAV LOCK — — — DRIFT" in the location panel has a contrast of 3.44:1 at 13 px, which is below WCAG AA (4.5:1). It uses the `--c-text-disabled` token for text that is a readout, not a disabled control.

## Method

- **Route matrix.** I injected a measuring function on each page (the browser forbids framing the site because of `X-Frame-Options: DENY`, so every route was loaded in the real tab). The function recorded:
  - `documentElement.scrollWidth` against `innerWidth`;
  - the number of `<main>` elements;
  - the bounding boxes of `main`, the shell search region and `nav`;
  - every visible shell child whose box intersects `main`;
  - every element inside `main` that sticks out of `main` horizontally;
  - `main.scrollHeight / clientHeight / scrollWidth / clientWidth`;
  - every control smaller than 44×44 px. Inline text links are excluded under WCAG 2.5.8. A checkbox counts as passing when its wrapping label is at least 44×44.
- **Timing caveat.** The pane was hidden for the whole run, so the browser painted no frames. CSS transitions and animations only advanced when a screenshot forced a frame. Drawer states and hover styles were therefore read after a screenshot. Two screenshots show readout text mid-animation (dim); I checked the computed state afterwards (`wc-reprint` is 120 ms with `fill: both`, finished and at opacity 1).
- **Routes:** `/`, `/search?q=warp`, `/search?q=Ereshkigl` (typo), `/search?q=zzznomatch` (empty), `/search?q=warp&type=ship_system`, `/search?type=crew_member` (browse), `/entry/jagoda-migdal` (crew), `/entry/warp` (ship system), `/entry/ereshkigal` (record), `/entry/k82aca` (longest record), `/entry/no-such-entry-zz` (404), `/kodning_weapon_creator`, `/login`.
- **Sizes:** 1440×900, 844×390, 390×844, 820×1180, 1366×650, 360×640 (all 13 routes at each). Spot checks at 360×320 (keyboard open), 2560×1080.

## Checks

### A. Layout matrix (logged out): 13 routes × 6 sizes = 78 page loads

| # | Check | Result |
|---|---|---|
| A1 | `scrollWidth === innerWidth` on all 78 loads (also 360×320 and 2560×1080) | **PASS** |
| A2 | Exactly one `<main>` on every load | **PASS** |
| A3 | No visible shell element (search region, nav, rails, header) intersects `main` (bounding-box test) | **PASS** on all 78. Measured boxes:<br>desktop 1440×900: main 288..1152 × 94..828, search 828..900, nav 0..288 × 779..900;<br>1366×650: main 94..578, search 578..650;<br>landscape 844×390: main 56..788 × 61..390, search box in the top row 474..788 × 0..61, rails 0..56 / 788..844;<br>portrait 390×844: main 65..712, search 712..775, nav 775..844;<br>820×1180: main 65..1064, search 1064..1127, nav 1127..1180;<br>360×640: main 65..508, search 508..571, nav 571..640 |
| A4 | No element inside `main` sticks out of it horizontally | **PASS**. The only hit, `SPAN.typeFlash` on the weapon creator, is `position:absolute`, opacity 0, and clipped by its `overflow:hidden` parent `.schematic`; `main.scrollWidth === clientWidth` on every load |
| A5 | Layout chosen per plan 7.3 | **PASS**. 1440×900, 1366×650 and 2560×1080 are desktop (three columns, static rails). 844×390 is landscape (icon rails, search box in the top row). 390×844, 820×1180, 360×640 and 360×320 are portrait (bottom nav of five) |
| A6 | Long text scrolls inside `main`; the last element can be reached and is not covered | **PASS**. `/entry/k82aca` at 390×844: scrollHeight 756 > clientHeight 647; scrolled to the end (scrollTop 109 = max), the last control "Back" ends at y=683, above the search box top at y=712. Weapon creator scrolls in `main` at every size (e.g. 1458/443 at 360×640). Screenshot `v2-entry-k82aca-scrolled-390x844.jpg` |
| A7 | Touch targets ≥ 44 px in portrait/landscape layouts (all controls, scrolled or not) | **PASS**. 0 undersized controls on all routes at 390×844, 820×1180, 360×640, 844×390. Bottom-nav items 72×68, landscape rail buttons 55×44, drawer close 44×44, menu items 44 high. The Smart checkbox is 24×24 inside a 102×44 label |
| A8 | Ship tiles in portrait | **PASS**. Six-column grid, each tile ≥ 44 px high |
| A9 | Keyboard-open portrait 360×320 keeps the portrait layout and a usable search box | **PASS**. Search box at y 188..251 and visible, main 123 px tall and scrollable (`v2-entry-k82aca-360x320.jpg`) |
| A10 | Bottom-nav labels at 360 px wide | **FAIL (minor)**, see F1 |

### B. Search flow

| # | Check | Result |
|---|---|---|
| B1 | Type "rail cannon" in the shell box at 1440×900 and press Enter | **PASS**. URL `/search?q=rail+cannon`, count line "1 signal for ‘rail cannon’", chips "All 1" (`aria-current`) / "Ship system 1", result link `/entry/rail-cannon` with badge |
| B2 | Click the result opens the detail page | **PASS**. `/entry/rail-cannon`, h1 "Rail cannon" |
| B3 | Browser Back returns to the results with the query intact | **PASS**. URL `/search?q=rail+cannon`, same count, the shell and page inputs both hold "rail cannon" |
| B4 | The entry page's own Back button (`router.back()`) | **PASS**. From `/search?q=warp` → `/entry/warp` → Back lands on `/search?q=warp` |
| B5 | Click a word in the entry text | **PASS**. "depleted" on `/entry/warp` is a real `<a href="/search?q=depleted">`; the click landed on `/search?q=depleted` ("5 signals") |
| B6 | Typo query `/search?q=Ereshkigl` | **PASS**. 1 signal, the record "Ereshkigal" (`v2-search-Ereshkigl-1440x900.jpg`) |
| B7 | Empty state `/search?q=zzznomatch` | **PASS**. "0 signals", "NO SIGNAL — THE ARCHIVE HOLDS NOTHING FOR ‘ZZZNOMATCH’." plus suggestions, at all sizes |
| B8 | Type filter `&type=ship_system`, and browse `?type=crew_member` without q | **PASS**. Both render with no overflow |
| B9 | Shell persistence (plan 10.2) | **PASS**. Typed "halfway typed" (not submitted) and expanded the crew member Kik, then clicked the Weapon creator nav link. On `/kodning_weapon_creator` the window marker survived (no reload), the search text was still there and Kik was still expanded |

### C. Old URLs (logged out; curl for status codes, then followed in the browser)

| # | URL | Result |
|---|---|---|
| C1 | `/ship_record/1` | **PASS**. 308 → `/entry/ereshkigal` |
| C2 | `/crew_member/1` | **PASS**. 308 → `/entry/jagoda-migdal` |
| C3 | `/subsystem/7` (and `/subsystem/1`) | **PASS**. 308 → `/entry/warp-drone-matrix` (and `/entry/warp`) |
| C4 | `/edit_ship_record/1` | **PASS**. 308 → `/entry/ereshkigal/edit` → 307 → `/login?next=%2Fentry%2Fereshkigal%2Fedit` (browser ends on the login page) |
| C5 | `/add_ship_record` | **PASS**. 308 → `/entry/new` → 307 → `/login?next=%2Fentry%2Fnew` |
| C6 | `/ship_record/abc`, `/ship_record/999999` | **PASS**. 404 with the themed not-found page |
| C7 | `/entry/new`, `/entry/warp/edit`, `/import` logged out | **PASS**. 307 → `/login?next=…` |

### D. Drawers and panels

All drawers were read through `#drawer-crew|location|systems|menu` (visibility, `inert`, rect), `document.activeElement` and the scrim state.

| # | Check | Result |
|---|---|---|
| D1 | Portrait 390×844: the Crew button opens the crew drawer and focus moves to the h2 "Crew manifest"; Shift+Tab / 14×Tab stays inside the drawer; Escape closes it (drawer hidden and inert, scrim hidden) and focus returns to the "Crew" button with a visible ring | **PASS** |
| D2 | Portrait: the Location drawer opens (focus on h2 "Current location"); tapping the scrim closes it, focus returns to "Location" | **PASS** |
| D3 | Portrait: the Menu sheet opens (h2 "Menu", items Close 44 px, Login 44 px); Escape closes it, focus returns to "Menu" | **PASS** |
| D4 | Portrait: tapping the FTL tile opens Systems with FTL expanded and all eight systems carrying "Open entry" links; the same tile again closes it; the PROP tile opens Propulsion expanded; Escape closes; focus returns to the tile | **PASS** |
| D5 | Landscape 844×390: rail Crew opens the drawer (0..384) and Escape closes it; right-rail Location opens (460..844) and the scrim closes it; the FTL tile opens the systems sheet between the rails (56..788), and Escape closes it, focus returned each time | **PASS** |
| D6 | Closed drawers in portrait/landscape are `visibility:hidden` and `inert`; on desktop the crew and location panels are static and always visible | **PASS** |
| D7 | Every nav item can be reached: desktop (Weapon creator, Login), landscape (Home, Crew, Weapon creator; right rail Location, Login), portrait (Crew, Location, Home, Weapon creator, Menu→Login) | **PASS** |
| D8 | Systems drawer category text at 390×844 | **FAIL (minor)**, see F2 |

Screenshots: `v2-drawer-{crew,location,menu,systems}-open-390x844.jpg`, `v2-drawer-{crew,location,systems}-open-844x390.jpg`.

### E. Focus, hover, active, contrast

| # | Check | Result |
|---|---|---|
| E1 | Skip link is the first Tab stop, visible at 8,8 (44 px high), and Enter moves focus to `main#content` | **PASS** |
| E2 | Focus ring on Tab: 35 consecutive stops on `/entry/warp` (brand, six tiles, nav, interactive words, Back, search input, search submit, crew links) all report `outline: solid 2px rgb(166,240,90)` with `:focus-visible` | **PASS** |
| E3 | Hover (pointer fine; style read after a frame was forced). Ghost "Back": bg → `#1b2420`, border and text → phosphor. Nav "Weapon creator": bg `#1b2420`, text phosphor. Interactive word: text and dotted underline → phosphor. Ship tile: bg `#1b2420`, border phosphor | **PASS** |
| E4 | `:active` rules exist for ghost/primary/danger buttons, tiles, nav items, crew rows, system rows, search submit, links (CSSOM scan) | **PASS** |
| E5 | Contrast of text against its real background (walking up to the first opaque background), on `/`, `/entry/warp`, `/search?q=warp`, `/search?q=zzznomatch`, `/login`. Body text `#d5e0d8` ≈ 13–15:1; the lowest non-decorative values are 5.70 (metadata), 5.88 (Offline red) and 5.96 | **PASS** for body text |
| E6 | "NAV LOCK — — — DRIFT" readout | **FAIL (minor)**, see F3. The tool also reported 1.05 for the primary-button labels "Search" / "Authenticate". This is a measuring artefact: the phosphor fill is painted by a notched pseudo-element, and the screenshot shows dark text on green |

### F. Weapon creator

| # | Check | Result |
|---|---|---|
| F-1 | Every control changed at least once with real input. Selects were set with `form_input`, which fires `change`. Smart was set with a real mouse click: `form_input` on the checkbox changes `.checked` without React seeing it, and the first run gave a false reading this way, which I discarded | **PASS** |
| F-2 | 26 resulting states compared with `docs/overhaul/baseline/weapon-creator-golden.json` (attack/damage/range/ammo exact, special prefix). Proficiencies: all 6 except martialRanged1h. Types: all 11. Specializations: all 6. Smart: on and off | **PASS** (26/26; script `scratchpad/v2/wc-compare.js`) |
| F-3 | Specialization Devouring: type becomes Devouring, and the type select and Smart get the `disabled` attribute ("Sealed by organism" via `aria-describedby`). Smart is not focusable; a real click on the Smart label leaves it unchanged; `cursor: not-allowed` | **PASS** |
| F-4 | Choosing type Devouring also sets specialization Devouring and disables both controls. Leaving through Reflex or BCI resets type to Laser with Smart off (same as the old `changeSpecialization`/`changeType`) | **PASS** |
| F-5 | Style list follows proficiency (Greataxe… for martialMelee2h, Flail…Shotel for martialMelee1h, Pistol for simpleRanged1h, Rifle for martialRanged2h) | **PASS** |
| F-6 | Accent per type (`--wc-accent` on `.console`): Laser `#ffe45c`, Tesla `#6fb3ff`, Sonic `#f5a0ff`, Devouring `#ff3b4f`, as in plan 7.2. The Devouring look (blood frame, "ORGANISM IN THE LOOP", tendrils) is shown in `v2-kodning_weapon_creator-devouring-1440x900.jpg` | **PASS** |
| F-7 | Layout at 1440×900, 844×390, 390×844 (plus 820×1180, 1366×650, 360×640, 2560×1080): no horizontal scroll, nothing covered, scrolls inside `main` | **PASS** |

### G. Logged-in pages (HTTP only)

Script `scratchpad/v2/loggedin-check.mjs`: `POST /api/auth/login` with `Origin: http://localhost:3000` and `X-Forwarded-For: 198.51.100.62` returned 200 and set the cookie `xaro_session` (HttpOnly, SameSite, Max-Age; no `Secure` under `next dev`, as planned). The password was read inside the script and never printed.

| # | Page | With cookie | Without cookie | Result |
|---|---|---|---|---|
| G1 | `/` | 200, 1 `<main>`, links `/entry/new` (Add) and `/import`, Logout present, no Login link | 200, 1 `<main>`, Login link, no Add/Import/Logout | **PASS** |
| G2 | `/entry/new` | 200, 1 `<main>`, fields name/type/summary/body (1 select, 3 textareas) | 307 → `/login?next=%2Fentry%2Fnew` | **PASS** |
| G3 | `/entry/warp/edit` | 200, 1 `<main>`, the same fields pre-filled (10 inputs incl. attribute rows) | 307 → `/login?next=%2Fentry%2Fwarp%2Fedit` | **PASS** |
| G4 | `/import` | 200, 1 `<main>`, file input present | 307 → `/login?next=%2Fimport` | **PASS** |
| G5 | `/entry/warp` | 200, 1 `<main>`, Edit link `/entry/…/edit` and Delete control present | 200, no Edit/Delete, no Add/Import/Logout | **PASS** |
| G6 | `POST /api/auth/logout` | 200; `Set-Cookie: xaro_session=; Max-Age=0` | — | **PASS** |
| G7 | Logged-in visual check (forms, nav with Add/Import/Logout at the three sizes) | — | — | **NOT RUN**: logging in inside the browser pane is blocked by the permission system; only the HTML was checked |

Note: replaying the old cookie value after logout still gives 200 on `/entry/new`. This is the documented stateless design (plan 5.6: iron-session, ended only by clearing the cookie, a secret rotation or a password change), not a defect. It is listed for V3.
Throttle: both of my logins succeeded, and a successful login deletes its bucket (`clearAttempts`), so no `auth_throttle` row of mine remains. I did not run `verify:cleanup --throttle`, because it would clear the other verifiers' buckets.

## Failures in detail

### F1 (minor): the bottom-nav label "Location" breaks mid-word at 360 px
- URL: any page at 360×640 or 360×320 (portrait). The label span is 64 px wide and 34 px high (two lines): "LOCATIO" / "N". "Weapon creator" wraps at the space, which is fine.
- Cause: `src/components/shell/NavList.module.scss:101-106`, where `.label` has `overflow-wrap: anywhere` and `letter-spacing: 0.04em` inside a 72 px item.
- Reproduce: resize to 360×640, open `/`, look at the bottom nav (`v2-kodning_weapon_creator-360x640.jpg`, `v2-entry-k82aca-360x320.jpg`).
- Fix: use `overflow-wrap: normal` (or `break-word`) for nav labels so a single word is never split. If needed, cut the letter-spacing, or use the `--fs-xs` body font for the label at narrow widths, so "Location" fits in about 64 px.

### F2 (minor): "PROPULSION" breaks mid-word in the systems drawer at 390×844
- URL: any page at 390×844, after tapping the FTL or PROP tile. The two Propulsion rows show "PROPULSIO" / "N".
- Cause: the category cell of the system row in `src/components/shell/panels.module.scss` (the `overflow-wrap: anywhere` rules) in a fixed narrow column.
- Reproduce: 390×844, tap a ship tile (`v2-drawer-systems-open-390x844.jpg`).
- Fix: give the category column `min-inline-size: max-content` (or `overflow-wrap: normal`), or show the short code (PROP) as the ship tiles do.

### F3 (minor): "NAV LOCK — — — DRIFT" contrast is 3.44:1 at 13 px
- URL: every page (location panel; desktop right rail, the location drawer elsewhere).
- Measured: the text colour is `--c-text-disabled` `#5d6b63` on the hull background, 3.44:1. The spec (5.6) asks for AA on text; 13 px needs 4.5:1.
- Fix: use `--c-text-faint` (`#7d9085`, 5.7:1) for this readout. The disabled token is meant for disabled controls only (plan 7.2).

## Observations (not counted as failures)

1. **Two search boxes on `/search`.** The results page has its own search form (input plus "Search" button, `role=search`) in addition to the shell box, and both are pre-filled. Plan 4.3/7.4 only describe the shell box being pre-filled. This is harmless but redundant: two `search` landmarks, and in portrait the same query is shown twice on one screen (`v2-search-warp-390x844.jpg`). Consider dropping one.
2. **Titles of the 404 pages are inconsistent.**
   - `/entry/<unknown>`: the server HTML has `<title>X'aro</title>`, which the client then changes to "Not found — X'aro", and the copy is "NO RECORD — the archive holds no entry under that designation." (`src/app/entry/[slug]/not-found.tsx`).
   - `/ship_record/abc`: the server title "Record not found — X'aro" falls back to "X'aro" on the client, and the copy is "RECORD NOT FOUND — it may never have existed." (`src/app/not-found.tsx`).
   - `/kodning_weapon_creator` has the title "Kodning Weapon Creator", without the "— X'aro" suffix the other pages use.
3. **Eyebrow text inside the h1.** The h1 elements contain their eyebrow line, so the heading names are "Ship computerX'aro" on `/` and "Archive · write accessCrew authentication" on `/login`. Screen readers read them run together. Move the eyebrow out of the `<h1>` or mark it `aria-hidden`.
4. **Search snippet cut mid-word.** The snippet for rail cannon begins "aro is equipped with 2 rail…" (the start of "X'aro" is cut). This is V4's area (snippet boundaries).
5. **Result count.** `/search?q=warp` returns 2 signals (Warp, Warp drone matrix), while the plan's example said "7 signals for 'warp'". The example was only illustrative; the ranking and recall belong to V4.
6. **Many tab stops in entry text.** Every interactive word is its own tab stop (about 22 on `/entry/warp` before "Back"). This matches plan 4.3 (keyboard-reachable links) but makes keyboard travel long; a "skip to actions" link or fewer linked words would help.
7. **Next dev indicator over the Crew button (dev only).** In portrait the "N" badge sits over the Crew button and caught the first tap; tapping beside it worked. This does not exist in production.
8. **Stateless session.** A replayed cookie still works after logout (by design, see G).
9. **Status glyphs on portrait tiles.** The portrait ship tiles show status as a glyph and colour (▲ / ✕) instead of the baseline's "ONLINE/OFFLINE" words. This is the planned compact form, and the `aria-label` includes "Online"/"Offline".

## Comparison with the baseline (`docs/overhaul/baseline/`)

- **Fixed:**
  - The search box no longer covers the bottom of content cards on desktop. In the baseline (`ship_record-10-1440x900.jpg`) the Back/Edit buttons sat half under "Ask X'aro"; now it has its own track (main ends at y=828 where the search track starts).
  - Long text now uses the legible IBM Plex Sans instead of the distressed display font.
  - The portrait drawer strips no longer show at the screen edges.
  - Body text contrast went from grey on black to about 14:1.
  - The ship drawing has a visible phosphor rendering instead of near-invisible dark grey.
- **Changed on purpose:** the portrait ship tiles use abbreviations and glyphs (FTL/PROP/WEAP… with ▲/✕), and the status words appear in the systems drawer.
- **No visual regressions found** apart from F1–F3.

## Theme judgement (honest)

It reads as a derelict ship terminal:
- near-black hulls with thin hard-edged frames and notched corners;
- one sickly phosphor green for headings, links and focus, with red kept for Offline, warnings and the Devouring state;
- subtle scanlines, and a glitch/flicker on headings when a page loads.

The weapon creator's "forbidden fabrication console" is the strongest screen, especially the Devouring state with the blood frame and tendrils.

Readability is good. Long text is in a clean sans at 16–18 px with high contrast; the display font is limited to headings and labels; mono is used for readouts.

Weak spots:
- The heading glitch can briefly show doubled, struck-through letters (seen in the 844×390 screenshots taken mid-animation).
- The location-panel readouts at 13 px mono are small on desktop.
- The two stacked search boxes on `/search` look redundant on phones.

Overall: on theme and readable.

## Not run

- **Logged-in visual check** of `/entry/new`, `/entry/<slug>/edit`, `/import` and the logged-in nav in the browser (blocked by the permission system; the HTML was checked over HTTP, section G).
- **844×390 with touch emulation (B10) and swipe gestures.** The pane only emulates touch below 768 px wide, and its tools cannot send swipe gestures. Tap, Escape and the scrim were tested.
- **Real-device URL-bar and on-screen keyboard behaviour (B8).** Only the 360×320 approximation was checked.

## Screenshots

`docs/overhaul/after/v2-*.jpg` (42 files), named `v2-<route>-<WxH>.jpg`:
- home, search-warp, search-zzznomatch, entry-jagoda-migdal, entry-warp, entry-k82aca, entry-404, kodning_weapon_creator and login, each at 1440×900, 844×390 and 390×844;
- `v2-search-Ereshkigl-1440x900`, `v2-entry-k82aca-scrolled-390x844`, `v2-entry-k82aca-820x1180`, `v2-home-1366x650`, `v2-kodning_weapon_creator-360x640`, `v2-entry-k82aca-360x320`, `v2-kodning_weapon_creator-2560x1080`, `v2-kodning_weapon_creator-devouring-1440x900`;
- the drawer shots listed in section D.

The 1440×900 shots are stored at 800×500 and the 390×844 ones at 468×1013, because the pane scales the view (same limitation as the baseline). The crew-drawer shot at 390×844 was taken mid-slide; the drawer later measured fully open at 0..343.
