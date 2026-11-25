# 01 — Investigation A: Frontend

Scope: every file under `src/app`, `src/components`, `src/context`, `src/utils`, `src/icons`, `public/` (read 2025-07 state of `main`, commit `7b0afe7`). Read-only; the app was **not** run. Anything marked **(computed)** is derived from the CSS/JS by reasoning and should be confirmed against Agent D's screenshots.

Installed versions seen in `node_modules`: next 15.3.0, react 18.3.1, react-swipeable 7.0.2.

---

## 1. Route map

Every page is an `async` server component that wraps its content in `<Main>` (`src/components/Main/Main.js`). `Main` runs `getCrew()` and `getSubsystems()` (sequentially, `Main.js:11-12`) on **every** page and passes the rows to the client shell `MainPanel`. There is no shared layout shell: `src/app/layout.js` only renders `<html><body><div id="root">` (`layout.js:6-13`).

| Route | File | Renders | Data loaded | Rendering mode (from `build/prerender-manifest.json`) |
|---|---|---|---|---|
| `/` | `src/app/page.js` | `Main` > `ShipStatus` (full-screen background image only) | crew + subsystems (via `Main`) | **Static, prerendered at build** |
| `/ship_record/[record_id]` | `src/app/ship_record/[record_id]/page.js` | `Main` > `SearchResult data editable={true}` | `getShipRecordById(id)` + crew + subsystems | Dynamic |
| `/crew_member/[crew_member_id]` | `src/app/crew_member/[crew_member_id]/page.js` | `Main` > `SearchResult data editable={false}` | `getCrewMemberById(id)` + crew + subsystems | Dynamic |
| `/subsystem/[subsystem_id]` | `src/app/subsystem/[subsystem_id]/page.js` | `Main` > `SearchResult data editable={false}` | `getSubsystemById(id)` + crew + subsystems | Dynamic |
| `/add_ship_record` | `src/app/add_ship_record/page.js` | `Main` > `ShipRecordCreator` (create mode) | crew + subsystems | **Static, prerendered at build** |
| `/edit_ship_record/[record_id]` | `src/app/edit_ship_record/[record_id]/page.js` | `Main` > `ShipRecordCreator predefinedData={row}` | `getShipRecordById(id)` + crew + subsystems | Dynamic |
| `/kodning_weapon_creator` | `src/app/kodning_weapon_creator/page.js` | `Main` > `WeaponCreator` | crew + subsystems | **Static, prerendered at build** |
| `POST /api/search` | `src/app/api/search/route.js` | JSON `[ {source, displayProperty, data[]} ×3 ]` | `globalSearch(keyword)` | — |
| `POST /api/create` | `src/app/api/create/route.js` | JSON (insert result or `[]`) | `createRecord(title, text)` | — |
| `PUT /api/edit` | `src/app/api/edit/route.js` | JSON (update result or `[]`) | `updateRecord(id, title, text)` | — |

Findings about routing:

- **Stale data on static routes.** `/`, `/add_ship_record` and `/kodning_weapon_creator` use no dynamic API, so Next prerenders them (`initialRevalidateSeconds: false`). The crew list and subsystem statuses shown on those three pages are frozen at build time, while the `[id]` routes show live data. Nothing calls `revalidatePath`.
- **No `not-found.js`, `error.js` or `loading.js` anywhere.** A missing id gives `data === undefined`:
  - `SearchResult` then throws on `Object.entries(data)` (`SearchResult.js:37`) → generic 500.
  - `ShipRecordCreator` receives `predefinedData={undefined}`, the default `{}` kicks in (`ShipRecordCreator.js:10`) and the edit URL silently shows an empty **create** form.
  - A non-numeric id reaches Postgres and errors → 500.
- `params` is already awaited (`const x = await params`), so the Next 15+ async-params change is handled.
- There is **no link to `/`** anywhere in the UI. The only way home is the Back button or editing the URL.
- All navigation entry points ("+" add record, "Weapon creator") live inside the crew panel (`CrewList.js:19-24`), which is a hidden drawer on mobile.
- No auth: `/add_ship_record`, `/edit_ship_record/*` and the two mutating API routes are public. API routes do no validation beyond non-empty strings and return 200 with `[]` on invalid input (`api/create/route.js:9-14`, `api/edit/route.js:9-14`).
- Metadata is only `title`/`description` (`layout.js:1-4`). No `viewport`/`themeColor` export, no manifest link.

---

## 2. Component inventory

"Client" below means the file has `"use client"`. Because `MainPanel` (client) imports almost everything, **every component except `Main` and `ShipStatus` runs as client code**, whether or not it has the directive.

### Shell

| Component | Kind | Props | State | Used by | Notes / smells |
|---|---|---|---|---|---|
| `Main` (`Main/Main.js`) | Server, async | `children` | — | every page | Imports global `Main.css`. Two sequential DB queries on every page (`:11-12`). Passes `children` as an explicit prop (`:17`, `react/no-children-prop`). Wrapper divs `.App` / `.main` are CRA leftovers. |
| `MainPanel` (`MainPanel/MainPanel.js`) | Client | `data {crewMembers, subsystems}`, `children` | `panelFocused` (`''｜'left'｜'right'｜'top'`), `selectedSubsystem`, `keyword` | `Main` | Owns the panel state machine, the document-level swipe and the `KeywordContext` provider. See section 3. `useEffect` without a dependency array re-attaches the swipe listeners after **every** render (`:29-33`). Context value object recreated each render (`:26`). Two near-identically named functions `focusedPanel` (toggle logic, `:47`) and `focusPanel` (plain set, `:57`). |
| `TopPanel` (`TopPanel/TopPanel.js`) | Client | `children`, `panelFocused`, `focusPanel` | — | `MainPanel` | Drop-down drawer holding `ShipOverview`. Also renders two invisible full-width swipe zones (`:49-50`). Uses the v6 option name `preventDefaultTouchmoveEvent` (`:14`, `:21`), which react-swipeable 7 ignores. |
| `SidePanel` (`SidePanel/SidePanel.js`) | Client | `children`, `position ('left'｜'right')`, `panelFocused`, `focusPanel` | — | `MainPanel` ×2 | Mobile toggle is a `<div onClick>` with hard-coded labels "Crew"/"Location" (`:40-42`). Checks for `panelFocused !== 'bottom'` (`:11`) but `'bottom'` is never set anywhere. |
| `BottomPanel` (`BottomPanel/BottomPanel.js`) | Client | `children` | — | `MainPanel` | Pure positioning wrapper for the search form. Styles its child through `.askXaroContainer > div` (`BottomPanel.module.css:7`). |
| `Button` (`Button/Button.js`) | No directive, but calls `useRouter()` (`:8`) | `type ('link'｜'onclick'｜'')`, `action (string｜function｜'')`, `text`, `extraClass` | — | TopPanel, SidePanel, CrewList, SearchResult, ShipRecordCreator, WeaponCreator | See "Button bugs" below. |

**Button bugs (`Button/Button.js`)**

- Every non-link button is an `<a href="#">` (`:16`, `:18`) with no `preventDefault`. Clicking close "<", expand "< >", Create/Update appends `#` to the URL and pushes a history entry.
- The default variant is a **Back** button: `<a href="#" onClick={() => router.back()}>` (`:18`). `history.back()` plus a simultaneous `#` navigation is a known unreliable pattern; after any other `href="#"` button was pressed, Back first only removes the hash. Needs checking in a real browser.
- Not a `<button>`: no `disabled` state, Space does not activate it, screen readers announce a link.
- `styles[extraClass]` (`:11`) is a dynamic lookup by string; page-specific positioning (`.addRecordButton` is `position:absolute`, `Button.module.css:13-20`) lives inside the generic button stylesheet.
- No `:hover` or `:focus` style at all (`Button.module.css`); the only feedback is the global `a:active` green flash (`Main.css:22-26`).
- Works only because every importer is a client component; it would break the moment a server component imports it.

### Left panel (crew)

| Component | Kind | Props | State | Used by | Notes |
|---|---|---|---|---|---|
| `CrewList` (`CrewList/CrewList.js`) | Client | `crewMembers[]` | `expandedMemberId` | `MainPanel` | Accordion + the two nav buttons, hidden on their own route via `usePathname().includes(...)` (`:20-21`). Scrolls only at ≥1000px (`CrewList.module.css:18-22`). |
| `CrewMember` (`CrewMember/CrewMember.js`) | No directive (client by import) | `toggleCrewMember`, `expanded`, `data {id, first_name, last_name, crew_rank, race, composition, current_status, expertise}` | — | `CrewList` | Toggle is `<h3 onClick>` (`:9`, `:21`): not focusable, no `aria-expanded`. Markup duplicated for the two states. Does **not** link to `/crew_member/[id]`; that page is reachable only through search. |

### Top bar / top drawer (ship)

| Component | Kind | Props | State | Used by | Notes |
|---|---|---|---|---|---|
| `ShipPanel` (`ShipPanel/ShipPanel.js`) | Client | `subsystems[]`, `selectSubSystem(id)` | — | `MainPanel` | **Hard-coded id whitelist** `1,2,4,6,7,8` marked "TEMP" (`:12`); will break when ids change with the new `entities` table. `KodningReserves` value hard-coded to `'2.5%'` (`:31`). |
| `ShipSystem` (`ShipSystem/ShipSystem.js`) | No directive | `selectSubSystem`, `type`, `systemStatus`, `id` | — | `ShipPanel` | `<div onClick>` (`:21`). `displayStatus` duplicated from `ShipOverview` with a TODO (`:8`); anything other than the exact string `'Online'` shows "Offline". |
| `KodningReserves` (`KodningReserves/KodningReserves.js`) | No directive | `reservePercentage` (CSS width string) | — | `ShipPanel` | Inline `style={{width}}` (`:7`). No `role="progressbar"`. Class typo `kondingCurrentText`. Label is 0.9rem = **9px** on phones ≤410px. |
| `ShipOverview` (`ShipOverview/ShipOverview.js`) | Client | `subsystems[]`, `preselectedSubsystem` | `selectedTab` | `MainPanel` (inside `TopPanel`) | Accordion of all subsystems. Non-standard DOM attribute `subsystem={id}` (`:38`) read back with `getAttribute` (`:15-18`), so the state flips between number (from `ShipPanel`) and string (from clicks); hence the loose `==` on `:38`. Consequence: a subsystem preselected from the top bar needs **two clicks** to collapse (string `"3" === 3` is false on `:15`). Re-clicking the same subsystem in `ShipPanel` after collapsing it does nothing, because `preselectedSubsystem` did not change and the effect (`:10-12`) does not re-run. An `<h1>` plus three `<h2>` per row are used for layout (`:36`, `:40-42`). Rows are `<div onClick>`. Does not link to `/subsystem/[id]`. |

### Right panel

| Component | Kind | Props | State | Used by | Notes |
|---|---|---|---|---|---|
| `CelestialBodyDetails` (`CelestialBodyDetails/CelestialBodyDetails.js`) | No directive | none | — | `MainPanel` (right `SidePanel`) | **Entirely hard-coded text** ("Galaxy: Damortia", everything else N/A/UNKNOWN/NONE, `:6-17`). There is no star map: none of the map images or icons are used. |

### Centre content

| Component | Kind | Props | State | Used by | Notes |
|---|---|---|---|---|---|
| `ShipStatus` (`ShipStatus/ShipStatus.js`) | Server | none | — | `/` | One empty `position:fixed` div with a background image and a keyframe that swaps to `static.gif` for ~0.3s every 30s (`ShipStatus.module.css:1-22`). The name is misleading: it shows no status. |
| `SearchResult` (`SearchResult/SearchResult.js`) | Client | `data` (raw DB row), `editable` | `expanded` | the three detail pages | Generic "dump every column" view, see section 4. |
| `InteractiveWord` (`InteractiveWord/InteractiveWord.js`) | Client | `word`, `searchForWord` | — | `SearchResult` | `<span onClick>`, colour `#99799f`, no hover/focus/active state. |
| `ShipRecordCreator` (`ShipRecordCreator/ShipRecordCreator.js`) | Client | `predefinedData = {}` (`{id,title,text}` in edit mode) | `title`, `data`, `inputDisabled`, `created`, `titleHighlighted`, `dataHighlighted`, `createButtonText` | `/add_ship_record`, `/edit_ship_record/[id]` | See section 5. |
| `WeaponCreator` (`WeaponCreator/WeaponCreator.js`) | Client | none | `proficiency`, `style`, `specialization`, `type`, `smart` | `/kodning_weapon_creator` | 327 lines; rule functions `:48-179`, data tables `:231-328`. See section 9 for behaviours that must be preserved. |

### Search widgets

| Component | Kind | Props | State | Used by |
|---|---|---|---|---|
| `Form` (`Form/Form.js`) | Client | none | `searchResults` | `MainPanel` (inside `BottomPanel`) |
| `FormInput` (`FormInput/FormInput.js`) | Client | `keyword`, `setKeyword` | `inputValue` | `Form` |
| `FormResults` (`FormResults/FormResults.js`) | No directive | `results = []` | — | `Form` |

### Context and utils

- `src/context/KeywordContext.js` — `createContext({keyword:"", setKeyword:()=>{}})`. Provided by `MainPanel` (`:67`), consumed by `Form` (`:12`) and `SearchResult` (`:15`). `SearchResult` destructures `keyword` but never uses it.
- `src/utils/data_functions.js` — default export `IsWordInteractive(word)`: `word.length > 3` and not in a 51-word stop list. Used only by `SearchResult.js:24`. Rebuilds the array on every call (called once per word of the text).
- `src/utils/string_functions.js` — `capitalizeFirstLetter`. **Unused.**

---

## 3. Layout shell and panel/swipe mechanism

### 3.1 DOM order and stacking

`MainPanel.js:68-86` renders, inside `.mainContainer` (flex column, 100%×100%, black, `MainPanel.module.css:1-8`):

1. `TopPanel` div — **in normal flow**, `position:relative`, z 2 (z 4 at ≥1000px)
2. `TopSwipableArea` — absolute, top 20% of the screen, z 1, invisible
3. `BottomSwipableArea` — absolute, bottom 20% of the screen, z 1, invisible
4. Left `SidePanel` — `position:fixed`, z 2
5. `ShipPanel` — absolute, top centre, z 1
6. `{children}` — the page content, **in normal flow**, `position:relative`, z 1 (z 4 when "expanded")
7. `BottomPanel` — absolute, `bottom:3rem`, z 3
8. Right `SidePanel` — fixed, z 2

Nothing scrolls at page level: `body {overflow:hidden; touch-action:none}` (`Main.css:10-15`) and `.main {overflow:hidden}` (`Main.css:20`).

### 3.2 How the top drawer is hidden (the core fragility)

The top drawer is not translated off-screen; it is an in-flow flex item pulled up with a **negative percentage `margin-top`** (`TopPanel.module.css:8`, `:71`, `:80`, `:89`, `:101`, `:110`). Percentage margins resolve against the container's **width**, while the drawer's `height` is a percentage of the viewport **height**, plus `padding-bottom: 4rem` (content-box). So:

```
bottom edge of hidden drawer = marginTop% × W + height% × H + 4rem
```

It is hidden only if that is ≤ 0, which depends on the aspect ratio. That is why there are six stacked breakpoints tuning `margin-top` from -100% to -220%.

The page content is the next in-flow item, so its position depends on the drawer's leftover negative space. Every content component compensates with its own width-based `margin-top` (`SearchResult.module.css:4,64,94,108,114,128`; `ShipRecordCreator.module.css:4,74,96,106,115,124`; `WeaponCreator.module.css:4,99,115,122,128,134`):

```
content top = (drawer marginTop% × W + drawer height% × H + 4rem) + content marginTop% × W
```

Worked examples **(computed)**:

| Viewport | Rules that win | Drawer bottom edge | Content top | Verdict |
|---|---|---|---|---|
| 1920×1080 | ≥1000 | -987px | 249px | As designed |
| 1440×900 | ≥1000 | -651px | ~247px after flex-shrink squeezes both items | OK, but only because flexbox shrinks them |
| 2560×1080 ultrawide | ≥1000 | -1627px | ~22px | Content slides up over the ship bar |
| **1366×~650 (768p laptop, browser chrome)** | `max-height:700` overrides ≥1000 | -2224px | **≈ -1020px** | **Content entirely off-screen** |
| **844×390 (phone landscape)** | only `max-height:700` (no width rule matches) | -1363px | **≈ -620px** | **Content entirely off-screen** |
| 820×1180 (iPad portrait) | none (base rules) | **+176px** | — | **Hidden drawer hangs ~176px into view** |
| 768×1024 | ≤810 | ~+109px before shrink | — | Drawer peeks into view |
| 412×915 (Pixel, URL bar hidden) | ≤450 | **+66px** | 190px | Drawer strip visible; hidden again at ~785px viewport height (URL bar shown) |
| 390×844 | ≤400 | -118px | 206px | As designed |
| 375×667 | `max-height:700` | -198px | 132px | As designed (this is what the height rule was tuned for) |

Key points:

- `@media (max-height: 700px)` is the last block in four files and has no width condition, so it also applies to **short desktop windows and all landscape phones**, where its `margin-top: 88%` / `-206%` values are nonsense.
- The layout shifts whenever the mobile URL bar collapses or expands, because `height: N%` follows the viewport height but the margins follow the width.
- When the drawer opens (`margin-top:0`, `.expandedTopPanel`) it pushes the page content down by its full height; the content is simply clipped by `overflow:hidden`.
- Duplicate `@media (max-width: 450px)` blocks in `TopPanel.module.css:68-76` and `:77-85`; the first is dead.

### 3.3 Panel state machine (`MainPanel.js:22`, `:47-64`)

`panelFocused` is one string: `''`, `'left'`, `'right'` or `'top'`.

- `focusPanel(x)` — direct set. Used by the mobile toggles (`SidePanel.js:28-31`), the "<" close buttons (`SidePanel.js:33-35`, `TopPanel.js:39-41`) and the vertical swipes.
- `focusedPanel(x)` — if another panel is open, close it; otherwise open `x`. Used by horizontal swipes and by `selectSubSystem` (`:61-64`).

### 3.4 Gestures (react-swipeable 7.0.2)

| Gesture | Where | Code | Effect |
|---|---|---|---|
| Swipe left | anywhere on `document` | `MainPanel.js:35-45` | open right panel, or close whichever panel is open |
| Swipe right | anywhere on `document` | same | open left panel, or close whichever panel is open |
| Swipe down | invisible strip, top 20% of screen | `TopPanel.js:10-15`, `TopPanel.module.css:33-40` | open top drawer |
| Swipe up | invisible strip, bottom 20% of screen | `TopPanel.js:17-22`, `TopPanel.module.css:41-48` | close any panel |

Details and fragility:

- Document swipe config: `delta {left:25,right:25,up:50,down:50}`, `swipeDuration: 200` (`MainPanel.js:42-44`). A 25px flick within 200ms anywhere — inside the search input, the textarea, a `<select>`, or while scrolling a list — toggles a side drawer.
- The listener is attached by calling the hook's `ref` with `document` inside an effect with **no dependency array** (`MainPanel.js:29-33`), and detached by calling it with `{}`. It works only because the library checks `el && el.addEventListener`; it re-binds on every render (every keystroke of the search debounce, every state change).
- `preventDefaultTouchmoveEvent: true` (`MainPanel.js:43`, `TopPanel.js:14,21`) is the v6 name. In v7 the option is `preventScrollOnSwipe`, so this is a **no-op**. The global `touch-action: none` on `body` is what actually stops the browser from scrolling during swipes — which is why it was added.
- The document swipe is active at every width. On a touch laptop or tablet ≥811px it silently sets `panelFocused` to `'left'`/`'right'` with no visual change (the expanded class only exists inside `@media (max-width:810px)`, `SidePanel.module.css:110-116`). The next tap on a subsystem then *closes* that invisible panel instead of opening the top drawer (`MainPanel.js:48-51`) — a "first click does nothing" bug.
- The two vertical swipe strips are z 1 and come **before** `ShipPanel` and the page content in the DOM, both also z 1, so those paint over them. A swipe-down only registers in the part of the top 20% not covered by the ship bar or the content; a swipe-up only in uncovered parts of the bottom 20%. In practice the top drawer is opened by tapping a subsystem in the ship bar, and the vertical swipes are close to unusable **(computed)**.
- `trackMouse` is off, so there is no drag on desktop.

### 3.5 Desktop (≥1000px)

- Left and right `SidePanel`: fixed, 20% wide, 75% tall, `top:12.5%` (`SidePanel.module.css:3-18`). Always visible; their "<" buttons are hidden (`:72-79`); toggles are `display:none`.
- `ShipPanel`: absolute, 60rem (960px) wide, centred with a transform (`ShipPanel.module.css:1-14`).
- Content: 59% wide, centred, positioned by the margin arithmetic in 3.2.
- Top drawer: 59% wide, z 4, opened by clicking a subsystem; closed only by its rotated "<" link.
- Search input: 30rem wide, centred, `bottom:3rem`, overlapping the bottom padding of the content box.

### 3.6 Mobile (≤810px)

- Root font-size drops to 12px, then 10px at ≤410px (`Main.css:29-38`), so every `rem` shrinks as the screen gets smaller.
- Side panels are pushed off-screen with `margin-left/right: -18.2rem` (`SidePanel.module.css:88-100`) and brought back with `.ExpandedPanel {width:100%; margin:0}` (`:110-116`). Only `height` and `width` are transitioned (`:83`), so the margin change snaps.
- Each hidden panel exposes a `position:fixed` vertical tab ("Crew" left, "Location" right, `SidePanel.module.css:23-39`), 2rem + 1rem padding wide = **36px, or 30px at ≤410px**. Both tabs disappear while any panel is open (`SidePanel.js:9-16`).
- The ship bar becomes full width with a CSS-border trapezoid (`.cornerStyle`, `ShipPanel.module.css:47-57`) using a magic `top:49px` and `width:-webkit-fill-available` (no Firefox equivalent given).
- The six subsystem tiles need 38.4rem. At a 10px root that is 384px: clipped on 360px and 375px wide phones **(computed)**.
- The record detail page offers a "< >" button that toggles `.ExpandedSearchContainer` (full screen, z 4, `height:110%`, `SearchResult.module.css:14-19`, `:96-99`, `:120-123`). It exists as a workaround because the text does not scroll (section 6.4).

### 3.7 The 811–999px dead zone

Most files switch to mobile at `max-width:810px` and to desktop at `min-width:1000px`. Between them **neither set applies**:

- Side panels are fixed at 20% width (desktop style) but their "<" hide buttons are visible (they are hidden only at ≥1000px) and do nothing visible.
- Content and top drawer use the base 80% width, sliding under the two 20% side panels (z 2 over z 1).
- The ship bar stays 960px wide and is clipped on both sides below 960px.
- `CelestialBodyDetails` and `ShipOverview` use `max-width:1000px` as their mobile switch, so they are already in mobile style (`height:100vh` inside a 75%-tall panel).

Phones in landscape (844×390, 915×412, 932×430) and an iPad in portrait (820px) land exactly here.

### 3.8 State lifetime

`MainPanel` is rendered inside each page, not in `layout.js`, so it **remounts on every navigation**. Open panel, expanded crew member, search keyword and result list are all lost when the route changes. The search dropdown closing after you click a result is a side effect of this, not a designed behaviour.

---

## 4. Search flow today

1. **Input** — `FormInput.js:29-37`: `<input type="text" placeholder="Ask X'aro">`, no `<form>`, no label, no submit. Local `inputValue` state; `useDebouncedCallback` (500ms, `:16-22`) calls `setKeyword(value)` if the trimmed value is non-empty. The untrimmed value is stored.
2. **Context** — `keyword` lives in `MainPanel` state (`MainPanel.js:25-26`) and is shared through `KeywordContext`. `FormInput` mirrors context → local state in an effect (`FormInput.js:12-14`), which is how a clicked word appears in the box.
3. **Fetch** — `Form.js:14-29`: effect on `keyword` → `POST /api/search` with `{keyword}` → `setSearchResults(json)`.
4. **Server** — `api/search/route.js:6-15` → `globalSearch` (`db.js:77-85`): three sequential `ILIKE '%kw%'` queries, each `LIMIT 10`, returning `[{source:'crew_member', displayProperty:'first_name', data}, {source:'subsystem', displayProperty:'current', data}, {source:'ship_record', displayProperty:'title', data}]` with **full rows** (`SELECT *`).
5. **Dropdown** — `FormResults.js:5-32`: for each non-empty group, one `<Link href="/{source}/{id}">` per row showing `row[displayProperty]`. If the response had groups but all were empty: a fake `<a href="#">No results</a>` (`:21-22`). Rendered in an absolutely positioned box above the input (`FormResults.module.css:1-14`).
6. **Detail** — the link opens the matching `[id]` page, which renders `SearchResult`.
7. **Click-a-word** — `SearchResult.js:18-34`: every field value is split on a single space; words longer than 3 characters that are not stop words and not equal to `data.title` become `InteractiveWord`s. Clicking one calls `setKeyword(word)`, which re-runs step 3 and fills the dropdown and the input. It does not navigate.

Problems:

- **No results page**; up to 30 undifferentiated links with no type label. A crew member shows only the first name; a subsystem shows its `current` value.
- **Cannot be dismissed.** Clearing the input does not clear `keyword` (`FormInput.js:18`) or `searchResults` (`Form.js:26`). No close button, no Escape, no outside click. It disappears only when navigation remounts the shell.
- **No max-height/scroll** on the dropdown; 30 rows will run off the top of a phone screen.
- **Hidden behind the expanded view.** In expanded mode the detail container is z 4 and the search panel is z 3, so clicking a word there produces results you cannot see **(computed)**.
- Race condition: no `AbortController`; a slow earlier response can overwrite a newer one. No loading, error or `response.ok` handling; a failed fetch is an unhandled rejection.
- `POST` for a read: not shareable, not cacheable, no back/forward.
- Words are split on `' '` only: punctuation stays attached (`"reactor,"` is searched with the comma), newlines are not split and line breaks in records are lost.
- `value.split` (`SearchResult.js:19`) throws if any column is `null`, a number or a date. Only `id` is skipped (`:38`).
- `key.replace('_',' ')` (`:40`) replaces only the first underscore; column names are shown raw as labels.
- The heading is always "Search results" (`:53`), even for a record opened directly.
- Each word is its own `<span>` in a `display:flex; flex-wrap:wrap` container (`SearchResult.module.css:54-60`). Long records create thousands of nodes, text cannot be selected normally, and a screen reader gets a word list.
- Edit link is built with backslashes: ``action={`\\edit_ship_record\\${data.id}`}`` (`SearchResult.js:61`) → href `\edit_ship_record\5`. It relies on URL normalisation of `\` to `/`.
- `FormResults` mutates a closure flag inside `.map` and returns `undefined` for empty groups (`FormResults.js:7-19`).

---

## 5. Record create/edit flow

Entry points: "+" in the crew panel → `/add_ship_record`; "Edit" on a ship record → `/edit_ship_record/[id]` (shown for every visitor, `ship_record/[record_id]/page.js:12`).

`ShipRecordCreator.js`:

- Mode: `editMode` is true when `predefinedData` has both `title` and `text` (`:11`).
- Fields: a text input "Title" and a 10-row textarea "Data" (`:107-122`). Placeholders only, no labels. Both are centre-aligned text (`ShipRecordCreator.module.css:31`, `:42`), which is poor for long prose.
- Validation (`:74-93`): each trimmed value must be longer than 2 characters; failure just turns the border `#812121`. No message. Returns `titleValid & dataValid` (bitwise, a number).
- Create (`:35-49`): `POST /api/create {title, text}`; on resolve, clear the form, re-enable and flash "Record added" for 1 second (`:95-100`). The user stays on the form; there is no link to the new record (the API does not return its id).
- Update (`:51-65`): `PUT /api/edit {id, title, text}`; on resolve calls `redirect()` from `next/navigation` **inside a promise callback** (`:63`). Next documents `redirect` for use during render, not in event handlers/promises; here it throws inside `.then`. If it does not navigate, the form stays disabled with the button reading "Updating". Introduced in the last commit; **must be verified in a browser**, and replaced by `router.push`/server action in the rewrite.
- No error handling at all: `.then` runs for 4xx/5xx too (success message on a failed insert); a network error leaves inputs disabled forever (no `.catch`, `:45`, `:62`).
- The submit control is an `<a href="#">` (`:126`); it is not disabled while saving (only the inputs are), so a double click passes validation again and sends two inserts.
- The "Record changed" text (`:128`) can never show in edit mode.
- The button row is positioned with `margin-top` percentages of the viewport width: 10% / **90%** (only for 401–410px) / 40% / 15% (`ShipRecordCreator.module.css:98-128`).
- Nothing scrolls in this component; on a phone with the keyboard open the textarea and buttons can be out of reach.
- Stale views after saving: nothing revalidates, and `/add_ship_record` itself is static.

---

## 6. Styles

### 6.1 Breakpoints in use

| Query | Files (line) |
|---|---|
| `min-width: 1000px` | BottomPanel (14), Button (22), CrewList (18), FormInput (15), SearchResult (62), ShipOverview (66), ShipRecordCreator (72), ShipStatus (24), SidePanel (72), TopPanel (50), WeaponCreator (97) |
| `max-width: 1000px` | CelestialBodyDetails (36), FormInput (21), ShipOverview (75) |
| `max-width: 810px` | Main.css (29), CrewMember (22), KodningReserves (36), SearchResult (91), ShipOverview (107), ShipPanel (25), ShipRecordCreator (93), ShipStatus (30), SidePanel (81), TopPanel (59), WeaponCreator (112) |
| `max-width: 450px` | SidePanel (124), TopPanel (68 and 77, duplicated) |
| `max-width: 410px` | Main.css (34), SearchResult (105), ShipOverview (112), ShipPanel (60), ShipRecordCreator (103), ShipStatus (36), SidePanel (134), TopPanel (86), WeaponCreator (119) |
| `max-width: 400px` | SearchResult (111), ShipRecordCreator (112), SidePanel (144), TopPanel (98), WeaponCreator (125) |
| `max-height: 700px` | SearchResult (125), ShipRecordCreator (121), TopPanel (107), WeaponCreator (131) |

Observations: `min-width:1000` and `max-width:1000` both match at exactly 1000px; 811–999px is unstyled by most files (3.7); no `orientation`, `pointer`, `hover` or `prefers-reduced-motion` query exists; many mobile blocks simply repeat the base declarations (`CrewMember.module.css:22-40`, `KodningReserves.module.css:36-70`, `ShipOverview.module.css:83-99`, `ShipPanel.module.css:25-46`).

### 6.2 Global styles (`src/components/Main/Main.css`)

- Imported from the `Main` server component, not from `layout.js`.
- `@font-face { font-family: hackedFont; src: url(../../../public/Hacked-KerX.ttf) }` (`:1-4`): TTF only, no `font-display`, bundled through the CSS pipeline (so the font ships twice: hashed in `_next/static/media` and at `/Hacked-KerX.ttf`).
- `html, body, body > div, body > div > div { width/height:100%; font-size:16px }` (`:5-9`) — structural selectors tied to the `#root`/`.App` wrappers. Root size in px overrides the user's browser font-size setting.
- `body { overflow:hidden; font-family:hackedFont; margin:0; touch-action:none }` (`:10-15`).
- `.main { color:#ddd; overflow:hidden }` (`:16-21`).
- `h3:active, a:active { color:#45c845; text-shadow; -webkit-tap-highlight-color:transparent }` (`:22-26`) — the only pressed state in the app, applied by element selector.
- No reset, no `box-sizing: border-box` default, no `:focus-visible`, no CSS variables.

### 6.3 Fonts and colours

- One font for everything: `hackedFont` (display face) including long record text and form inputs. No fallback stack. Inputs/textarea/select do not inherit it unless they set `font-family` (none do), so form controls render in the browser default font.
- Colours actually used (all hard-coded literals):

| Colour | Use |
|---|---|
| `#000` | shell background, borders, bar track |
| `#0d0d0d` | panels, content boxes, inputs |
| `#171717` | buttons, ship bar, toggles, selects |
| `#ddd` / `#dddddd` / `#fff` | text |
| `#6a6a6a` | "value" text — **including the whole body of a record** (`SearchResult.module.css:40-42`); about 3.6:1 on `#0d0d0d`, below AA |
| `#4f4f4f` | subsystem borders/dividers |
| `#45c845` | Online, success message, `:active` |
| `#812121` | Offline, invalid border; about 1.9:1 on `#171717` — "Offline" is barely readable |
| `#1d0000` | disabled select/checkbox in weapon creator |
| `#D4ADCF` | crew and location values |
| `#A8E6EF` | "valuable resources" value |
| `#99799f` | interactive (clickable) words |
| `#483548` | Kodning reserve bar |
| `gray` | `.inactive` (unused class) |
| `#00000069`, `#000000b3`, `rgba(0,0,0,.4)` | translucent overlays |

### 6.4 Scrolling, `overflow` and `touch-action`

| Rule | Location | Effect |
|---|---|---|
| `body { overflow:hidden; touch-action:none }` | `Main.css:11,14` | No page scroll, **no pinch-zoom** (accessibility failure), no browser pan outside inner scrollers |
| `.main { overflow:hidden }` | `Main.css:20` | Clips everything that overflows the viewport |
| `.SearchContainer > div { overflow-y:scroll }` | `SearchResult.module.css:70-75`, **only ≥1000px** | Record text scrolls on desktop only |
| `.SearchContainer > div:first-of-type { overflow-y:scroll }` | `SearchResult.module.css:116-119`, ≤400px | Targets the **title** div, not the text |
| `.crewList { overflow-y:scroll }` | `CrewList.module.css:18-22`, only ≥1000px | Crew drawer does not scroll on mobile |
| `.planetInfo { overflow-y:scroll }` + `height:100vh` ≤1000px | `CelestialBodyDetails.module.css:13`, `:38` | Taller than its panel; bottom cut off |
| `.ShipOverview { overflow:auto }` + fixed `height: 50rem / 75rem` | `ShipOverview.module.css:6`, `:109`, `:114` | Scrolls, with magic heights |
| `.creatorContainer { overflow-y:scroll }` | `WeaponCreator.module.css:36` | Weapon creator scrolls at all sizes |
| Scrollbars hidden | CrewList 23, SearchResult 76, ShipOverview 67/76, WeaponCreator 107, CelestialBodyDetails 14-20, SidePanel 14-17 | No visible scroll affordance anywhere |

**Root cause of "text does not scroll on touch devices":** it is mostly not `touch-action`. `touch-action:none` on `body` does not stop panning inside a nested scroll container. On every viewport under 1000px the record text container (`.dataSection`) simply has **no overflow rule and no bounded height**, so long text spills out of the fixed-height box and is clipped by `.main`. The ≤400px rule that looks like the fix targets the wrong element. `ShipRecordCreator` has no scroll container either. `touch-action:none` exists only to stop the browser from scrolling the document during swipes (because the react-swipeable option meant to do that is misnamed).

No `user-select`, `overscroll-behavior`, `dvh` or safe-area insets are used. `height:100%` chains and `13vh`/`100vh`/`0.9vh` are used instead.

### 6.5 Other style smells

- Parent modules style a child component's root element by tag: `.TopPanel > a` (`TopPanel.module.css:16`), `.SidePanel > a` (`SidePanel.module.css:42`), `.mainContainer > a` (`WeaponCreator.module.css:28`), `.buttonsContainer > a:last-child` (`ShipRecordCreator.module.css:56`), `.rightPanel > div` (`SidePanel.module.css:101`), `.askXaroContainer > div` (`BottomPanel.module.css:7`), `.planetInfo > h2/p`.
- The top drawer's close control is a "<" rotated 90° (`TopPanel.module.css:26`); the right panel's is rotated 180° (`SidePanel.module.css:59`).
- Dead CSS: `.rightSidePanel` (`SidePanel.module.css:68`), `.detailsContainer` (`WeaponCreator.module.css:91`), `.inactive` (ShipOverview 59, ShipSystem 23), `.askXaro {margin-top:39rem}` (`FormInput.module.css:3`, always overridden), duplicate `font-size` in `.mobileToggle` (`SidePanel.module.css:32,37`), stray `;;` (`ShipOverview.module.css:29`).
- `transition: 0.1s/0.2s ease-in-out` on `all` (TopPanel 14, ShipOverview 7/20, ShipPanel 13) animates margins and heights (layout, not GPU-friendly).
- `ShipStatus` animates `background-image` in keyframes (not interpolable in all browsers), uses `background-attachment: fixed` (unreliable on iOS), and loads a 681KB GIF for a ~0.3s flash.

---

## 7. Assets

Only **three** asset files are referenced from source. Everything in `public/` is still deployed and publicly downloadable.

### `public/` (10.4 MB total)

| File | Size | Dimensions | Referenced |
|---|---|---|---|
| `Hacked-KerX.ttf` | 26,664 | — | `Main.css:3` |
| `xaro_second_try.png` | 20,607 | 696×1139 | `ShipStatus.module.css:2,3,5,13` (home background) |
| `static.gif` | 680,713 | 400×700 | `ShipStatus.module.css:4` |
| `robots.txt` | 70 | — | Served at `/robots.txt` implicitly (allow all) |
| `manifest.json` | 201 | — | **Unused** — CRA sample ("Create React App Sample"), not linked |
| `galaxy_map.jpg` | 1,907,588 | 3840×2160 | **Unused** |
| `galaxy_map_2.jpg` | 853,433 | 3840×2400 | **Unused** |
| `galaxy_map_xaro.png` | 1,652,967 | 1920×1080 | **Unused** |
| `nebula_1.jpg` | 2,553,524 | 6144×3558 | **Unused** |
| `texture_1.jfif` | 154,512 | 560×884 | **Unused** |
| `texture_2.jfif` | 153,767 | 560×884 | **Unused** |
| `texture_3.jfif` | 253,400 | 736×1242 | **Unused** |
| `texture_3_background.jfif` | 152,359 | 735×352 | **Unused** |
| `texture_4.jfif` | 140,365 | 500×731 | **Unused** |
| `texture_5.jfif` | 85,055 | 400×528 | **Unused** |
| `texture_6.jfif` | 282,713 | 736×1215 | **Unused** |
| `texture_7.png` | 1,445,798 | 1468×704 | **Unused** |

### `src/icons/` (4.5 MB total) — **all unused** (no import anywhere)

| File | Size | Dimensions |
|---|---|---|
| `galaxy_map.jpg` | 1,907,588 | 3840×2160 — byte-identical to `public/galaxy_map.jpg` (same MD5) |
| `planet_icon.png` | 1,587,494 | 1024×1024 |
| `star_icon.png` | 844,639 | 1024×1024 |
| `system_icon.png` | 140,742 | 658×658 |
| `current_cluster_icon.png` | 27,180 | 700×700 |
| `system_focus.png` | 17,282 | 831×906 |
| `current_star_icon.png` | 14,346 | 512×512 |
| `current_galaxy_icon.svg` | 847 | — |

### Other

- `src/app/favicon.ico` — 160,830 bytes (large for a favicon), picked up by the App Router file convention.
- The maps and icons look like material for a planned star map that was never built; the right panel is static text. The owner should say whether a map is wanted before these are deleted.
- No `next/image` and no `next/font` usage anywhere.

---

## 8. UX and accessibility problems inferable from the code

Interaction states:

- **No `:focus`/`:focus-visible` rule in the whole codebase.** Keyboard focus relies on browser defaults on the few real links/inputs.
- **One `:hover` rule in the whole codebase** (`FormResults.module.css:31`). Buttons, crew names, subsystem tiles/rows, clickable words and drawer tabs have none.
- `:active` exists only for `h3` and `a` globally (`Main.css:22`).
- No disabled state for buttons. The weapon creator "disables" its type select and Smart checkbox with `pointer-events:none` + a dark red background (`WeaponCreator.module.css:54-59`, `:75-80`) instead of the `disabled` attribute, so they remain reachable and changeable by keyboard.

Semantics and keyboard:

- Clickable `<div>`/`<span>`/`<h3>` without role, tabindex or key handlers: `SidePanel.js:40`, `CrewMember.js:9,21`, `ShipSystem.js:21`, `ShipOverview.js:38`, `InteractiveWord.js:11`. None of the panels, accordions or word-search can be operated by keyboard.
- All buttons are `<a href="#">` (see section 2).
- No landmarks (`main`, `nav`, `header`), no skip link, heading levels used for sizing (`h1` inside the top drawer, `h2` per table cell).
- No labels: search input, title input, textarea are placeholder-only; weapon creator `<label>`s are not associated with their controls (`WeaponCreator.js:186-211`, no `htmlFor`/`id`).
- Off-screen drawers stay in the tab order and in the accessibility tree (hidden by margin only, no `inert`/`aria-hidden`); open drawers do not trap or move focus.
- No live region for search results, "Record added", or validation errors. Validation is colour-only.
- Pinch-zoom disabled by `touch-action:none` on `body`.
- No `prefers-reduced-motion` handling.

Touch targets and legibility:

- Drawer tabs 30–36px wide; "+" button 3.2rem = 32px high on small phones (`Button.module.css:13-20`); crew names are bare text lines; clickable words are plain inline words with 0.5rem gaps; subsystem tiles are ~64px×~30px text.
- Type gets **smaller** as the screen gets smaller (root 16 → 12 → 10px): Kodning label 9px, ship-system labels 12.3px, crew details 15px, all in a stylised display font.
- Low contrast: record body `#6a6a6a` on `#0d0d0d`; "Offline" `#812121` on `#171717`; search results dimmed with `filter: brightness(0.5)`.
- Centre-aligned textarea and title input.

Flow:

- No home link; nav hidden in the crew drawer on mobile.
- Search dropdown cannot be dismissed and can be hidden behind the expanded view.
- No loading, error or empty states anywhere (except the fake "No results" link).
- Create gives a 1-second message and no link to the record; edit may hang on "Updating".
- Shell state resets on every navigation (3.8), and three routes show build-time data (section 1).
- Horizontal flicks anywhere toggle drawers, including while typing or using a select.
- Crew members and subsystems have detail pages that nothing links to except search.

---

## 9. What will be awkward for TypeScript strict and SCSS modules

TypeScript:

- **No `tsconfig.json`/`jsconfig.json`** and no path aliases (deep `../../../` imports everywhere), although `next.config.ts` is already TypeScript.
- **Untyped DB rows flow straight into components.** `SearchResult` iterates `Object.entries(data)` and calls `.split` on every value (`SearchResult.js:19,37`), assuming `Record<string,string>`. It will be replaced by the entity detail page rather than typed.
- `Button` is polymorphic through magic strings: `action` is a URL, a callback or `''` depending on `type` (`Button.js:7-19`) → needs a discriminated union; `styles[extraClass]` (`:11`) is an untyped index into the CSS module.
- `ShipOverview` uses a non-standard `subsystem` attribute and mixes `number`/`string` ids with `==` (`ShipOverview.js:15-18,38`).
- `ShipPanel` filters by literal numeric ids (`ShipPanel.js:12`).
- `ShipRecordCreator`: `predefinedData = {}` probed with `hasOwnProperty(...) > 0` (`:11-14`), boolean `&` (`:92`), `redirect()` in a promise (`:63`).
- `MainPanel`: `documentRef` used in an effect declared before the hook call (`:29-35`), `documentRef(document)` / `documentRef({})` do not match the hook's `ref` type (`HTMLElement | null`); `panelFocused` is a string that should be a union; the dead `'bottom'` value in `SidePanel.js:11`.
- `CrewList`: `useState()` with no initial value, `setExpandedMemberId()` with no argument (`:12,16`).
- `displayStatus` initialises a JSX variable as `{}` (`ShipOverview.js:24`, `ShipSystem.js:10`).
- `FormResults`: `.map` callback without a return on one path; result shape `{source, displayProperty, data}` indexed dynamically (`:14`).
- `KeywordContext` default `setKeyword: () => {}` does not match `Dispatch<SetStateAction<string>>`.
- Components without `"use client"` that use hooks or handlers (`Button`, `CrewMember`, `ShipSystem`, `FormResults`) need explicit boundaries once the shell is restructured.
- **WeaponCreator (frozen behaviour)** — things a typed refactor must not change:
  - Lookups by state string: `weaponStyles[proficiency]` (`:19`), reverse lookups with `Object.keys(...).find(...)` that return `string | undefined` (`:58,61,177`), composed key `specialEffects[damageType + proficiency.slice(-2)]` (`:178`).
  - `displayAttackBonus()` returns `undefined` for non-Laser types (`:48-56`), which renders as nothing but leaves the surrounding spaces in `{a} {b} modifier…` (`:217`).
  - `style` is never used in any output and is **not reset** when proficiency changes (`:187`, `:193`): state can hold `'Club'` while the select shows "Pistol".
  - Devouring coupling (`:24-39`): choosing specialisation Devouring forces type Devouring and smart off; choosing type Devouring forces specialisation Devouring and smart off; leaving specialisation Devouring resets type to Laser. But the type select and Smart checkbox are only blocked for the pointer, so by keyboard a user can reach **specialisation = Devouring with type ≠ Devouring and/or smart = true**. Those combinations produce defined output today and are part of "every combination" for the golden file.
  - The special-effect strings are template literals containing newlines and indentation (`:269-327`) that HTML collapses, plus their original typos ("it's", "proned", "Halbert", "ACR"). Compare golden output on the exact strings.
  - Labels are not bound to inputs; the checkbox is restyled with `filter: invert(100%) hue-rotate(18deg)` (`WeaponCreator.module.css:72`).

SCSS modules:

- `Main.css` is global, uses element and structural selectors, and a relative `url(../../../public/…)`; it must become a real global stylesheet imported from `layout` with `next/font` replacing the `@font-face`.
- Cross-component tag selectors (list in 6.5) break as soon as `Button` renders a `<button>` or wrapper markup changes; each needs to become a prop/variant or an explicit class.
- Layout depends on DOM order + z-index literals (1/2/3/4) scattered across eight files, and on percentage margins against the viewport width (3.2). This cannot be ported rule by rule; the shell needs a new grid/transform-based layout.
- 46 media queries with seven different thresholds, many of them copies of base rules; mapping to three mixins means rewriting, not renaming.
- All colours, sizes and z-indexes are literals; there is nothing to map onto tokens automatically.
- Positional variants inside `Button.module.css` (`.addRecordButton`, `.weaponCreatorButton`) belong to the crew panel.
- Class names mix PascalCase, camelCase and a typo (`kondingCurrentText`), which matters if typed CSS-module class names are generated.
- Vendor-only declarations: `-webkit-fill-available` (`ShipPanel.module.css:50`), `::-webkit-scrollbar { -webkit-appearance:none }`, `-ms-overflow-style`.

Leftovers to clean up (frontend side): `#root`/`.App` wrappers, `public/manifest.json`, `src/utils/string_functions.js`, the unused `keyword` destructure in `SearchResult.js:15`, `.hintrc`, and a one-line `README.md`.
