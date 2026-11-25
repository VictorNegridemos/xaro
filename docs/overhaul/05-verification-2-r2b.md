# Verification iteration 2, R2-B: layout, weapon creator and accessibility re-check

- Verifier: r2b (independent). HEAD 24cb1b9 ("fix: verification round 1 findings"), branch `overhaul`.
- Environment: running dev server http://localhost:3000, own Browser-pane tab (tab-4, closed at the end, viewport reset to desktop). Viewport sizes were set by emulation and every page was reloaded after each resize.
- No files in the project were modified apart from this report and the screenshots under `docs/overhaul/after/r2-*`. No DB access, no logins, no rows written.
- Measuring scripts were run in the page (javascript_tool). The weapon golden comparison was done in Node against `docs/overhaul/baseline/weapon-creator-golden.json` (read only). Scratch files: `C:\Users\nkara\AppData\Local\Temp\claude\d99098be4306fc80\2ba05b36-9dcf-4842-a31f-141d6e8b8940\scratchpad\r2b\`.

**Summary: 25 PASS, 1 FAIL (minor). 2 observations.**

## 1. Weapon creator layout

| # | Check | Method / result | Verdict |
|---|---|---|---|
| 1.1 | 1440×900: console fits main, main does not scroll, the five result lines are always fully visible | Script set every proficiency × specialization × type (Laser to Radiation) × Smart on/off plus Devouring: **606 states**. In every state `main` was 734/734, `scrollWidth` 1440/1440, no inner scroll container overflowed, and all five `[data-line]` elements lay inside main and inside every clipping ancestor. | PASS |
| 1.2 | 1440×900: 10 named states incl. the longest specials | Hatchet/Heavy/Plasma, Rapier/Reflex/Kinetic smart, Halbert/BCI/Laser, Gun/Precognition/Cryogenic smart, Rifle/Observer effect/Acidic, Pistol/Heavy/Tesla smart, Rifle/Devouring (468-char special, the longest), Flail/BCI/Toxic smart, Zweihänder/Observer effect/Radiation (467 chars, the second longest), Club/Precognition/Sonic. Main 734/734 every time, all lines visible. | PASS |
| 1.3 | Schematic hides itself for long specials, and nothing is lost | The schematic was hidden in 246 of 606 states (Devouring, Radiation, Cryogenic, Toxic and others). It is `aria-hidden="true"` (WeaponSchematic.tsx:89) and only repeats data that the controls and result already show, so nothing that carries information becomes unreachable. Screenshot `after/r2-kodning_weapon_creator-devouring-1440x900.jpg`. | PASS (documented behaviour) |
| 1.4 | 844×390: columns scroll on their own, main does not | main 329/329; controlsArea 428/185 and readoutArea 817/185 are scroll containers (Devouring: 482/185 and 1049/185). After scrolling the readout to its end, `main.scrollTop` stayed 0. Every select, the checkbox and all five lines are reachable by scrolling their column. Screenshot `after/r2-kodning_weapon_creator-devouring-844x390.jpg`. | PASS |
| 1.5 | 1366×650 (side effect) | main 484/484, columns 440/325 and 414/325 (Radiation 587/332, Devouring 608/332). `scrollIntoView` on each control and line brought it fully inside its column and main: nothing unreachable. | PASS |
| 1.6 | 390×844: "Martial ranged two-handed" shown in full, no horizontal scroll, controls ≥ 44 px | Text width 192.8 px (canvas, computed font 16px) and room inside the select 250 px. scrollWidth 390/390. Back, the four selects and the Smart label are all 44 px tall. Screenshot `after/r2-kodning_weapon_creator-390x844.jpg`. | PASS |
| 1.7 | 360×640: the same checks | Room 220 px against the 192.8 px text, scrollWidth 360/360, all controls 44 px tall. Screenshot `after/r2-kodning_weapon_creator-360x640.jpg`. | PASS |
| 1.8 | 844×390: proficiency label | Room 216 px against 192.8 px. | PASS |
| 1.9 | Proficiency label "shown in full everywhere" (execution-log claim) at 820×1180 (also part of the sweep in 6) | **The label is cut to "Martial ranged two-han…"**: the select is 216 px wide with 180 px of room for the 192.8 px text. At 768×1024 the room is 275 px, so that size is fine. See F1. | **FAIL (minor)** |

## 2. Weapon behaviour

| # | Check | Result | Verdict |
|---|---|---|---|
| 2.1 | `node --import tsx --test src/lib/weapon/*.test.ts src/components/weapon/*.test.tsx` | 22 tests, 8 suites, 22 pass, 0 fail | PASS |
| 2.2 | 10 combinations set in the browser (the list in 1.2), compared with the golden entries (`reach: "pointer"`, same five inputs) on all five collapsed output lines | 10/10 identical (script `r2b/cases.json` against `r2b/observed.json`) | PASS |
| 2.3 | Devouring disables type and Smart | Specialization Devouring: `type.disabled` and `smart.disabled` are both true. Choosing type Devouring while on Heavy switches the specialization to Devouring and disables both. Leaving it (Reflex) sets type to Laser and enables both again. | PASS |

## 3. V2 F1/F2: nav labels and systems drawer

The method splits each text node into words and gets the client rects of each word with a Range. A word whose rects sit on more than one line counts as broken mid-word. Overflow means scrollWidth > clientWidth.

| # | Size | Result | Verdict |
|---|---|---|---|
| 3.1 | 360×640 | Bottom nav Home/Crew/Location/Weapon creator/Menu are 72×68 each, no broken words, no overflow ("Weapon creator" wraps at the space). Systems drawer: 8 category cells (FTL 25×17, PROPULSION 83×17 ×2, WEAPONS 58×17 ×2, SHIELDS, SENSORS, CORE), no broken words, no overflowing rows or dialog. Location drawer: no problems. | PASS |
| 3.2 | 360×320 | The same for the nav, the systems drawer and the location drawer. No problems, scrollWidth 360. Screenshot `after/r2-home-360x320.jpg`. | PASS |
| 3.3 | 390×844 | Nav items 78×68, no problems. Systems drawer opened: PROPULSION 83×17, no broken words, rows do not overflow. Screenshot `after/r2-drawer-systems-390x844.jpg`. | PASS |

## 4. V2 F3: location readout contrast

| # | Check | Result | Verdict |
|---|---|---|---|
| 4.1 | `.locationFoot` "NAV LOCK — — — DRIFT", with every child span measured | Colour rgb(125,144,133) on the nearest opaque background rgb(11,15,13), opacity product of the ancestors 1, 13px: **5.70:1** (≥ 4.5). Measured in the 1440×900 sidebar and in the 360×640 location drawer. | PASS |

## 5. Headings and titles

| # | Check | Result | Verdict |
|---|---|---|---|
| 5.1 | `/` h1 | `<hgroup><p>Ship computer</p><h1>X'aro</h1></hgroup>`, h1 text "X'aro" | PASS |
| 5.2 | `/login` h1 | `<hgroup><p>Archive · write access</p><h1>Crew authentication</h1></hgroup>` | PASS |
| 5.3 | `/kodning_weapon_creator` title | "Kodning Weapon Creator — X'aro" | PASS |
| 5.4 | `/entry/zz-no-such-entry-r2b` | HTTP 404. Title "Record not found — X'aro" at load and still the same 3 s after hydration | PASS |
| 5.5 | `/ship_record/abc` | HTTP 404. Title "Record not found — X'aro" at load and 3 s later (no fallback to "X'aro") | PASS |

## 6. Regression sweep

Routes: `/`, `/search?q=warp`, `/entry/warp`, `/entry/ereshkigal`, `/login`, `/kodning_weapon_creator`. Sizes: 1440×900, 844×390, 390×844, 820×1180, which is 24 page loads. On each load the script checked: `document.querySelectorAll('main').length`, documentElement and body scrollWidth against innerWidth, and the intersection area between main's rect and the shell search form outside main. Focus was checked with real Tab key presses: 1 press at 1440 and 4 presses at the other sizes. Then `:focus-visible` and the outline of `document.activeElement` were checked.

| # | Check | Result | Verdict |
|---|---|---|---|
| 6.1 | One `<main>` | 1 on all 24 loads | PASS |
| 6.2 | No horizontal scroll | scrollWidth = innerWidth on all 24, for both html and body | PASS |
| 6.3 | Search box never overlaps main | Intersection 0 px² on all 24 | PASS |
| 6.4 | Focus ring visible on Tab | 1440: the skip link "Skip to content" gets focus with `:focus-visible` and a solid 2px rgb(213,224,216) outline. Other sizes: the 4th Tab lands on the WEAP system button with `:focus-visible` and a solid 2px outline, visible in `after/r2-kodning_weapon_creator-focus-844x390.jpg`. | PASS |
| 6.5 | Page h1 and title on each load | `/` "X'aro", `/search` "Query result" (title "'warp' — Search — X'aro"), `/entry/warp` "Warp", `/entry/ereshkigal` "Ereshkigal", `/login` "Crew authentication". All the same at every size. | PASS |

## FAILs

### F1 (minor): the proficiency label is cut off at 820×1180 (3-column portrait band)
- Where: `src/components/weapon/weapon.module.scss` portrait field grid (around line 349 to 351: `grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr))`).
- Reproduce: open `/kodning_weapon_creator` at 820×1180, set Proficiency to "Martial ranged two-handed". The select shows "Martial ranged two-han…" because the select is 216 px wide with 180 px of text room, and the text needs 192.8 px. Screenshot `after/r2-kodning_weapon_creator-proficiency-truncated-820x1180.png`. At 768×1024 (2 columns, 275 px of room) the label fits.
- Contradicts the Fix round 1 B claim "shown in full everywhere". The four sizes in the brief (1440×900, 844×390, 390×844, 360×640) are fine.
- Suggested fix: raise the portrait minimum to about 15.5rem (≥ 248 px of select width), let the proficiency field span 2 columns (`grid-column: span 2` when 3 or more columns fit), or narrow the padding or chevron gutter inside this band.

## Observations (not counted)
1. **No `<h1>` on `/kodning_weapon_creator` or on the 404 pages** (`/entry/<unknown>`, `/ship_record/abc`). The weapon page's top heading is `<h2>Kodning Weapon Creator</h2>` (panel title). The 404 StateBlock title "RECORD NOT FOUND — …" is not a heading element, so main contains no heading at all. The plan did not explicitly require it, but it is inconsistent with the other pages, which do have one h1. Suggested: render the panel title as h1 on this page and the StateBlock title as h1 on the not-found pages.
2. **844×390 viewing area of the columns is small:** each column is 185 px tall inside a 329 px main, because the panel header and the strap take about 144 px. The layout works and is reachable, but the visible result is only about 3 lines at a time. Possible improvement: hide the strap in landscape-short heights.

## Rows written
None. This scope made no DB reads or writes.
