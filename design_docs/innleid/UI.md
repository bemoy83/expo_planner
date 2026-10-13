# UI — Bemanning · Innleid

Values from `mockup/Bemanning Innleid v7.html` (`/* v6 SYSTEM */`, `/* v7 */` blocks). Colours are DS tokens; `mix(a, p)` = `color-mix(in oklab, a p%, rgb(var(--canvas)))`. Fonts: UI = Schibsted Grotesk (`--font-ui`), numbers = JetBrains Mono (`--font-numeric`). Where the app's Kalender already defines the same part, **use the app's values** (see `REUSE.md`).

## 1. Layout

```
top nav 52 px
┌ band: header (h1 «Kalender», tag «Bemanning · Innleid», Lys/Mørk, panel button) ┐  --v-band, line on top
└ band: toolbar (modes · tools · alerts · I dag · ?)                              ┘  line at bottom, none between
┌ label column 400 px (sticky) │ day columns 116 px × N (scroll) ┐
│ date header 54 px (sticky top)                                  │
│ section  «Restbehov etter faste»            «timer»   28 px     │
│ Avvik                                                30 px     │
│ competence rows (folded ≥ 40 px / unfolded = editor)            │
│ section  «Leverandører[ · Competence]»       «pers.»   28 px     │
│ supplier rows                                         28 px     │
└─────────────────────────────────────────────────────────────────┘
slide-over panel 340 px (right, over the grid)
```

- Day lines (`--g-col`) only on competence rows and the date header; row lines (`--g-row`) under competence rows and readout rows; none after a section row (DESIGN-RULES §3).
- Weekend cells: `--we-row` (section rows `--we-sec`), full height.
- Today line: 2 px `--accent`, at the **left edge** of today's column, one element from the date header to the last row, below sticky labels and section rows.

## 2. Band

- Header: padding 14/24/8, h1 700 22/1.2 −0,02em. Tag: 22 px pill, `mix(canvas 55 %, transparent)`, 600 12 px, users icon 13.
- Toolbar: padding 6/16/8, gap 14, wraps. Left: `Plan | Bemanning` and `Faste | Innleid` segmented (track `--v-track`, on = surface + `0 1px 2px rgb(0 0 0/.12)`). Middle: undo, redo (30 px icon buttons), tool segmented `Velg | Pensel (B) | Tøm (T)`; when Pensel/Tøm is on, a supplier picker (24 px segments, short codes; Tøm adds «Alle»); hint text 12,5 px `--v-tb-mute`, one line, ellipsis.
- Right: **waiting chip** (surface, ink 500 12,5 px, clock glyph 14, «60 t venter på svar», CONFLICTS C7), **udekket chip** (`--al-block`, `--al-on` text 600 12,5 px, triangle-alert 14, «7 dager udekket»), «I dag» text button, `?` icon button. All chips `white-space: nowrap`; label is one text node.
- Hue: Innleid fjord `--vh 235 / --vc .065` (CONFLICTS C3). Band tokens: `--v-band oklch(.86 c·.6 h)`, `--v-band-line oklch(.70 c·.85 h)`, `--v-track oklch(.79 c·.7 h)`, `--v-tb-ink oklch(.30 c·.55 h)`, `--v-tb-mute oklch(.42 c·.6 h)`; dark `.40/.24/.32/.93/.78`.

## 3. Date header
Week label 10 px faint (`U41` on Mondays and first column). Day pill: weekday 11 px faint over date 600 14 px; today = `--accent-soft` fill, accent text; selected days (editor open) = surface + raise. Clicking a date with the editor open selects that day (⇧ extends).

## 4. Avvik row (30 px)
- Label right-aligned: «Avvik» 600 13 px ink + legend (3 swatches 10×10 r2, gap 2: under `mix(danger 70)`, ok `mix(committed 20)`, over `mix(draft 45)`; tooltip explains).
- Cell: heat fill `inset 3px 2px`, radius 5; value right-aligned 600 11,5 px numeric, colour per RULES I2; nothing when ok and 0.
- Waiting glyph 13 px at top 5 / left 5 when the day has waiting orders.

## 5. Competence row

**Folded label** (click → unfold on the first short day): chevrons-up-down 13 faint, competence dot 9×9 r3, name 500 14 px, right: total `−x t` 600 12,5 numeric or `✓`. Hover: surface.

**Day cell** (click / drag selects days; with brush: crosshair; competence not offered by brushed supplier: not-allowed):
- Coverage line, height ≥ 26, padding 4/8, gap 6, one row: bar flexes, number right.
  - Bar 3 px, radius 2, track `--sunken`; confirmed = competence colour; waiting = 135° hatch of the competence colour (2 px on / 2 px off; dark: lightness +0,15).
  - Number: `−x` 600 12 px ink; `+x` 500 12 px `--ink-muted`; none when ok.
- Order chips under it: column, gap 3, padding 0/4/6. **Chip** 22 px, radius 5, padding 0/6/0/3, gap 5 (3 with glyph): fill = competence colour, text `--on-line` 600 11 px; count badge 18×16 r4 surface, 700 11 px ink, `0 1px 2px rgb(0 0 0/.14)`; supplier full name, ellipsis.
  - Waiting chip: fill `mix(colour 38)` (dark 55), ink text, badge without fill/shadow, clock glyph 12 before the count.
  - Folded: one chip per supplier per day (shifts summed); max 3, else 2 + «+N til» (20 px, sunken, 600 10,5 px). Tooltip lists each shift, count and answer.
  - Selected in editor: inset 1,5 px ring in the competence colour (darker by 0,25 L; dark lighter).
  - Brush preview: ghost chip (canvas fill, 1,5 px ring in colour). Erase preview: cell `mix(--al-block 12)`, chips «gone» (canvas fill, faint text).
- Cells in the current editor range: surface (weekend `mix(ink 4, surface)`).

**Unfolded label = editor** (`--panel` fill, padding 0/14/10/16):
1. Header 40 px: fold button (chevrons-down-up 14, dot, name 600 14) · up/down to previous/next competence (26 px).
2. Day bar: `‹ tor 8. okt ›` in a sunken track (28 px buttons; ⇧ extends); right: summary `−22,5 t ≈ 3 pers.` 600 12,5 + small line, or «Ingen restbehov».
3. Order rows in a sunken track (radius 9, padding 2, gap 2). **Row** min-height 44, radius 7, padding 0/6/0/4, gap 4; hover `mix(surface 50, transparent)`; selected = surface + raise.
   - Supplier button: name 500 12,5 px + chevron-down 11, `flex: 0 1 auto`, min 64, max 170, `margin-right: auto` (the gap is the free click area for selecting the row) → supplier menu.
   - Shift button: «Dag ▾» / «07:00–15:00 ▾» for custom, 26 px, 500 11,5 px → shift menu.
   - Stepper: − n + (23 px buttons, 700 13 px count).
   - Status chip (§6, compact): «Venter» / «OK», min-width 74 → answer popover.
   - Remove ×: 26 px faint.
   - Second line when the group misses some selected days: day pips (8×8 r2) + «Fyll» link.
4. Add: «+ Leverandør ▾» (28 px, sunken, nowrap) + hint that wraps (11,5 px faint, flex 1 1 160). Disabled when no supplier offers the competence; empty text explains.

## 6. Status chip and glyph (New)
- Glyph 16-unit viewBox. **Venter**: ring r 6,5, stroke 1,5 ink, canvas fill, clock hands (stroke 1,6, round). **Bekreftet**: solid ink disc r 7,25 with canvas check (stroke 1,8). Ink only.
- Chip 24 px, radius 6, padding 0/7, gap 5, 500 11,5 px. Venter: no fill, `--ink-muted` text, glyph ink. Bekreftet: sunken fill (in rows `canvas/.6`, selected row sunken), ink. Hover: surface + raise. Labels: full «Venter» / «Bekreftet»; compact (editor rows) «Venter» / «OK».

## 7. Popovers
Shell: `--panel`, radius 12, padding 12, gap 10, shadow `0 12px 32px rgb(0 0 0/.2), 0 1px 3px rgb(0 0 0/.1)`, fixed, below the anchor (above if no room), 8 px from viewport edges. Dismissal per CONFLICTS C5.
- **Supplier menu** (230 px): eyebrow «Tilbyr {competence}» + items (name 500 13; shifts · kr/t 11 muted; check on current), then «Tilbyr ikke …» disabled items.
- **Shift menu** (210 px): Dag / Kveld / Natt with times (disabled if the supplier does not offer it: «{name} tilbyr ikke»), «Egen tid…» → time popover.
- **Time popover** (288 px): from/to fields (72×36, 600 18 numeric, sunken), duration, a 05→ next-day track with draggable range, crew stepper.
- **Answer popover** (260 px): «Svar fra {supplier}» (+ «N dager»); segmented `Venter | Bekreftet` (full width); when Bekreftet: «Stiller [− n +] av {asked}[ per dag]», or a per-day list if the days differ; note «Kan de stille færre? Juster antallet – resten blir udekket igjen.»; footer (top line `--border`, padding 8/12): «Lagres med en gang» + **Ferdig ↵** (30 px, radius 8, ink fill, `--v-band` text 600 12,5; CONFLICTS C6).

## 8. Supplier rows and panel
- **Row** (28 px, label left): brush toggle 22 px (visible on hover/active), name 500 13 (bold when selected/brushed), waiting glyph 12 if any order waits, competence mini-matrix (9 × 6×10 r1,5 cells, gap 2; on = competence colour), total people. Day cells: people count (11,5 numeric muted) with waiting glyph 12. Click label → supplier panel + brush picked. With the editor open, the list filters to suppliers offering that competence («Vis alle (N)» / «Bare {comp}»); others faint.
- **Slide-over panel** 340 px, `--panel`, shadow `−16px 0 40px rgb(0 0 0/.14)`, 1 px left line, slide-in 200 ms `cubic-bezier(.2,.7,.2,1)`; × top-right; closed by default; Esc closes.
  - *Kompetansematrise*: suppliers × competences toggles (16×16 r4).
  - *Leverandør*: back link, name 600, contact; brush-active banner; stats strip (Persondager / Timer / Estimert «k» + kr/t; first cell raised); status summary (glyph + «N bekreftet», «N venter»); «Kopier bestilling» (→ «Kopiert» 1,6 s), «Alle bekreftet»; list per day (eyebrow «tor 8. okt»): dot, competence, time 11,5 muted, count 600, «av N» faint when fewer than asked, status chip (click toggles); «Kompetanser og skift» disclosure with toggle tags.
  - *Hjelp* (`?` key or button): numbers legend (−, +, green, glyphs), gestures, short how-to.

## 9. Keyboard
`?` help · `B` brush on/off · `1–9` pick supplier as brush · `T` erase · `⌥`-drag erase · `Esc` ends tool / closes popover / folds editor / closes panel · `←/→` move days (`⇧` extends) · `↑/↓` select order row · `+/−` count · `Enter` answer popover / Ferdig · `Delete` remove row · `⌘Z / ⌘⇧Z`.

Icons (Lucide): users, user, calendar, check, chevron-down/up/left/right, chevrons-down-up, chevrons-up-down, plus, minus, x, paintbrush, eraser, mouse-pointer-2, undo-2, redo-2, triangle-alert, panel-right, circle-help, copy.

## 10. Empty states (copy)
- No supplier for the competence: «Ingen leverandør tilbyr {comp} ennå.»
- No orders in range: «Ingen innleid denne dagen / disse dagene[ – og ikke noe restbehov]».
- Supplier without orders: «Ingen bestilling ennå. Velg {name} som pensel og dra over dager på {comp} eller {comp}.»
- All done: «Alt dekket og bekreftet» in the toolbar.
