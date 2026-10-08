# UI: the combined Plan surface (v2)

Reference: `mockup/Plan.html`. Components and tokens: the repo's Ledger design system and Kalender's existing classes (`kalender.css`, `bemanning.css`). Bemanning-only styles in the mockup are prefixed `ps-`.

UI text is Norwegian. Numbers use the numeric font, decimal comma, «t» for hours.

> **This is a migration of the built v1 Bemanning tab** (`src/ui/bemanning/`) into Kalender. What is not described here keeps the v1 app behaviour. Deferred designs are in `DEFERRED.md`; the mockup hides them (`PS_V2`).

## 0. Removed from the app
- The **Bemanning tab** and its week picker. Bemanning lives only as a mode of Kalender.
- The **week editor** (v1's vertical 7-day expand). Replaced by the unfolded person (§5), which also removes v1's gap that overtime blocks could not be moved or resized in the row timeline.
- The **Personell tab stays** (people and competences are maintained there).

## 1. Mode switch

- A segmented control **«Plan · Bemanning»** (icons calendar / users) is the first zone of Kalender's plan bar, in both modes. («Plan», not «Behov»: Behov is the name of the demand-ledger tab.)
- Switching keeps the header and the scroll container. The switch is a **zoom** (R28): column width animates from the current width to the target, 460 ms, ease-in-out cubic, interpolated on a log scale, while the scroll position keeps the anchor day moving smoothly to its target place.
  - Plan → Bemanning: the Plan grid zooms in first; at the end the content swaps to Bemanning and fades in (220 ms).
  - Bemanning → Plan: the content swaps to Plan first (at the wide width), then zooms out.
  - The mode toggle shows the target mode immediately. `prefers-reduced-motion` skips the zoom (instant).
  - Re-fitting inside Bemanning (project filter change, «Tilpass prosjekt») uses the same zoom.
- **Zoom on entering Bemanning** (R18): if a project is chosen in the filter, columns are sized so its whole date window fills the visible width; otherwise the range last seen in Bemanning; otherwise the 10 days from the left edge of the Plan view.
- **Leaving Bemanning** stores the visible range and returns to Plan's S/M/L zoom, centred on the same middle day.
- **Focus day carries over** (R29) via v1's `planningFocus` pref.

## 2. Plan mode

Kalender as in the app today, with one addition: the mode toggle. Capacity lines stay as they are in code: «Faste», «Fravær faste», «Overtid faste».

## 3. Bemanning mode, top to bottom

The label column is 400 px and sticky, as Kalender.

1. **Page header**: title «Kalender»; meta `20 faste · X % av behovet dekket · Y t gjenstår · Lagret i nettleseren`. Right: panel toggle; «N uløste» chip (v1 rule) instead of «Foreslå plan».
2. **Date header**: Kalender's two date rows. The **focus day** (§8) is marked with the accent pill in the header only.
3. **Prosjekter** (foldable, context only): **only the projects in view**, in a block of fixed height (R37). Rows are 22 px, sorted chronologically by event start (first phase if no event). Entering rows fade in, leaving rows fade out from their last slot (260 ms), remaining rows move with a 260 ms transition on `top`. A 2-day hysteresis stops edge flicker; unused slots are empty background rows so the height never changes. Section meta: «3 av 5». Row label: project name and its halls («B1 · B2 · C», numeric font, ellipsis). Track: the project's phases as Kalender's hall bars; the event bar carries the name, other phases the code (A, MI, MO, D) or the full name when wider than 84 px. If a project filter is set, other projects dim to 35 %. Labels are not clickable.
4. **Kompetanse** (foldable), 32 px per competence. The list follows v1 (`staffedCompetences`): competences of active people plus any with demand or assigned hours in the range; those with neither are folded under «Uten behov».
   - Section label row: «KOMPETANSE», the density toggle (§3.10), «t igjen» right.
   - Row label: colour swatch, name, key hint 1–n, total remaining over the range («163,5 t» or ✓). Clicking picks the brush (R14) and folds an unfolded person.
   - Day cell: remaining hours, coloured: red = uncovered, green ✓ = covered, amber «+N» = surplus. At ≥ 80 px also «av N». Below: a 4 px bar, assigned / demand. **Clicking a cell** picks that competence as brush, sets the focus day, and opens v1's **day popover** for moved hours (carry and take back, R12), anchored to the cell.
   - Demand is always **summed across projects** (R10).
   - Brush row: tinted background and a 3 px left bar in the competence colour. Other rows fade to 50 %.
5. **Plan bar**, left to right: mode toggle · undo/redo · tool segmented (Velg V · Pensel B · Tøm T; with a brush the Pensel segment reads «Pensel | ■ Vegger») · hint «Velg kompetanse i behovet (1–n)» without a brush · project filter · «N uløste — Fjern» chip · overtime-limit chip (§9) · help hint · «I dag» · «Tilpass prosjekt».
6. **Personell header row**: «PERSONELL», «13 med Vegger» (or «20 faste»), «uke · normal/kap.»; hint «Klikk et navn for detaljer · dobbeltklikk en dag for å brette ut timer (E) · høyreklikk en dag for fravær».
7. **Unfolded person** (if any), pinned first, see §5.
8. **Person rows**, 40 px. With a brush, people who have the competence come first; a divider «Uten Vegger · 7» precedes the rest, dimmed to 40 %.
   - Label: name, competence dots, the focus-week «normal/capacity» and amber «+OT» (amber pill when over the limit, §9). Click opens the Person panel (§7); double-click a day or «E» unfolds.
   - The unfolded person is removed from the list while unfolded and returns in place when folded.

### 3.10 Compact demand view (Detalj / Kompakt)

An **inline icon toggle** directly after the section title (6 px after «Kompetanse»): a single 18 px icon button (14 px icon), no fill, no track, vertically centred on the section chevron, muted ink (ink on hover). The icon shows the action: **chevrons-down-up** in Detalj («Vis kompakt»), **chevrons-up-down** in Kompakt («Vis detaljert»). `aria-pressed` = compact. Default Detalj. «t igjen» and the row totals stay right-aligned to the label column edge. Persisted per user (`demandDensity: 'detail' | 'compact'`). Competences are never hidden; only their row height changes.

- **Detalj**: as today, 32 px rows with remaining hours, «av N» and a coverage bar.
- **Kompakt**: 14 px rows. Label: 7 px swatch, name 11 px, period total «49,5 t» (or ✓); no key hint. Day cell: one 6 px rounded line, 4 px inset:
  - Track = demand, competence colour at 22 % on canvas.
  - Solid competence colour from the right edge = **remaining share** (`1 − assigned / demand`). Fully uncovered = solid line; covered = tint only.
  - Over-covered: red 135° hatch over the tint (same hatch language as absence, 2,5 px).
  - No demand: empty.
  - Tooltip: «Vegger · 15 t igjen av 30» / «+7,5 t over» / «dekket».
- Clicking a label or cell picks the brush, as in Detalj. Five competences take 70 px instead of 160 px (frees ~90 px for person rows).

### 3.11 Compact project lines (Detalj / Kompakt)

**Phase legend placement** (both densities): in the Prosjekter section row, on the timeline side, sticky 12 px right of the label column, exactly like Plan's work-phase legend in the Planlegging row (`.klegend.wp`): 10 px swatch + full phase name («Assembly · Moving in · Event · Moving out · Dismantle»), 12 px, muted ink. Never in the label column, where the Detalj/Kompakt toggle sits.

The same inline icon toggle directly after the Prosjekter section title, independent of Kompetanse's. Persisted per user (`projectDensity`). Phase colours carry the meaning; text in bars is dropped.

- **Detalj**: as §3, 22 px rows, project name in the event bar, phase names/codes in the others, phase legend.
- **Kompakt**: 12 px rows. Bars 6 px tall, 3 px from the top, 3 px radius, no text. Label: name 11 px and halls 10,5 px (single line, ellipsis). Tooltip on a bar still gives «Prosjekt · Fase». The fixed slot count (R37) is unchanged; only the row height changes.

## 4. Day cells (folded person row)

- Blocks are positioned proportionally inside 07:00–15:00 (4 px insets), 7 px from top and bottom, radius 5, competence colour, white text.
- **Label** (pref «Navn på blokker», default *Fullt*): full competence name if it fits, else the short label (VEG), else nothing. Hours are not shown in *Fullt*. *Auto* adds hours when there is room; *Kort* always uses short labels.
- **Overtime badge**: if blocks extend beyond 07–15, an inverted pill (ink background, canvas text, 9,5 px numeric) «+2» top-right. It sits below the sticky label column (z-index 1).
- **Weekend**: Kalender's weekend tint. Blocks there show as 6 px vertical colour bars plus the «+N» badge. Weekends cannot be painted.
- **Absence** (ferie, kurs, annet): neutral hatch `repeating-linear-gradient(135deg, ink/.10 0 2.5px, transparent 2.5px 8px)` with a centred italic label on a canvas chip.
- **Sick**: red hatch `danger/.20` on a `danger/.04` wash; centred italic «Syk» in danger red.
- **Move between days (drag and drop, Velg tool)**: press on a block in a folded cell and drag. A ghost of the day's block(s) follows the pointer column (and row: another person is allowed if they have the competence). Drop fills only free time on the target day with the same times (R38); absent, sick or ineligible targets show the not-allowed hatch and refuse with a toast. ⌥ while dropping copies instead of moving. One undo step. A press without movement is a normal Velg click.
- **Sick**: existing blocks follow the app's current rule (v1 code: «uløst» while hours of the competence remain that day, a faint trace once others cover the day; `openUnresolved`).
- New blocks animate in: `scaleX(.7) → 1`, opacity 0 → 1, 220 ms, origin left.

## 5. Unfolded person (inline hours)

- One pinned row, 364 px high, spanning every day column. Unfold by clicking the name, double-clicking a day (Velg tool only), «E»,. Only one person at a time. ↑/↓ steps to the previous/next person. Clicking a competence row label folds it.
- **Label column** (`--panel` background, the same calm surface as the side panel; not `--surface` white), top to bottom, with a 44 px time axis on the right (06, 07 bold, 09, 11, 13, 15 bold, 17, 19, 21):
  1. **Header** (40 px, bottom divider): «⇕ Name» (chevrons-down-up) as one button (click folds, hover fill) · ↑ / ↓ icon buttons right-aligned (previous / next person).
  2. **Hour totals** (3 equal columns, bottom divider): label 11 px muted, value 16 px numeric semibold. «Uke N» → «30 / 37,5» (capacity muted) · «Overtid uka» → hours (amber when > 0) · «Perioden» → normal hours, «+N» overtime in amber when > 0.
  3. **Competence list**: one 28 px row per competence the person has: swatch · name · key hint · **total hours in the period** for that competence (right-aligned, numeric; «–» faint when none; sick days excluded). Click sets the brush (tinted fill on the active one, or raised neutral per selection-style pref). Scrolls if longer than the space.
  4. **Hint** pinned to the bottom (top divider, 11,5 px faint): «Dra i en dag for å legge til <competence>. Dra en blokk for å flytte, kantene for å endre.»
- **Day track — plain grid**: the day cell itself is the track (no inset, no radius, no fill); day column lines separate days. 05:00–22:00 top to bottom, 340 px (1 h = 20 px), 12 px top/bottom margin aligned with the time axis. Hour lines (ink 7 %) run continuously across all days. Outside 07–15 hatched as overtime (the only marking of overtime time); the normal band is plain canvas; lunch 11:00–11:30 finely hatched; 07:00 and 15:00 marked with a 1 px rule (ink 30 %) across the row. Blocks inset 4 px each side. Weekends fully hatched. Absent/sick days: the absence hatch with a vertical label, not editable.
- **Blocks**: competence colour, radius 5. Name (full when the column is ≥ 90 px, else short) and time range. Time format: «07–15» when the column is < 112 px and the minutes are :00 («11:30–15» otherwise), «07:00–15:00» at ≥ 112 px; full time in the tooltip. Overtime parts carry a white diagonal hatch overlay.
- **Gestures** (R8, snap 30 min in the mockup; keep v1 `snap`):
  - Drag in empty track: creates a block with the active quick-select competence; ghost shows name and range. Only free time is filled (R5).
  - Drag a block: moves it in time and **across days** (hit-test by column). The original stays at 30 % until drop. A drop onto occupied time or an absent day is refused with a toast.
  - Drag top/bottom edge (6 px handles): resize, clamped by neighbours and 05:00/22:00.
  - Click a block: selects it (ring `0 0 0 2px canvas, 0 0 0 3.5px accent`). Delete/Backspace removes it.

## 6. Painting (folded rows)

- **Pick a competence**: 1–n keys, a competence row label, a demand cell, or the unfolded person's competence list. Picking sets the tool to Pensel. «B» with no brush picks the competence with the most remaining on the first visible workday (R14). Esc or V clears the brush.
- **Hover with the brush**: a *ghost block* preview where the free time would go (R6 fill), striped in the competence colour (30 % / 18 %, 5 px stripes, 1 px inner edge at 65 %), labelled «+7,5». Shift shows the half day. Cells that cannot take the brush (no competence, absence, sick, weekend) show a faint neutral hatch and a not-allowed cursor.
- **Drag**: one rounded selection (radius 7) over the rectangle, `inset 0 0 0 1.5px <colour>` plus a 4 px halo at 13 %, 4 % fill. Every eligible cell inside shows its ghost blocks. A dark pill above (below if near the top): «■ Vegger  6 dager · +45 t · 3 pers. | halv dag | 2 hoppes over».
  - The hit-test uses the pointer position against column geometry, **not** element hover, so overlays (the side panel) never stop the drag.
  - Auto-scroll: within 40 px of the visible right edge (the panel's left edge when the panel is open) or 16 px of the label column; down near the bottom.
  - Esc cancels.
- **Erase** (Tøm tool, or Alt-drag): the selection is red (same halo). Blocks inside become **monochrome dashed outlines** (`1.5px dashed ink/.45`, transparent fill, muted text). Pill: «Tøm  8 dager · 52 t».
- Release commits as one undo step.

## 7. Person panel

Right overlay, 340 px, Kalender's inspector structure: header (title, subtitle, close), then the body. **One view only in v2** (no segmented picker). Opens when a person's name is clicked; closes with × or Esc. The place to **monitor one person's overtime and absence**.

- Header: name, «Fast ansatt · 2 av 5 kompetanser».
- **Timer** (whole range): Normaltid / capacity · Overtid · Fravær (days). Overtime per ISO week as a list; weeks over the limit (§9) in amber; «N uker over grensen» under Overtid.
- **Fravær**: periods as date ranges («Ferie · 21.–23. okt»; sick in red). Click scrolls to the first day. Each period can be edited (kind, from, to, part of day) or removed. «+ Legg til fravær» opens the form **inline in the panel** — this replaces v1's `AbsenceDialog` modal (same fields: kind, from–to, whole day or a part of the day, note). Writing a period stores one `Unavailability` per day as today (R35).
- **Kompetanse**: the person's competences with hours worked on each in the range; click picks the brush.
- v1's `PersonEditor` stays on Personell; the panel does not edit name or competences.

*Later option, not v2:* absence brushes (Ferie / Syk / Kurs) in the plan bar that paint a range of days like a competence.

## 8. Focus day

- One focus day, shared with Plan mode through v1's `planningFocus` pref (R23). Marked **only** with the accent pill in the date header; **no tint** of the workspace columns.
- Set by clicking a header date, a demand cell, or (Velg tool) a person cell. Painting, erasing and dragging never move it.
- Hovering any person cell shows a **crosshair**: the date and that day's demand column get a light ink tint; clears on leaving the grid.

## 8b. Copy and paste (Velg tool)
- A click with Velg selects one cell; **clicking the same cell again deselects it** (as Esc).
- Drag with Velg on person rows draws a **neutral selection** (ink outline 70 %, same halo/pill style as painting): «3 dager × 2 rader». It stays after release: «3 dager × 2 pers. · ⌘C kopier · Esc fjern». A click makes a one-cell selection. Esc clears it.
- **⌘/Ctrl+C** copies the blocks in the selection (competence and times), relative to the first day. The plan bar shows «⎘ Kopiert · ⌘V ×»; the pill reads «Kopiert · ⌘V limer inn ved markøren».
- **Paste preview**: hovering any day with Velg shows ghost blocks where the copy would land, **for the same people**, starting at the hovered day.
- **⌘/Ctrl+V** pastes at the hovered day (or the selection's first day). Fills only free time; absent and sick days are skipped. Toast: «Limte inn N blokker fra tir 13. okt · K hoppet over» with «Angre». The clipboard stays until cleared (×) so it can be pasted repeatedly.

## 9. Context menu, sickness and overtime limit

«Name · tir 20. okt» · «Brett ut timer» · «Tøm dagen» · divider · «Meld syk …» (danger text) opens the Person panel's absence form prefilled (kind Syk, from that day) · «Fravær …» opens it prefilled with that day · «Friskmeld fra tir 20.» on a sick day ends the period the day before.

Blocks on sick days follow the v1 rule (§4).

**Overtime limit**: a weekly limit (pref, default 10 t). A person whose week overtime exceeds it shows their «+N» in an amber pill in the row label; the plan bar shows «⚠ N over 10 t overtid/uke» (tooltip lists person · week · hours; click opens the first in the Person panel and scrolls to the week). The Person panel lists overtime per week, with the over-limit weeks in amber, and «N uker over grensen» under Overtid.


## 10. Keys (Bemanning)

V select · B brush · T eraser · 1–n competence · Esc cancels drag → clears selection → clears brush · E unfold/fold the selected person · ↑/↓ step person when unfolded · Delete/Backspace remove selected block · ⌘/Ctrl+C / V copy and paste · ⌘/Ctrl+Z / Shift+Z undo/redo (shared with Plan).

## 11. Preferences (prefs.ts)

`planMode: 'plan' | 'bemanning'`, `bemanningRange: [from, to]`, `planningFocus` (v1, kept), `showProjects` (fold), `projectDensity` and `demandDensity: 'detail' | 'compact'`, `blockLabel: 'full' | 'auto' | 'short'` (default full), `selectionStyle: 'tint' | 'raised'` (default tint), `overtimeLimitPerWeek` (default 10).
