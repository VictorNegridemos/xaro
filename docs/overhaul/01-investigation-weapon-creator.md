# 01 — Investigation D: Kodning weapon creator (frozen behaviour)

Sources: `src/components/WeaponCreator/WeaponCreator.js` (327 lines, client component, logic + data inline),
`src/components/WeaponCreator/WeaponCreator.module.css`, `src/app/kodning_weapon_creator/page.js`
(async server component: `<Main><WeaponCreator/></Main>`, no props, no data fetching, no DB).

Golden file: `docs/overhaul/baseline/weapon-creator-golden.json` (4.9 MB)
Generator: `docs/overhaul/baseline/generate-weapon-golden.mjs` — run `node docs/overhaul/baseline/generate-weapon-golden.mjs` from the repo root (about 3 minutes).

## 1. Golden file: method and numbers

**Method: real render (not extraction).** The generator reads the unmodified `WeaponCreator.js`, transpiles it in
memory with sucrase (JSX + import syntax only), mounts it with the real `react`/`react-dom` 18 `createRoot` in jsdom,
drives it exclusively through its own handlers (native `change` events on the four selects, native click on the
checkbox) and reads the five result `<p>` lines back from the DOM. Stubs (no weapon logic in either): the CSS module
(identity proxy, `styles.x === "x"`) and `../Button/Button` (needs the Next app router; replaced by a plain `<a>`).

Reachability was not assumed; it was found by a breadth-first search over the mounted component, in two modes:
*pointer* (controls carrying the `disabledSelect`/`disabledCheckbox` class are not operated, as with mouse/touch) and
*any* (they are operated — they are only `pointer-events: none`, not `disabled`, so keyboard Tab + arrows/Space works).

| | count |
|---|---|
| Golden entries (every UI-reachable proficiency × valid style × specialization × type × smart) | **5612** |
| … reachable with mouse/touch (`reach: "pointer"`) | 4646 (= 46 styles × 101) |
| … reachable only with the keyboard on the "disabled" controls (`reach: "keyboard-only"`) | 966 (= 46 × 21) |
| Distinct states ignoring style (style never affects output) | 732 (pointer: 606) |
| Distinct output tuples | 732 |
| Unreachable combinations (no golden output) | 60 ignoring style = 460 with styles |
| Full cartesian product | 46 × 6 × 11 × 2 = 6072 = 5612 + 460 |
| Stale-style samples (`staleStyle`) | 30 (every ordered proficiency pair) |

**Unreachable:** specialization ≠ Devouring together with type = Devouring (5 specs × 2 smart × 6 proficiencies).
Selecting type Devouring forces specialization Devouring; leaving specialization Devouring resets type to Laser.
(If the functions were called directly with such a state the clip text would be `reload after  uses` with an empty
clip size for ranged weapons — this can never be rendered.)

**Format** (also in the `format` key of the JSON): each entry has `input` (five control values read from the DOM),
`reach`, `styleVia`, `ui` (disabled-class flags), `output` (five lines, whitespace collapsed — compare against this),
`raw` (exact `textContent` of the four short lines). `specialRaw` maps each collapsed special text to its exact
`textContent` (template literals contain newlines + 8-space indents that HTML collapses). Top-level `options`,
`initialState`, `unreachable`, `staleStyle`, `counts`.

A verifier of the rewritten component should: render it, set the five inputs, read the five lines, collapse
whitespace and compare with `output`. Comparing a pure function is enough only if the DOM assembly (section 5) is also
checked.

## 2. Inputs and initial state

| State | Control | Initial | Options |
|---|---|---|---|
| `proficiency` | `<select name="proficiency">`, `onChange` → `setProficiency` only | `simpleMelee1h` | 6, see 3.1 |
| `style` | `<select name="style">`, `onChange` → `setStyle` only | `Club` | list depends on proficiency, see 3.2 |
| `specialization` | `<select name="specialization">`, `onChange` → `changeSpecialization` | `Heavy` | 6, see 3.3 |
| `type` | `<select name="type">`, `onChange` → `changeType` | `Laser` | 11, see 3.4 |
| `smart` | `<input type="checkbox" name="smart">`, `onChange` → `setSmart(!smart)` | `false` | — |

Labels are plain `<label>` elements with no `htmlFor` and not wrapping the control (clicking a label does nothing).
Heading `Kodning Weapon Creator` (h2), `Result:` (h3), then a `Button` with text `Back` (default type → `router.back()`).
There is no submit; the result re-renders live on every change. No persistence, no URL state, no network.

## 3. Data tables (verbatim, order is the rendered order)

### 3.1 `weaponProficiencies` (value → label)
`simpleMelee1h` Simple melee · `simpleRanged1h` Simple ranged · `martialMelee1h` Martial melee one-handed ·
`martialMelee2h` Martial melee two-handed · `martialRanged1h` Martial ranged one-handed · `martialRanged2h` Martial ranged two-handed

### 3.2 `weaponStyles` (46 in total)
- simpleMelee1h (9): Club, Dagger, Handaxe, Mace, Sickle, Spear, Hammer, Tanto, Hatchet
- simpleRanged1h (1): Pistol
- martialMelee1h (17): Flail, Straight sword, Curved sword, Rapier, Scimitar, Battleaxe, War pick, Warhammer, Whip, Trident, Morningstar, Fist weapon, Gladius, Wakizashi, Saber, Claw weapon, Shotel
- martialMelee2h (17): Greataxe, Greatsword, Halbert *(sic)*, Lance, Maul, Pike, Glaive, Claymore, Katana, Nodachi, Twinblade, Scythe, Yari, Naginata, Zweihänder, Flamberge, Falx
- martialRanged1h (1): Gun
- martialRanged2h (1): Rifle

### 3.3 `weaponSpecializations` (attribute → option; option value = label)
strength → Heavy · dexterity → Reflex · intelligence → BCI · wisdom → Precognition · charisma → Observer effect · constitution → Devouring

### 3.4 `weaponTypes` (damage type → option; option value = label)
radiant → Laser · fire → Plasma · piercing → Kinetic · bludgeoning → Gravity · cold → Cryogenic · acid → Acidic ·
lightning → Tesla · thunder → Sonic · poison → Toxic · necrotic → Radiation · physical → Devouring

### 3.5 `specialEffects`
22 keys `<damageType><1h|2h>`; 20 distinct texts (radiant1h = radiant2h, physical1h = physical2h). The exact texts
(including the typos listed in section 6) are in the source lines 268–328 and, as rendered, in the golden file
(`specialRaw`). Differences between 1h and 2h: fire 1d6/1d8; piercing ignore 2/3 AC; bludgeoning 1d4 & 5 ft / 1d6 & 7.5 ft;
cold DC 14/16; acid DC 14/16; lightning 2d8/3d8; thunder DC 16/18; poison 2d6/3d6; necrotic DC 18/20.

## 4. Rules and couplings

1. **Proficiency change** — only `setProficiency`. The style option list is rebuilt from `weaponStyles[proficiency]`.
   **`style` state is not reset** (see quirk Q1). Specialization, type and smart are untouched.
2. **Style change** — only `setStyle`. Style is used in **no** output. It exists purely as a selector.
3. **Specialization change** (`changeSpecialization`):
   - new value `Devouring` → `type := 'Devouring'`, `smart := false`;
   - else if current `type === 'Devouring'` → `type := 'Laser'` (smart stays false, not restored);
   - else type and smart unchanged.
4. **Type change** (`changeType`): sets type; if new value is `Devouring` → `specialization := 'Devouring'`, `smart := false`.
   Changing type *away* from Devouring does **not** touch specialization (only possible by keyboard, see Q2).
5. **Smart** toggles freely; nothing else reacts to it.
6. **"Disabled" look**: when `specialization === 'Devouring'` the type select gets class `disabledSelect` and the checkbox
   `disabledCheckbox` (CSS: `pointer-events: none; background #1d0000; font-weight bold; cursor not-allowed`).
   Neither element gets the `disabled` attribute. The condition is on specialization only, not on type.

## 5. Outputs (five lines) and how they are computed

JSX (the `{" "}` separators matter):
```
<p><span>Attack:</span> {attackBonus} {attribute} modifier + proficiency bonus</p>
<p><span>Damage:</span> {weaponDamage} {damageType}</p>
<p><span>Range:</span> {range} feet</p>
<p><span>Ammo:</span> {clipAmmo}, {totalAmmo} total ammo</p>
<p><span>Special:</span> {specialEffect}</p>
```
`hand` = `proficiency.slice(-2)` (`1h`/`2h`). `attribute` = key of `weaponSpecializations` whose value is the
specialization. `damageType` = key of `weaponTypes` whose value is the type.

- **Attack bonus**: only when `type === 'Laser'`: `'3 +'` for `martialRanged2h` or `martialMelee2h`, otherwise `'2 +'`.
  Any other type → `undefined` (renders nothing). Text: `Attack: 2 + strength modifier + proficiency bonus` /
  `Attack:  dexterity modifier + proficiency bonus` (two spaces in the DOM, one visually).
- **Damage dice** (`getWeaponDamage`):

  | proficiency | spec = Devouring | smart (not Devouring) | otherwise |
  |---|---|---|---|
  | simpleMelee1h | `2d10 / 1d10` | `1d10` (smart ignored) | `1d10` |
  | simpleRanged1h | `4d4 / 2d4` | `2d4` (smart ignored) | `2d4` |
  | martialMelee1h | `4d10 / 2d10` | `3d4` | `2d10` |
  | martialMelee2h | `6d10 / 3d10` | `2d10` | `3d10` |
  | martialRanged1h | `8d4 / 4d4` | `3d4` | `4d4` |
  | martialRanged2h | `6d6 / 3d6` | `4d4` | `3d6` |

  The Devouring branch is checked first, so Devouring + smart keeps the Devouring dice.
- **Damage line** (`displayWeaponDamage`): smart → `<dice>`; not smart → `<dice> + <attribute> modifier`; then a space and
  `damageType`. E.g. `Damage: 1d10 + strength modifier radiant`, `Damage: 3d4 fire`,
  `Damage: 2d10 / 1d10 + constitution modifier physical`.
- **Range**: martialRanged2h `150/600`; simpleRanged1h, martialRanged1h `30/60`; martialMelee2h `10`; else `5`; + ` feet`.
  Independent of everything but proficiency.
- **Clip** (`getClipSize`), only when specialization ≠ Devouring:

  | type | 1h ranged (simple/martial) | martialRanged2h |
  |---|---|---|
  | Gravity | 3 | 4 |
  | Tesla, Toxic | 4 | 5 |
  | Laser, Plasma, Kinetic, Cryogenic, Acidic | 5 | 6 |
  | Radiation, Sonic | 6 | 7 |

  Melee proficiencies, or specialization Devouring → `unlimited`. Text: `reload after N uses` or `unlimited`.
- **Total ammo**: martialRanged2h → `11`; simpleRanged1h/martialRanged1h → `9` (both only if specialization ≠ Devouring);
  else `unlimited`. Independent of type. Line: `Ammo: reload after 5 uses, 9 total ammo` / `Ammo: unlimited, unlimited total ammo`.
- **Special**: `specialEffects[damageType + hand]`. Depends on type and hand only (not on specialization or smart).

## 6. Bugs and quirks that must be PRESERVED

- **Q1 Stale style.** After a proficiency change the React `style` state keeps the old value (e.g. `Club` or `Hatchet`)
  although it is not in the new option list. The controlled select has no matching option, so the browser shows the
  first option of the new list (Flail, Greataxe, Pistol, Gun, Rifle). Going back to the old proficiency re-selects the
  remembered style (e.g. simple melee/Hatchet → martial → simple melee shows Hatchet again). No output is affected
  because style is never rendered in the result. Samples in `staleStyle`; entries with
  `styleVia: "implicit-first-option"` are such states (state still `Club`).
  *A rewrite may show the style in a schematic readout only if it shows what the select shows; today nothing shows it.*
- **Q2 The "disabled" controls are not disabled.** With specialization Devouring, type select and checkbox only get
  `pointer-events: none`. They stay focusable and operable by keyboard. This makes 966 extra states reachable
  (`reach: "keyboard-only"`): specialization Devouring with any non-Devouring type and/or smart = true. Their outputs:
  attribute `constitution`, Devouring dice, damage type and special of the chosen type, laser attack bonus if Laser,
  ammo `unlimited, unlimited`, no modifier text if smart (e.g. `Damage: 8d4 / 4d4 bludgeoning`). From such a state,
  switching specialization to a non-Devouring value keeps the non-Devouring type and smart as they are.
  The golden file records these so that a rewrite either reproduces them or (if it truly disables the controls) can
  show that only keyboard-only entries became unreachable — that is an owner/orchestrator decision, not a silent change.
- **Q3 Simple weapons ignore smart for dice** but smart still removes the `+ <attribute> modifier` part.
- **Q4 Smart changes the die type**, not just the count: martialMelee1h 2d10 → 3d4, martialRanged2h 3d6 → 4d4,
  martialRanged1h 4d4 → 3d4, martialMelee2h 3d10 → 2d10.
- **Q5 Attack line without Laser** has an empty bonus: DOM text `Attack:  <attr> modifier…` (double space; one space on screen).
- **Q6 Laser bonus by hand**: `3 +` for both two-handed martial proficiencies (melee and ranged), `2 +` for all others.
- **Q7 Leaving Devouring** via the specialization select resets type to `Laser` (not to the previous type) and leaves smart false.
- **Q8 Selecting Devouring** by either select silently clears smart.
- **Q9 Devouring ranged weapons** have unlimited ammo/clip but keep the ranged range (30/60, 150/600).
- **Q10 Total ammo** ignores type; clip size ignores the simple/martial distinction for 1h.
- **Q11 Text content quirks** (keep verbatim): `Halbert`; `ACR (acute radiation syndrome)`; possessive `it's` throughout;
  `proned`; Acidic weapons deal `psychic` extra damage on a failed `WIS` save; `mass increase  -` (two spaces in source);
  radiant and physical texts identical for 1h/2h; the damage line prints the D&D damage type key (`radiant`, `fire`,
  `physical`, …), and the attack line the attribute key in lower case (`strength`, `constitution`, …).
- **Q12 Multi-line special texts** (bludgeoning lists with `- mass reduction` / `- mass increase`) are rendered in a
  normal `<p>`, so the line breaks collapse into one paragraph. `specialRaw` keeps the uncollapsed text.
- **Q13** `changeSpecialization` reads `type` from the render closure; with one event per render this is exactly rule 3.
- **Q14** The `Back` button calls `router.back()` (does nothing useful when the page was opened directly). The CSS class
  `detailsContainer` is unused.

## 7. What could differ from a real browser

- jsdom instead of a browser: no layout/CSS, so `pointer-events: none` was modelled by the BFS "pointer" mode rather
  than observed. Text output is DOM `textContent`, identical in any browser.
- `Button` stubbed; it contributes only the `Back` link.
- The generator fires one event per render (as a user does); batched multi-events were not explored.
- A spot check in the running app (dev server, `/kodning_weapon_creator`) is recorded in `baseline/visual-notes.md`.
