# Handoff: Kalender v7. Toolbar redesign, Avvik heat map, row-detail slide-over

## Overview
These are three changes to the Kalender workspace in `bemoy83/expo_planner`. They build on the Ledger restyle from the v6 handoff (`handoff/README.md`).

1. **Planning toolbar redesign.** All tools for manipulating the allocation grid move out of the page header into one bar directly above the planning rows. The bar sits inside the sticky grid header. The aim is less mouse travel. The bar also adds keyboard tool switching, modifier-drag and a right-click menu. It fits its width by degrading in priority order.
2. **Avvik heat map.** The Avvik (deviation) row becomes a row of colour-coded tiles: red for understaffed, amber for tight, green for spare. It can be toggled on and off.
3. **Row-detail slide-over.** The right-hand inspector overlays the grid instead of taking a grid column, and its content is restructured. This was out of scope in v6 and is now in scope.

One small calendar change comes along: **red days**. Public holidays (`type: 'Helligdag'`) get a red date number and a faint red column tint. Sundays are not red days.

## About the design files
The files in `mockup/` are **design references built in HTML/React (Babel in the browser)**. They are prototypes that show the intended look and behaviour. They are not production code to copy. Recreate them in the repo's existing React/TS environment and patterns (`Kalender.tsx`, `GridRows.tsx`, `GroupingBar.tsx`, …).

To view one, open `mockup/Expo Planner Kalender v7.html` in a browser. The Tweaks panel holds the explored alternatives; the defaults are the chosen ones.

## Fidelity
**High fidelity.** Colours, type, spacing and interactions are final. Use the Ledger tokens (`ds/tokens/*.css`) that the v6 handoff already brought in.

---

## 1. Planning toolbar

### Placement
- The old `.ktools` row under the page title is **removed**.
- The page header (`.khdr`) keeps only: the title plus meta line on the left; the **panel toggle** (icon `panel-right`, active when the inspector is open) and **"✦ Foreslå plan"** (accent button) on the right. It has a 1px `--border` bottom border.
- The new bar is a row inside the grid's sticky header. It sits **after the Avvik row and before the "Planlegging / Behov Plan Δ" column header**, so it always sits directly above the first planning row, whatever the scroll position.
- Row (`.krow.kpbarrow`): `height:auto`, `border-top:1px solid --border-strong`.
- Inner (`.kpbar-in`): `position:sticky; left:0; z-index:8`. Its width is set to the scroll container's `clientWidth`, measured with a ResizeObserver, so it doesn't scroll horizontally with the days. Also `background:--canvas; padding:8px 16px; display:flex; flex-wrap:wrap; align-items:flex-start; gap:8px 20px; white-space:nowrap; container-type:inline-size`.

### Zones (left → right)
| Zone | Class | Contents |
|---|---|---|
| Edit | `.kz-edit` | Undo (`undo-2`), Redo (`redo-2`) icon buttons; the **tool segmented control** |
| Rows | `.kz-rows` (inside `.kview`) | Filter menu button; **Grouping menu button**; Fold/expand-all icon button (`chevrons-down-up` / `chevrons-up-down`) |
| Time | `.kz-time` (inside `.kview`, `margin-left:auto`) | Modifier hint; "I dag" ghost button; S/M/L zoom segmented control (mono) |

Layout details:
- Each zone: `display:flex; gap:6px; flex-wrap:nowrap`.
- `.kview`: `flex:1 1 auto; display:flex; justify-content:space-between; flex-wrap:wrap; gap:8px 20px`. When the bar wraps, rows and time drop together as row 2.

### Tool segmented control
- Options:
  - **Velg** (`mouse-pointer-2`, key **V**)
  - **Fordel behov** (`pencil`, key **F**)
  - **Tøm** (`eraser`, key **T**)
- Labels are **always visible**. Each option shows icon (14px) + label + a `<kbd>` hint: `font:500 10px/14px mono; padding:0 4px; radius:4px; background:ink/7%; color:--ink-faint`.
- Hover on an unchecked option: `background: rgb(--ink / .06); color: --ink`. There is no border or accent on hover, so it stays clearly weaker than the selected state.
- An hover-expand variant (icon-only at rest) was explored and rejected, because labels expanding under the cursor made the target jump.

### Grouping menu (replaces the inline chip track)
- The button (`.kfbtn.kgbtn`) shows a `layers` icon + the **full breadcrumb**, e.g. "Prosjekt › Arbeidsfase › Hall/Sted", + `chevron-down`. Its title tooltip repeats the full trail.
- The popover (260px):
  - "Grupper etter" section: one row per level, showing its number, its name, and buttons for ↑ (up), ↓ (down) and ✕ (remove).
  - "Legg til nivå" section: the unused dimensions as `+` items.
- Changing the grouping resets collapsed state, as before. The popover closes on an outside mousedown.

### Modifier hint
- Text: info icon + "**Shift**/**Alt**-dra · **høyreklikk**".
- Shown only when Hjelpetekster (settings) is on.
- Title tooltip: "Hold Shift og dra for å fordele, Alt og dra for å tømme. Høyreklikk en celle for flere valg."

### Fit algorithm (important)
CSS breakpoints can't know the breadcrumb length, so the bar measures itself. A `useLayoutEffect` runs on every render; width changes trigger a re-render through the ResizeObserver. It sets `data-fit` on `.kpbar-in` to the first stage that passes.

Stages that require **one row** (all zones share the same `offsetTop`):
| `data-fit` | Effect |
|---|---|
| `0` | Everything full |
| `1` | Hint text hidden (icon only) |
| `2` | + breadcrumb `max-width:240px` (ellipsis) |
| `3` | + breadcrumb `max-width:160px` |

Wrapped stages, which require **≤2 distinct rows** and no overflow (`scrollWidth <= offsetWidth+1`):
| `data-fit` | Breadcrumb max-width |
|---|---|
| `w0` | full |
| `w240` | 240px |
| `w160` | 160px |
| `w110` | 110px |
| `w70` | 70px (final fallback) |

The hint text is hidden in every stage except `0`. A container query at ≤700px hides the hint entirely and caps the filter label at 110px; at ≤620px the cap is 90px.

Measured with 2 levels, it stays on one row down to about 1150px. With 5 levels it stays on one row down to about 1150px with truncation, and on two rows below that.

### New interactions (shorter mouse travel)
- **Keys:** V / F / T switch tools and Esc returns to Velg. They are ignored while an input is focused or a modifier key is held.
- **Spring-loaded modifiers:**
  - Shift-drag on a row distributes, whatever the current tool.
  - Alt/Option-drag clears.
  - The modifier is read at mousedown and stored on the drag (`drag.tool`). The drag preview colour follows `drag.tool`.
  - While a modifier is held, the grid gets `data-t="distribute|clear"`: leaf cells get `cursor:crosshair`, and hover shows an inset 1.5px outline (accent/60% or danger/70%).
- **Right-click menu** on a leaf cell (280px, `position:fixed` at the cursor, clamped to the viewport; closes on outside mousedown, Esc or grid scroll). It also selects the cell. Items:
  - Header: "{competence} · {wd} {d}. {mon}"
  - **Fordel gjenstående over vinduet** (shows the remaining FTE-days; disabled when 0)
  - **Fordel herfra til vindusslutt** (distribute over the current column → last window day)
  - **Tøm cellen** (`Del`)
  - **Tøm raden**
  - divider
  - **Vis raddetaljer** (opens the inspector)
- **Row hover actions:** in the leaf label, before Behov/Plan/Δ, two 24px icon buttons appear on hover: pencil = distribute over the window (disabled if nothing remains), eraser = clear the row (disabled if the row is empty). Clicks don't select the row.
- `onRange(rowId, a, b, tool)` now takes the tool explicitly. The default is the current tool.

---

## 2. Avvik heat map
Tweak: **"Varmekart for avvik"**, default **on**. Off renders the previous Avvik row unchanged.

- Row: `.kheatrow`, height **30px**; day dividers hidden (`border-right-color:transparent`).
- Per day, `v = tilgjengelig − planlagt behov`. Days with no crew and no demand render nothing.
- Tile (`.kheat`): absolutely positioned in the cell with `inset:3px 2px; border-radius:5px; z-index:0`. That gives a 4px gap between neighbours, matching the phase strips on project totals. The value sits on top (`kv`, 600 weight, `z-index:1`).
- Colour ramp: `color-mix(in oklab, <token> P%, rgb(--canvas))`.

| Condition | Fill | Text |
|---|---|---|
| `v < 0` (understaffed) | `--danger` at `22 + s·63`%, where `s = min(1, −v / maxShortage)` and `maxShortage` = the largest shortfall in the period (min 1) | `#fff` when `s > .5`, else `--danger` |
| `0 ≤ v < 2` (tight) | `--draft` at 22% | `--ink` |
| `v ≥ 2` (spare) | `--committed` at `8 + t·20`%, where `t = min(1, v / maxSurplus)` | `--committed` |

- Tile title (tooltip): "Underdekning / Stramt / Ledig {v} FTE".
- The label is "Avvik" + a 4-swatch legend (10×10px, radius 2px, gap 2px): danger 85%, danger 35%, draft 22%, committed 22%. Its tooltip: "Rødt: underdekning (mørkere = større). Gult: stramt (under 2 FTE ledig). Grønt: ledig kapasitet."
- The Avvik row is in the sticky header, so the heat map is always visible. A column tint or hatch on understaffed days was explored and **rejected as visual overload**.

### Red days (public holidays)
- `dayCls` adds `.red` when `DAYS[i].type === 'Helligdag'`. Holidays also count as non-working days: the weekend grey and zero base crew apply, because `type !== 'Arbeidsdag'`.
- Date number and weekday turn `--danger`.
- Column tint on the date header rows and the planning rows (groups and leaves): `background-image: linear-gradient(rgb(--danger / .07), …)`, or `/.12` in dark mode. It's layered over the existing cell fill, so leaf cells must set `background-color`, not `background`.
- The sample data (5 Oct–15 Nov) has no holidays, so the feature is wired but not visible in the mockup.

---

## 3. Row-detail slide-over

### Container
- `.kwork` becomes a single grid column with `position:relative; overflow:hidden`. **The grid no longer shrinks** when the panel opens.
- Panel `.kinsp`:
  - `position:absolute; top:0; right:0; bottom:0; width:340px; max-width:calc(100% − 48px); z-index:20`
  - `background:--panel; border-left:1px --border; box-shadow:-12px 0 32px -12px rgb(--ink / .22)`
  - On mount: `translateX(100%) → 0` over 220ms with `--ease` (`cubic-bezier(.4,0,.2,1)`).
- It opens from the header panel toggle or the "Vis raddetaljer" context item, and closes with its own ✕ button.

### Structure (top → bottom; flex column, body scrolls, footer pinned)
1. **Header** (`.ki-head`): `padding:16px 12px 14px 20px; background:--total-1 (--sunken); border-bottom:1px --border`.
   - Title: competence, `--type-line-title`, `letter-spacing:-.02em`.
   - Sub line (13px `--ink-muted`, gap 6px): WorkMark swatch · phase · project name (ellipsis). **No pill/chip fills.**
   - Right: icon buttons for Endre rad (`pencil`) and Lukk (`x`).
2. **Sections** (`.ki-sec`): `padding:16px 20px 18px; border-bottom:1px --border` (none on the last one). Section heading `.ki-h`: eyebrow type, uppercase, `.06em`, `--ink-faint`, `margin-bottom:12px`; an optional right-aligned mono meta (11px, no uppercase).
   - **Fremdrift** (meta "FTE-dager"): a 3-column stat grid with 1px `--border` dividers and 14px padding either side. Each stat is a label (12px muted), a value (`600 22px/1.15 mono, −.03em`) and a sub-line (11px mono faint).
     - Behov: value = need; sub = hours.
     - Planlagt: value = plan; sub = hours.
     - Gjenstår / Over / Dekket: value = rest, or "+x", or "✓"; sub = coverage %. Colour: ink / `--draft` / `--committed`.
     - Below: a 4px progress bar (track `--sunken`, radius 4). Fill is `--work-m`, `--committed` when done, `--draft` when over.
     - Optional warning (12px `--draft`): "{x} FTE-dager ligger utenfor vinduet."
   - **Vindu**: a definition list (`grid 96px / 1fr; gap 7px 12px; 13px`; dt muted, dd ink) with Periode (mono range), Arbeidsdager, Hallfaser ("Assembly, moving in" / "Moving out, dismantle"), Haller.
   - **Omfang**: the same list style, with Prosjekt (name · no.), Data fra, Grunnlag, Hall/Sted, Avd.
   - **Dager med FTE** (meta = count): the existing day table (Dag / Raden / Behov / Avvik), unchanged.
3. **Footer** (`.ki-foot`), pinned: `padding:12px 20px; min-height:56px; border-top:1px --border; background:--panel`.
   - Rest > 0: a full-width secondary button with the pencil icon, "**Fordel {rest} over vinduet**".
   - Otherwise: 13px/500 text, either "Behovet er dekket" (`--committed`) or "{x} FTE-dager over behovet" (`--draft`).
   - This replaces the old inline rest-and-button row that wrapped badly.

---

## State (new or changed)
| State | Where | Notes |
|---|---|---|
| `tool` | App | Now also set by the V/F/T/Esc keys |
| `drag.tool` | Grid | The effective tool, captured at mousedown |
| `mod` | Grid | `'distribute' \| 'clear' \| null` from live Shift/Alt; drives `data-t` |
| `ctx` | Grid | `{x, y, rowId, col}` for the context menu |
| `vw` | Grid | Scroll container width (ResizeObserver) |
| `data-fit` | DOM attr | Set imperatively by the layout effect |
| `heat` | Settings/tweak | Boolean, default `true` |
| `inspOpen` | App | Unchanged; the panel is now an overlay |

## Design tokens used
Light values; dark values are in `mockup/ds/tokens/colors.css`.
- **Neutrals:** `--canvas` #f2f0eb · `--panel` #faf9f6 · `--surface` #fff · `--sunken`/`--field` #e7e4dd · `--border` #dcd8cf · `--border-strong` #c4bfb4
- **Ink:** `--ink` #171613 · `--ink-muted` #5b5953 · `--ink-faint` #77746c
- **Accent:** `--accent` #ec6f00 · `--accent-soft` = accent 15%
- **Status:** `--danger` rgb(197 54 55) · `--draft` rgb(143 94 10) · `--committed` rgb(40 124 66)
- **Work phases:** `--work-m` `oklch(0.8 0.065 115)` (olive, the chosen tweak) · `--work-d` `oklch(0.8 0.075 42)`
- **Radii:** 8 (controls), 6 (cells/badges), 5 (heat tiles), 4 (kbd, progress), 2 (legend swatches)
- **Type:** Schibsted Grotesk (UI), JetBrains Mono (numbers); fonts are in `handoff/fonts/`

## Repo mapping
| Change | Likely files |
|---|---|
| Toolbar move, keys, modifiers, context menu | `src/ui/kalender/Kalender.tsx`, `src/ui/kalender/GridRows.tsx` |
| Grouping menu | `src/ui/kalender/GroupingBar.tsx` |
| Heat map, red days | `src/ui/kalender/GridRows.tsx` (`HeadRows`/Avvik row, day cell classes), `src/domain/calc.ts` (deviation) |
| Slide-over | `src/ui/kalender/Kalender.tsx` (layout), the row-detail panel component |

## Files
- `mockup/Expo Planner Kalender v7.html`: app shell, toolbar, CSS, tweaks
- `mockup/KalenderGrid v7.jsx`: grid, fit algorithm, modifiers, context menu, heat map
- `mockup/KalenderPanels v7.jsx`: `GroupingMenu`, `RowInspector` (slide-over content), `FilterMenu`
- `mockup/planner-data.js`, `mockup/tweaks-panel.jsx`, `mockup/ds/`: sample data, tweak shell, design system

No new image assets; icons come from the existing Lucide set.

## Screenshots (`screenshots/`)
Captured from the mockup. Some are scaled down to show a wider layout, so the label column truncates more than it would at 100%.
- `01-toolbar-overview.png`: planning bar on one row (fit stage `1`), heat map, panel closed
- `02-context-menu.png`: right-click menu on a leaf cell
- `03-grouping-menu.png`: grouping popover
- `04-row-detail-slide-over.png`: inspector overlaying the grid
- `05-toolbar-wrapped.png`: about 920px wide, bar wrapped to two rows (edit / rows + time)
- `06-heatmap-understaffed.png`: after "Foreslå plan for alle", with red understaffed tiles of varying intensity next to amber and green
