# Visual baseline (pre-overhaul) — notes

Captured from `npm run dev` (`next dev --turbopack`, Next 15.3, port 3000) in the Claude desktop built-in browser,
against the live DB (read-only: page loads and one search keyword `a`; no create/edit form was submitted).
The app started without errors. The round "N" badge bottom-left in every shot is the Next.js dev indicator, not part of the app.

## Files

Screenshots **were saved to disk** in this folder, named `<route>-<viewport>.jpg`.
Limitations of the capture tool (be aware when comparing with "after" shots):

- Format is **JPEG, not PNG**.
- Pixel size is not the viewport size: 1440×900 shots are stored at 800×500 (scaled down ×0.556), 844×390 at 800×370
  (×0.948), 390×844 at 780×1688 (×2). The CSS viewport emulated was exactly 1440×900 / 844×390 / 390×844 (checked with
  `innerWidth/innerHeight`).
- 844×390 was emulated with a desktop user agent and mouse input (touch emulation only applies below 768 px wide).

| Route | 1440×900 | 844×390 | 390×844 |
|---|---|---|---|
| `/` | home-1440x900 | home-844x390 | home-390x844 |
| `/` + search "a" | home-search-results-1440x900 | home-search-results-844x390 | home-search-results-390x844 |
| `/` + top panel (Ship subsystems) | home-top-panel-open-crew-expanded-1440x900 (also shows a crew member expanded) | home-top-panel-open-844x390 | home-top-panel-open-390x844 |
| `/` + Crew side panel | always visible on desktop | always visible (no drawer) | home-crew-panel-open-390x844 |
| `/` + Location side panel | always visible on desktop | always visible (no drawer) | home-location-panel-open-390x844 |
| `/kodning_weapon_creator` | kodning_weapon_creator-1440x900, -scrolled-to-result-, -devouring- | kodning_weapon_creator-844x390 | kodning_weapon_creator-390x844 |
| `/add_ship_record` | add_ship_record-1440x900 | add_ship_record-844x390 | add_ship_record-390x844 |
| `/ship_record/10` | ship_record-10-1440x900 | ship_record-10-844x390 | ship_record-10-390x844 |
| `/crew_member/1` | crew_member-1-1440x900 | crew_member-1-844x390 | crew_member-1-390x844 |
| `/subsystem/1` | subsystem-1-1440x900 | subsystem-1-844x390 | subsystem-1-390x844 |
| `/edit_ship_record/10` | edit_ship_record-10-1440x900 | edit_ship_record-10-844x390 | edit_ship_record-10-390x844 |

Valid ids seen via search links: crew_member 1–6, subsystem 1–7 (8 exists in the top panel), ship_record 2, 10 and more.
The live `ship_records` table contains obvious test rows ("Test title", "Create title 3", "Create title 11",
"Test after deployment", three rows titled "Alex is an intergalactic horror").

## Common look

- Colours: page background pure black; panels `#0d0d0d`–`#171717` dark grey, slightly rounded; text white/light grey;
  status ONLINE bright green, OFFLINE dark red; values in the Location panel and in detail pages pale purple/lilac;
  some words in detail text grey (clickable "interactive words" alternate purple/grey); search input gets a gold/amber
  outline when focused; Devouring weapon-type select turns dark red (`rgb(29,0,0)`).
- Fonts: the display font `hackedFont` (public/Hacked-KerX.ttf, distressed/glitchy caps) is used for **everything**
  including long body text; form controls (search input, selects, title input) fall back to Arial; the record textarea
  uses a monospace font. Long text in the display font is hard to read at small sizes.
- `body` has `overflow: hidden` and `touch-action: none` (measured), so the page itself never scrolls; only inner
  containers scroll.
- The home centre is a dim grey line drawing of the ship on black, very low contrast.
- Top/side panel open/close animations are slow: a screenshot 2 s after the click still showed the closed state.

## 1440×900 (desktop)

Layout: top bar with six subsystem tiles (FTL, Propulsion, Weapons, Shields, Sensors, Core + status) and a thin
"2.5% / 100%" reserve bar; left panel = crew list with `+` (add record) and `Weapon creator` buttons at the bottom;
right panel = "Current location" key/value list; centre = ship drawing or the page content card; bottom centre =
"Ask X'aro" search input. No horizontal scroll (scrollWidth 1440).

Problems:
- **The search input overlaps the bottom of every content card.** On weapon creator, add/edit record, ship record,
  crew member and subsystem pages the card runs under the fixed search box: the Back / Edit / `<>` / Create / Update
  buttons are half hidden behind or beside it, and the "Smart" label, the result text and the last detail lines are
  covered. (Create/Update on add/edit are only visible as slivers left and right of the search box.)
- Content cards are cut off by the bottom of the viewport (the Back button is clipped at the bottom edge).
- Search results open upward as a list with no max height and no scrolling: with 23 results the first ones are pushed
  above the top of the viewport and cannot be reached; the list also covers the top bar.
- Weapon creator: the form is a scroll container about 5 rows tall with hidden scrollbar; the result is not visible
  without scrolling inside it; selects are small (text ~11 px in the screenshot scale) with no arrow affordance
  (`appearance: none`); the special text runs under the search box.
- Detail pages are all titled "Search results"; body text is tiny, all caps, in the display font.
- Title input on the edit page truncates the title ("Alex is an intergalacti").
- Large empty black band between the top bar and the content card.
- Top panel (Ship subsystems) opens over the centre and overlaps the top bar; its close button (`^`) overlaps the last
  visible row. Expanding a crew member pushes the list down inside the left panel (fine).
- No visible hover/focus states apart from the search outline (not exhaustively tested).

## 844×390 (landscape phone) — effectively broken

- **Page content is not visible at all** on `/kodning_weapon_creator`, `/ship_record/10`, `/crew_member/1`,
  `/subsystem/1`, `/add_ship_record`, `/edit_ship_record/10`: the content card is positioned off-screen above the
  viewport (weapon creator card measured at top = −620 px, height 281 px, because of percentage `margin-top` rules
  combined with the `max-height: 700px` media query). Only stray fragments leak into the top bar: the last lines of
  the subsystem text, "Expertise : … NY" from the crew page, and the Back / Create / Update buttons drawn on top of
  the subsystem tiles. The weapon creator cannot be used in this orientation.
- Horizontal overflow: document scrollWidth 918 px vs 844 px viewport; the subsystem bar is 992 px wide and is cut on
  both sides.
- Side panels are permanently open (169 px each), leaving about 500 px in the middle; their text is far too large
  (crew names wrap, "Current location" heading and values are clipped at the right edge, most rows are below the fold
  and the panels do not appear scrollable).
- The `+` and `Weapon creator` buttons overlap the crew names (3rd/4th row unreadable); the `<` and `>` panel buttons
  float over the panel content; clicking them had no visible effect in this layout.
- The "Ask X'aro" box covers the lower part of the ship drawing and of both side panels; search results cover the
  whole middle column and the first results are cut off above the top edge, unreachable.
- Top panel does open (after the slow animation) but sits under the side panels: the row labels are cut off on the
  left (`FTL`, `Propulsion`) and status on the right, and the search box covers the third row.
- Subsystem status text ("ONLINE") is clipped by the side panels at both ends of the top bar.

## 390×844 (portrait phone) — the best of the three, still flawed

Layout: top bar with the six tiles and reserve bar; vertical "CREW" tab on the left edge and "LOCATION" tab on the
right edge; content card in the middle; search input at the bottom. No horizontal scroll (scrollWidth 390).

- Drawers: tapping CREW opens a full-width crew list with `+`, `Weapon creator` and `<` (close) at the bottom; tapping
  LOCATION opens a half-width panel on the right with `>` to close. Both worked with taps. The top panel shows the full
  subsystem list with `^` to close; it is meant to open by swiping down (a transparent swipe area covers the top
  169 px) — it opened in the test after a tap on a tile followed by a synthetic swipe-down, so tap-only opening on
  touch is unconfirmed.
- **The search input overlaps the bottom of the content card** on every content page: Back / Edit / `<>` buttons of
  ship record, crew member, subsystem and weapon creator are hidden behind it (only the top edge of the buttons is
  visible). On add/edit record the buttons sit higher and are usable.
- Weapon creator: the form scrolls inside the card; "Ammo" is the last visible line, "Special" and the Back button are
  under the search box.
- The CREW and LOCATION tabs overlap the content area edges (they sit on top of the card margin) and the vertical
  letters are small targets (about 30 px wide).
- A large empty black gap (about 115 px) between the top bar and the content card; the card ends below the search box.
- Search results (23 for "a") fill the screen from below the top bar down to the input, with no scrolling; more
  results would overflow upward. Result rows are about 27 px tall (below a 44 px touch target).
- Detail pages: heading "Search results" is off-centre; there is a big blank area between the heading and the first
  field; the long text is in the display font.
- Subsystem tile labels are small (about 10–11 px) and the tiles are narrow touch targets.

## Weapon creator spot check in the real browser

Default state and (martialRanged2h, Devouring) were read from the live page and match the golden file exactly
(`Attack: constitution modifier + proficiency bonus`, `Damage: 6d6 / 3d6 + constitution modifier physical`,
`Range: 150/600 feet`, `Ammo: unlimited, unlimited total ammo`). Confirmed in the browser: with Devouring the type
select has `pointer-events: none`, `disabled === false`, `tabIndex 0` (so it is still keyboard-operable), background
`rgb(29, 0, 0)`; style select showed `Rifle` after the proficiency change although the style state was never set.

## Housekeeping

Dev server stopped and the browser viewport reset to the desktop preset. `.claude/launch.json` was created for the
preview server (`npm run dev`, port 3000); nothing else outside `docs/overhaul/` was written.
