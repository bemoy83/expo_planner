# Expo Planner — Kalender design rules (v9)

Source of truth: `Expo Planner Kalender v9.html`, block `/* ===== v9 SYSTEM ===== */`.
Visual reference: `Design Rules.html`.

The core idea: **lines are information, not decoration.** A line exists only where a reader moves the eye *along* it to read numbers. Everything else is separated by tint, spacing or type.

---

## 1. Tokens

| Token | Value (light) | Use |
|---|---|---|
| `--accent` | `212 108 44` (Brent oransje) | Today line, selection, focus, count badges, primary action. Never for mode marking. |
| `--vh / --vc` | Plan `115 / .09` (olive), Bemanning · Faste `195 / .06` (gran), Bemanning · Innleid `235 / .065` (fjord) | Mode hue. Set by `html[data-vmode]` (+ sub-mode). Nothing else may set it. |
| `--v-band` | `oklch(.86 …)` | Fill for the mode band (header + toolbar). |
| `--v-band-line` | `oklch(.70 …)` | The two lines framing the band. |
| `--v-sec` | canvas + 4 % ink | Neutral section-row tint. **Never hue-tinted.** |
| `--g-col` | border / .55 | Vertical day line. |
| `--g-row` | border / .40 | Horizontal row line. |
| `--g-phase` | border / .50 | Line above a phase subtotal. |
| `--g-top` | border-strong | Line above a top-level group. |
| `--we-row / --we-sec / --we-top` | see CSS | Weekend fill per row background. |

Do not invent new line colours. If a line is needed it is one of the four `--g-*` tokens.

## 2. The mode band

- The page header (`.khdr`) and toolbar (`.kpbar-in`) form **one band** filled with `--v-band`.
- The band has exactly **two lines**: one on top of the header, one under the toolbar (`--v-band-line`). **No line between header and toolbar.**
- Toolbar controls on the band: text `--v-tb-ink`, secondary text `--v-tb-mute`, segmented tracks `--v-track`, selected segment = surface white + soft shadow, field buttons = translucent surface (`--v-field`).
- The mode tag next to the title ("Plan" / "Bemanning") is a translucent canvas pill.
- Mode colour appears **only** in the band. Grid, sections and panels stay neutral.
- Accent orange is never used as band colour, and band hues are never used for actions.
- **Alerts on the band are solid chips** (`.ps-otw` warning `--al-warn`, `.ps-unres` blocking `--al-block`, text `--al-on`). Exception — *waiting for an answer* (Innleid) is not an alert: surface chip, ink text, waiting glyph. Ochre is reserved for overstaffed. Never a tinted `*-bg` and never band ink. Lys uses the lightest AA values (`#a16606` / `#cb4543` + white: text ≥ 4.5:1, chip vs band ≥ 3:1). Mørk uses `--draft` / `--danger` + canvas ink. Re-check both numbers if `--v-band` changes.

## 3. Row types and what they get

| Row type | Examples | Vertical day lines | Horizontal line | Fill | Weekend |
|---|---|---|---|---|---|
| Date header | `kdate1`, `kdate2` | **yes** (defines columns) | none between them; one `--border` under the whole `.khead` | none | `--we-row` |
| Section row | `.ksec` Haller, Bemanning, Prosjekter, Kompetanse | **no** | **none** (tint separates) | `--v-sec` | `--we-sec` |
| Summary / readout | Avvik, Faste, Innleid, Fravær, Planlagt behov, Tilgjengelig | **no** | `--g-row` between rows (day cells only, not the label column); `--g-phase` above Planlagt behov; none after a section row | none | `--we-row` |
| Bar row | hall bars, project bars, competence strip | **no** | **none** | none | `--we-row` |
| Planning header | `.kplanhead` | n/a | none (sits on top of today line) | canvas, opaque | n/a |
| Top-level group | project row (`.kgroup.top`), `ps-div` in Bemanning | **no** | `--g-top` **above** | row band | `--we-top` |
| Phase subtotal | `.kgroup.sub` Montering/Demontering | **no** | `--g-phase` above | **none**, label muted | `--we-row` |
| Editable row | `.kleaf`, `ps-pr`, `ps-vrow` | **yes** `--g-col` | `--g-row` under every row | none | `--we-row` |

**Demand spans (Plan, editable rows):** distributed FTE is drawn as phase-style bars, not filled cells. One bar per run of consecutive days with value > 0; colour = phase tone, 5 px inset top/bottom, 5 px radius + 2 px inset at run ends only, interior cells overlap 1 px so the run is seamless. Day lines (`--g-col`) are hidden *between cells of the same run* only — empty cells keep them. Values sit on the bar per day. Selection/edit stay per cell, above the bar.

Rules that fall out of the table:

1. **Vertical lines only on editable rows** (+ date header). If you cannot type into it, it has no column lines.
2. **Horizontal lines only where numbers are read across.** Bar rows and section rows get none.
3. **The strong line means one thing:** start of a new top-level group. Nothing else uses `--border-strong` in the grid.
4. **The editable block is closed on both ends:** first row after a subtotal gets a `--g-row` top line; the last row before a new group/section drops its bottom line (the next group's line takes over). Never two lines stacked.
5. **Weekend = one step darker than the row's own background.** Plain row → `--we-row`; section tint → `--we-sec`; project band → `--we-top`. Weekend cells always fill the full row height.
6. Labels for readout rows are **right-aligned** against the numbers (like hall names). Group and editable labels are left-aligned.

## 4. Never do this (the bugs we already fixed)

- **No invisible lines.** Never set `border-color: transparent` on a *row* (`.krow`, `.ksec`) — the row has no background, so a 1 px gap opens and weekend fills / canvas bleed through. Set `border-width: 0` instead. Transparent borders are only OK on cells whose own background covers them.
- **No line on the row when a cell line will do.** Closing lines inside the grid go on `.kcell`/`.klab` so they inherit cell backgrounds.
- **No translucent fills in the grid.** `color-mix` percentages must sum to 100 %; a weekend must be opaque.
- **Sticky labels are always opaque.** Every `.klab` has a solid background (canvas, band or section tint), otherwise scrolled content shows through.
- **Short weekend cells.** If a row is taller than 22 px, its cells must `align-self: stretch; height: auto`.
- **Hue in neutral places.** Section rows and the grid never carry mode hue.

## 5. Today line

- Drawn at the **left edge** of today's column (on the day line), never through the middle — it must not cross date labels, values or chips.
- One continuous element (`.ktodayln`), not per-cell pseudo-elements. Two copies: one in `.kinner` (z 3) and one in `.khead` (z 6).
- It sits **above** grid lines, weekend fills, bars and selection.
- It sits **below** sticky labels, the mode band/toolbar (z 8) and the planning header row (z 7).
- **It breaks at headings.** Section rows (`.ksec`: Haller, Bemanning, Prosjekter, Kompetanse), the toolbar band and the "Planlegging" row sit on top of it (opaque, z 7+). The line marks today *inside data*, never across a heading.
- Colour: `--accent`, 2 px.

## 6. Type & alignment quick reference

- Top-level label: 14 px / 700. Phase label: 13 px / 500, muted, sums muted 500.
- Section labels: eyebrow style, uppercase, `--ink-faint`.
- Numbers: `--font-numeric`. Readout labels right-aligned.
- **Signed hours.** Missing hours are negative (`−7,5`, real minus U+2212), booked/allocated hours positive (`+7,5`), covered = `✓`. Grid speaks hours; persons only on order chips and the order itself.

## 6b. Avvik colour — three states

The planner needs three answers only: under, ok, over. Same system in Plan, Bemanning and Innleid.

| State | Fill | Number |
|---|---|---|
| Under | `--danger`, scaled 22→85 % by size (ink turns white past 50 %) | `−x`, always |
| Ok | `--committed` flat 20 % | shown if ≠ 0 (no hidden hours), else colour only |
| Over | `--draft` (ochre), scaled 18→55 % — capped below red | `+x`, from the first hour |

- Ok band: Kalender 0 to +1 FTE. Innleid = within one shift-person over (coverage tolerance).
- Green means *ok*, never "lots of spare capacity".
- Pending answers (Innleid) are confidence, not a state: dot, never colour.
- Legend = three swatches: under · ok · over.

## 6c. Innleid (Bemanning · Innleid) — session 2026-10-13

- **Two answer states.** `Venter` (conf = null) and `Bekreftet`. No partial state: a short answer sets the real headcount (`fte = conf = n`, original kept as `asked`); the rest returns to Avvik as uncovered. Raising a confirmed count → back to `Venter`.
- **Waiting glyph.** Clock in an ink ring. Ink only — never ochre (ochre = overstaffed). Confirmed chips carry no glyph; mark the exception, not the norm.
- **Grid chip** = count + full supplier name. Shift/time is order detail (tooltip, pane, order). Folded view merges one supplier's shifts on the same day into one chip.
- **Coverage cell** = bar + signed hours on one line; the bar shortens when a number shows. No ✓ — a full bar is enough.
- **Popovers.** First click outside only closes (swallowed). Esc closes; Enter closes the answer popover. Edits save immediately; `Ferdig` confirms.
- **Exception to §2:** the primary confirm button in Innleid popovers (`Ferdig`) is ink fill + `--v-band` text. Only there.
- **Exception to band alerts:** "venter på svar" in the toolbar is a surface chip with ink text + waiting glyph, not `--al-warn`.
- Day column 116 px. Side panel is a slide-over (not docked); help behind `?`.

## 7. Checklist before shipping a grid change

1. Did I add a line? Which `--g-*` token, and which rule in §3 allows it?
2. Is any row border transparent with non-zero width? → make it 0.
3. Does every weekend cell fill the row height and stay opaque?
4. Is the today line still continuous from date header to last row (except under band/planhead)?
5. Is mode hue only in the band?
6. Check both Plan and Bemanning, light and dark.
