# Handoff: Kalender v9 — mode colour, calm grid, line rules

**Place this package in the repo at `design_docs/kalender-v9/`.** Builds on `bemanning-v2` (Plan · Bemanning on one timeline). That package defines behaviour; this one defines **visual language**. No behaviour changes.

## About the design files
Everything in `mockup/` is an **HTML design reference**, not production code. Recreate the look in the app's existing React/Next codebase (`bemoy83/expo-calculator`, `app/globals.css`, `src/ui/kalender/…`) using its components and tokens. Class names in the mockup (`.krow`, `.kcell`, `.klab`, `.kgroup.top/.sub`, `.kleaf`, `.ksec`, `.kpbar-in`, `.khdr`) are mockup names — map them to the app's.

**Fidelity: high.** Colours, line weights and fills are final. Open `mockup/Expo Planner Kalender v9.html` in a browser to see it live (toggle Plan/Bemanning, dark mode).

## The scope in one sentence
Give each mode its own colour band (Plan olive, Bemanning terracotta), switch accent to a softer orange, and strip the grid down to only the lines that carry information.

## Read first
1. **`DESIGN-RULES.md`** — the rule set. It is normative; this README summarises.
2. **`Design Rules.html`** — annotated visual of every row type, tokens and the "never do this" list.
3. **`v9-system.css`** — the complete CSS delta, extracted verbatim from the mockup. Port this; ignore the older rules above it in the mockup.

Also add `DESIGN-RULES.md` (or a pointer to it) to the repo's `CLAUDE.md`, so future Claude Code sessions follow it.

## Changes

### 1. Accent → Brent oransje
| | Light | Dark |
|---|---|---|
| `--accent` | `212 108 44` `#d46c2c` | `232 140 84` `#e88c54` |
| `--accent-ink` | `24 12 4` | `24 12 4` |
Replace the old `236 111 0` in `globals.css`. `--accent-soft` derives automatically. Accent is never used for mode marking.

### 2. Mode band
- Page header + Kalender toolbar (plan bar) become **one band** filled with the mode colour.
- Exactly two lines: **top of header**, **bottom of toolbar**. No line between them, no line above the toolbar.
- Mode tag pill after the title: "Plan" / "Bemanning" (icon calendar / users), translucent canvas `55%`.
- Mode hue is set once on `<html data-vmode="behov|bemanning">`:
  - Plan `--vh:115; --vc:.09` (olive) · Bemanning `--vh:40; --vc:.11` (terracotta)
- Derived tokens (light / dark):
  - `--v-band` `oklch(.86 vc·.6 vh)` / `oklch(.40 vc·.5 vh)`
  - `--v-band-line` `oklch(.70 vc·.85 vh)` / `oklch(.55 vc·.7 vh)`
  - `--v-track` (segmented track) `oklch(.79 vc·.7 vh)` / `oklch(.32 vc·.45 vh)`
  - `--v-tb-ink` `oklch(.30 vc·.55 vh)` / `oklch(.93 vc·.3 vh)`; `--v-tb-mute` `oklch(.42 vc·.6 vh)` / `oklch(.78 vc·.45 vh)`
  - `--v-field` surface 55 % (light) / `oklch(.47 vc·.45 vh / .6)` (dark)
- Toolbar on the band: selected segment = `--surface` + `0 1px 2px oklch(.3 .05 vh / .18)`; unselected text `--v-tb-mute`; hover = surface 35 %. Field buttons (`Alle prosjekter`, grouping) = `--v-field`, hairline `inset 0 0 0 1px oklch(.3 .05 vh / .08)`. kbd hints `oklch(.3 .05 vh / .1)`.
- **Transition**: background/colour 360 ms `var(--ease)` on mode switch (runs with the existing 460 ms zoom).

### 3. Grid line system
Four line tokens only:
| Token | Value | Where |
|---|---|---|
| `--g-col` | `border / .55` | vertical day line — editable rows + date header only |
| `--g-row` | `border / .40` | under each editable row |
| `--g-phase` | `border / .50` | above a phase subtotal |
| `--g-top` | `border-strong` | above a top-level group (project, Bemanning divider) |

Row-type table (full version in DESIGN-RULES §3):
- **Date header**: day lines; no line between the two date rows; one `--border` line under the whole sticky header.
- **Section rows** (Haller, Bemanning, Prosjekter, Kompetanse): neutral tint `--v-sec` (canvas 96 % + ink), **no lines at all**, weekend `--we-sec`.
- **Readout rows** (Avvik, Faste, Innleid, Fravær, Planlagt behov, Tilgjengelig): no lines, labels **right-aligned**.
- **Bar rows** (halls, projects in Bemanning, competence): no lines.
- **Project row**: `--g-top` above, own band fill, label 700, weekend `--we-top`.
- **Phase subtotal** (Montering/Demontering): `--g-phase` above, **no fill, no day lines, default cursor**, label + sums `--ink-muted` 500. Must not look editable.
- **Editable rows**: `--g-col` + `--g-row`. First row after a subtotal gets a `--g-row` top line **on its cells/label** (not the row). Last row before a new group/section drops its bottom line.
- **Bemanning**: person rows `--g-row`; expanded person row bottom `--border` (not strong); `ps-div` keeps `--g-top`.
- **Inspector**: section separators `border / .5` + 10 px top padding; day table rows `border / .45`.

### 4. Weekend
"One step darker than the row's own background", always opaque, full row height:
`--we-row` = `--sunken-2` · `--we-sec` = sunken-2 95 % + ink · `--we-top` = ink 9 % + canvas.

### 5. Today line
Replace per-cell `::after` with **one absolutely positioned element** per scroll layer: one inside the grid body (z 3), one inside the sticky header (z 6). Left = `labelWidth + todayIndex × dayWidth`, 2 px, `--accent`. Sits above lines, weekends, bars, selection; below sticky labels (z 3/7), the toolbar band (z 8) and the "Planlegging" header row (z 7, opaque canvas).

## Implementation traps (all happened in the mockup)
- **No transparent borders with width on rows.** Rows have no background → 1 px gap → weekend/today line bleeds through. Use `border-width: 0`.
- Put internal closing lines on cells, not rows.
- Sticky label column must always be opaque.
- Weekend cells in rows taller than the default must stretch (`align-self: stretch; height: auto`).
- Phase strips on project rows: extend 1 px over the cell edge so adjacent days merge into one bar.
- Section rows need real day cells (or a painted background) so weekends continue through them.

## Acceptance
1. Plan and Bemanning bands show olive/terracotta, framed top+bottom, no inner line; switch animates.
2. Scroll horizontally: no content visible through any label; today line continuous, hidden only under band and Planlegging row.
3. No vertical day lines on any non-editable row.
4. `--border-strong` appears in the grid only above top-level groups.
5. Every weekend cell is opaque and full height in all row types.
6. Light and dark both pass.

## Files
- `README.md` — this file
- `DESIGN-RULES.md` — normative rules
- `Design Rules.html` — visual reference
- `v9-system.css` — CSS delta to port
- `mockup/Expo Planner Kalender v9.html` + `KalenderGrid v8.jsx`, `KalenderPanels v8.jsx`, `PlanStaff.jsx`, `PlanSide.jsx`, data files, `ds/` — runnable reference. The JSX changes vs. bemanning-v2: section rows render a day-cell track; `.ktodayln` elements added in `.kinner` and `.khead`.
