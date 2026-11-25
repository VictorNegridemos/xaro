# 05 — Verification iteration 1 — V5 (weapon creator)

Verifier: V5, iteration 1. Branch `overhaul` at 0650406. Nothing in the project was modified except this report.
Scratch files: `C:\Users\nkara\AppData\Local\Temp\claude\d99098be4306fc80\2ba05b36-9dcf-4842-a31f-141d6e8b8940\scratchpad\v5\`
(`check.mts` = independent check, `check-results.txt` = its output, `cmp-browser.cjs` + `browser-*.txt` = browser-vs-golden comparison).
No database access was used; no rows were written.

**Summary: 22 checks PASS, 2 FAIL (both minor, layout deviations from plan 8.3; no behavioural failure).**

## 1. Independent logic check (did not use the project's golden tests)

**Method.** `check.mts` (run with `node --import tsx check.mts` from `D:\React\xaro`):
- Takes the ORIGINAL component from `git show 7b0afe7:src/components/WeaponCreator/WeaponCreator.js` and compiles its JSX
  with esbuild into a plain element tree (`h(type, props, ...children)`). It runs the component with a small `useState` stand-in that returns
  a chosen state and collects the setter calls. React batches state updates inside an event handler, and the stand-in does the same. The CSS module is a name proxy and `Button` is a stub.
  The text of the five `<p>` elements is built the way `textContent` is built: `undefined` adds nothing, and `{" "}` adds a space. Handlers run as `onChange({target:{value}})` on the element named by `name`.
- Loads the new `src/lib/weapon/{derive,reducer,selectors,data}.ts`.
- Reads `docs/overhaul/baseline/weapon-creator-golden.json` in place (read-only).

| # | Check | Result | Verdict |
|---|---|---|---|
| 1.1 | My harness of the ORIGINAL component against golden, all entries (validates the harness itself) | 5612 / 5612 equal (collapsed `output` for all five lines, exact `raw` for attack/damage/range/ammo) | PASS |
| 1.2 | New `deriveWeapon(entry.input)` against golden, all 5,612 entries: collapsed lines equal `output`; attack/damage/range/ammo exactly equal `raw`; `special` exactly equals `specialRaw[output.special]`; every line exactly equal to the original render's text; UI flag `controlsLocked` = `ui.typeSelectDisabledClass` = `ui.smartCheckboxDisabledClass` = original class presence | **compared 5612, passed 5612, failed 0** | PASS |
| 1.3 | Style independence: each entry re-derived with 3 other style values (a valid one from another proficiency, `zz-stale`, empty string) | 0 differences out of 16,836 | PASS |
| 1.4 | Full cartesian product without style (6 × 6 × 11 × 2 = 792 states, including the 60 unreachable ones): new `deriveWeapon` against the original render, exact strings | 0 differences | PASS |
| 1.5 | Reducer against the ORIGINAL handlers: 792 core states × 3 styles × every action (6 proficiencies, 46 styles, 6 specializations, 11 types, smart toggle = 70 actions) = 166,320 transitions, all five fields compared | 0 differences | PASS |
| 1.6 | `initialWeaponState` = golden `initialState` | equal | PASS |
| 1.7 | Reachability by breadth-first search (BFS) from the initial state (style ignored). New reducer with `setType`/`toggleSmart` blocked while `controlsLocked` (O3 `disabled`) | 606 states = golden `reach:"pointer"` set exactly; 0 of the 60 unreachable states | PASS |
| 1.8 | Same BFS, no blocking (new), and both modes with the ORIGINAL handlers (blocking where the original had `disabledSelect`) | new any = 732 = all golden states; orig pointer = 606 = golden pointer; orig any = 732 = golden all | PASS |
| 1.9 | O3 consequence: golden entries still UI-reachable | 4646 reachable; 966 unreachable, all of them `keyboard-only` (exactly as owner decision O3 predicts) | PASS |
| 1.10 | Stale style Q1, 30 golden samples (`setProficiency(from)`, `setStyle(chosen)` only if the select does not already show it, `setProficiency(to)`): `state.style`, `displayedStyle`, `styleOptions` | 30 / 30. Note: my first run gave 15/30 because I dispatched `setStyle` unconditionally. The golden records native-select behaviour, where choosing the option already shown fires no change event (one-style proficiencies keep the initial `Club`). The project test models the same thing, and the real `<select>` in the UI behaves that way. This is a fault in my harness, not a defect. | PASS |

## 2. Project tests

`node --import tsx --test src/lib/weapon/*.test.ts src/components/weapon/*.test.tsx`
→ `# tests 22  # suites 8  # pass 22  # fail 0` (about 6 s). **PASS**

Golden file integrity: `git log -- docs/overhaul/baseline/weapon-creator-golden.json` shows only `32d90e7`; `git diff 32d90e7 HEAD --stat -- docs/overhaul/baseline/` is empty; the working tree is clean. **PASS**

## 3. Data tables against the original literals

| # | Check | Result | Verdict |
|---|---|---|---|
| 3.1 | Deep equality including key order: the original's evaluated `weaponProficiencies`, `weaponStyles`, `weaponSpecializations`, `weaponTypes`, `specialEffects` against `data.ts` exports | all 5 identical | PASS |
| 3.2 | Text comparison: original lines 231–327 against `data.ts` from line 5, after removing `export `, ` as const` and trailing `;` | identical byte for byte (trailing space after `'Reflex',`, `[ 'Pistol']`, the newline+8-space indents inside the template literals and the trailing `\n    ` of `bludgeoning1h` all kept); `data.ts` has no CR | PASS |
| 3.3 | Typos and quirks kept (count in original / data.ts) | `Halbert` 1/1, `ACR (acute radiation syndrome)` 2/2, `it's` 18/18, `proned` 2/2, `mass increase  -` (two spaces) 2/2, `psychic` 2/2, `Zweihänder` 1/1 | PASS |
| 3.4 | Options against golden `options` (proficiency values, labels, styles by proficiency, specializations, types, in order) | all equal | PASS |
| 3.5 | `derive.ts` read branch by branch against the original `display*`/`get*` functions | same conditions, order and return values (Devouring checked before smart; clip `''` for unreachable type Devouring without the specialization, as in the original) | PASS |

## 4. Reachability / O3 in the component and in the browser

Code: `src/components/weapon/WeaponControls.tsx:109` `disabled={locked}` on the type `Select`, `:130` `disabled={locked}` on the Smart `Checkbox`. `locked = controlsLocked(state)` = `specialization === 'Devouring'`. `Select`/`Checkbox` (`src/components/ui/*.tsx`) spread `...rest` onto the native element, so the attribute reaches the DOM. The style select is controlled by the raw `state.style` (Q1) and reads `value={state.style}`, as the original did.

| # | Check (browser, own tab, `http://localhost:3000/kodning_weapon_creator`) | Result | Verdict |
|---|---|---|---|
| 4.1 | With Devouring: `select[name=type].disabled` and `input[name=smart].disabled` (`hasAttribute('disabled')`) | both `true` at 1440×900, 844×390 and 390×844; `aria-describedby` → "Sealed by organism" | PASS |
| 4.2 | Pointer on disabled controls: real click on the Smart label (1440) and a tap at 390×844; click on the type select | state unchanged (smart stays false, type stays Devouring) | PASS |
| 4.3 | Keyboard: focus Specialization, press Tab | focus skips type and Smart and lands on the shell search input; state unchanged | PASS |
| 4.4 | Devouring via the Specialization select while smart = true (simpleRanged1h/Pistol/Heavy/Radiation/smart → Devouring) | type → Devouring, smart → false | PASS |
| 4.5 | Devouring via the Type select while smart = true (martialMelee1h/BCI/Plasma/smart → type Devouring) | specialization → Devouring, smart → false | PASS |
| 4.6 | Leaving Devouring (→ BCI at martialRanged2h; → Reflex at martialMelee1h) | type → Laser, smart false (Q7) | PASS |
| 4.7 | Q1: proficiency change does not reset style; simpleMelee1h/Hatchet → martialMelee2h shows Greataxe (select and schematic header); → simpleMelee1h shows Hatchet again; stale `Rifle` → martialMelee1h shows Flail | as golden | PASS |

## 5. Browser: outputs against golden (real controls)

Selects were driven with `form_input` (a native change event on the real `<select>`). Smart was toggled with real pointer clicks or taps on its label. After each step the five `p[data-line]` `textContent`s and the five control values were read back. A SHA-256 prefix of the collapsed lines, of the exact raw short lines and of the exact special text was compared by `cmp-browser.cjs` with the golden entry that has the same five inputs.

| Viewport | Combinations | Golden match |
|---|---|---|
| 1440×900 | 18: default; simpleMelee1h Hatchet/Heavy/Plasma; martialMelee1h Rapier/Reflex/Kinetic smart off **and** on (3d4 vs 2d10); martialMelee2h Halbert/BCI/Gravity smart; martialMelee2h Halbert/BCI/Laser (`3 +`); martialRanged1h Gun/Precognition/Cryogenic smart, Toxic smart; martialRanged2h Rifle/Observer effect/Acidic, Sonic; simpleRanged1h Pistol/Heavy/Tesla smart, Radiation smart (simple ignores smart dice: 2d4); martialRanged2h Devouring (×2); BCI/Laser after leaving Devouring; martialMelee1h Flail/BCI/Plasma smart; Devouring via type; Reflex/Laser after leaving | 18 / 18 |
| 844×390 | 5: martialMelee2h Greataxe Heavy/Laser (stale-style state); Precognition/Kinetic; simpleMelee1h Hatchet Precognition/Kinetic; martialRanged1h Gun Precognition/Gravity (`reload after 3 uses, 9 total ammo`); martialRanged1h Devouring via type (`8d4 / 4d4`) | 5 / 5 |
| 390×844 | 2: martialRanged2h Rifle Heavy/Laser smart by tap (`Damage: 4d4 radiant`); martialRanged2h Devouring (`6d6 / 3d6 + constitution modifier physical`, `Range: 150/600 feet`) | 2 / 2 |

All 11 weapon types appeared; simple vs martial, ranged vs melee, smart on/off on martial weapons and Devouring were all covered. **25 / 25 PASS.**

Accent per type (`--wc-accent` on `[data-type]`): laser #ffe45c, plasma #ff7a3c, kinetic #c8d0d4, gravity #b08cff, cryogenic #7fd8ff, acidic #b6f23c, tesla #6fb3ff, sonic #f5a0ff, toxic #7ddc6a, radiation #e8ff4a, devouring #ff3b4f. Eleven distinct values. **PASS**

## 6. Layout, touch, focus, motion

| # | Check | Result | Verdict |
|---|---|---|---|
| 6.1 | `documentElement.scrollWidth === innerWidth` | 1440 = 1440, 844 = 844, 390 = 390 | PASS |
| 6.2 | Elements of `main` overflowing horizontally | only the decorative `.typeFlash` sweep, clipped by `.schematic { overflow: hidden }`; nothing visible overflows | PASS |
| 6.3 | Touch sizes at 844×390 and 390×844 | four selects 44 px high (219 / 288 px wide); the Smart hit area (whole label) is 100×44 / 98×44 (the box is drawn at 24 px inside the label); Back 57×44 / 55×44 | PASS |
| 6.4 | Focus visible | keyboard Tab onto the style select: `:focus-visible` true, `outline: 2px solid` in the current accent | PASS |
| 6.5 | Disabled state visible | hatched, dimmed type field and Smart box, dashed red field rule, two "▲ SEALED BY ORGANISM" tags, header "OVERRIDE", strap "ORGANISM IN THE LOOP" | PASS |
| 6.6 | Reduced motion. The browser pane cannot emulate the media feature, so I inspected the live CSSOM instead: every weapon `animation` rule (`.line`, `.outline path`, `.typeFlash`, `.scan`, `.strapStatus::before`, `.tendrils`, Devouring `.pulse`, `.inner`) sits inside `@media (prefers-reduced-motion: no-preference)`, and none sits outside a media rule. Under `reduce` there is the global `*{animation-duration:.01ms!important;transition-duration:.01ms!important…}` (`src/app/globals.scss:197`) and `.scan{display:none}` | correct; not observed with real emulation | PASS (by CSS inspection) |
| 6.7 | Portrait 390×844 order | controls (top 203) → result (655) → schematic (1163), scrolling in `main` | PASS |
| 6.8 | Console errors on the page | none | PASS |
| 6.9 | **Plan 8.3 desktop: "everything visible without inner scrolling at 1440×900"** | `main` scrollHeight 953 > clientHeight 734; the schematic plate is cut off at the bottom and needs `main` to scroll. The five result lines and all controls are visible | **FAIL (minor)** |
| 6.10 | **Plan 8.3 landscape: "two columns, each scrolling on its own inside main"** | 844×390 shows two columns, but the columns do not scroll on their own: `main` scrolls as a whole (970/329), and no column is a scroll container. Usable, but not as planned | **FAIL (minor)** |

## 7. Visual judgement (honest)

The page is clearly the strongest expression of the theme on the site, and it reads as a "forbidden fabrication console". Features:
- a hazard-hatched strap ("KODNING FABRICATION // UNSANCTIONED", "PAYLOAD: LASER");
- an "INPUT MATRIX" column with `01 // FRAME … 05 // SMART LINK` captions;
- a mono result block, and the special text in its own "WARNING // SPECIAL PROPERTY" box in readable body type;
- a line-art weapon schematic with measurement ticks.

The accents change per weapon type. Devouring is a real mode change: everything goes blood red, tendrils grow behind the schematic, the frame glows, the strap reads "ORGANISM IN THE LOOP", and the sealed controls are tagged. Text stays readable in all three viewports. The special text keeps good contrast even on the red wash.

Small cosmetic points, not failures:
- Long proficiency labels are cut off by the native select at 844×390 and 390×844 ("Martial ranged tw…", "Martial ranged two-hand…").
- The decorative strap text becomes "KODNI…" / "KODNING FAB…" at narrow widths.
- In dev, the Next "N" indicator covers the first portrait nav item (dev only, already noted in the execution log).

## FAILs

| # | Severity | Where | Reproduction | Suggested fix |
|---|---|---|---|---|
| 6.9 | minor | `src/components/weapon/weapon.module.scss` (desktop layout); URL `/kodning_weapon_creator` at 1440×900 | Load the page at 1440×900 and compare `document.querySelector('main')` scrollHeight 953 with clientHeight 734. The schematic plate extends below the fold | Compact the desktop layout: put the schematic beside the result, or reduce the schematic height and paddings at the desktop breakpoint so the console fits 734 px. Alternatively, accept and amend plan 8.3 |
| 6.10 | minor | same file (landscape layout) | At 844×390, scroll inside a column: the whole `main` scrolls; neither `.controlsArea` nor `.resultArea`/`.schematicArea` is a scroll container | Under the landscape mixin, give the layout `height: 100%` and the two columns `overflow-y: auto; min-height: 0`, or accept and amend plan 8.3 |

Not run: real `prefers-reduced-motion` emulation (the pane cannot emulate it; verified via the CSSOM instead); ESLint (V1's scope). Screenshots were not saved to `docs/overhaul/after/`, because the brief allows me to write only this report in the project.
