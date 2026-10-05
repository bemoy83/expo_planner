# Kalender: Ledger redesign, suggested

What this is: a proposal to move the Kalender workspace in `bemoy83/expo_planner` onto the Ledger design system (from the Cost Estimator), in two phases.

- **Phase 1: tokens and CSS only.** Ready to apply. No markup, state or logic changes. Removing the file undoes it.
- **Phase 2: anything that touches existing logic or needs new logic.** Deferred. Each item needs explicit approval before work starts.
- **Out of scope:** the row-detail right panel. It appears in the mockup only as context and is not part of this redesign.

Visual reference: `mockup/Expo Planner Kalender v6.html` (open it in a browser). The tweaks panel in the mockup keeps the explored alternatives; the defaults are the chosen ones.

---

## Phase 1: tokens and CSS only (safe)

### Files
- `kalender-ledger.css`: the stylesheet, which overrides `src/index.css`.
- `fonts/*.woff2`: Schibsted Grotesk (UI) and JetBrains Mono (numbers).

### Apply
1. Copy `fonts/*.woff2` to `public/fonts/`.
2. Copy `kalender-ledger.css` to `src/kalender-ledger.css`.
3. In `src/main.tsx`, add `import './kalender-ledger.css'` on the line after `import './index.css'`. As an alternative, paste the file at the end of `index.css`.

That import line is the only change to the code. To roll back, delete the line.

### Guarantees
- It only targets class names that already exist in `index.css`, `GridRows.tsx` and `Kalender.tsx`.
- Token names are unchanged (`--bg`, `--surface`, `--mon`, `--dem`, `--ph-*` …); only their values change. It adds `--ph-movingin`, `--ph-movingout`, `--band`, `--band-we` and `--faint`.
- `.ph-movingIn` and `.ph-movingOut` are already separate classes. Splitting their colours is a selector change, not a logic change.
- The row-detail panel isn't touched.

### What changes visually
| Area | Change |
|---|---|
| Palette | Warm paper background (`#f2f0eb`), ink text, orange accent for selection/focus/today. |
| Type | Schibsted Grotesk for UI, JetBrains Mono for all numbers and dates. |
| Hall calendar | Five distinct phase hues, none shared: assembly blue, moving in teal, event violet, moving out amber, dismantle rose. |
| Work phases | Montering is light olive, Demontering light terracotta, both with dark numbers. The M/D label colours match. |
| Levels | Only the project total (`.group-row.depth-0`) gets a band. Deeper levels are type + hairline, no fill. |
| Weekends | One finished colour per cell, never stacked. On the project band they get `--band-we`; on subtotals they're hidden. |
| Total rows | Gridless (no day dividers), so they read as read-only. This applies to subtotals and the "Planlagt behov" / "Tilgjengelig" totals. |
| Avvik row | Keeps its grid. Deficit days are `--neg-bg`. |
| "Planlegging" header row (`.col-head`) | No day cells. |
| Window | The bottom stripe and blue/orange tint are replaced by a faint dot in empty workdays (`::before`, so it doesn't clash with the note marker on `::after`). |
| Outside window | 1.5px red outline (unchanged meaning). |
| Coverage bars | Hidden (`.coverage{display:none}`). The Δ column carries coverage. |
| Today | Accent line and accent date, replacing the yellow. |
| Controls | Borderless field-fill buttons/selects, radius 8. Grouping chips become white tiles; "+ X" chips become ghost text. |
| Tooltip | Warm muted black `#4a4642`. |

### Verify after applying
- [ ] Hall calendar: MI and MO show different colours, and event names are readable on violet.
- [ ] Planning rows: filled Montering/Demontering cells, the selected range (`.selected`), the focus outline and the fill handle are all visible.
- [ ] Pencil (`.drawn`) and eraser (`.erasing`) previews still show.
- [ ] Overbooked days (`.overbooked`, red wash): still visible over the new fills.
- [ ] Entry-level groups (`.entry-level`): editable cells are still white with the accent edge.
- [ ] Notes (`.has-note`): corner marker visible on a cell that also shows the window dot.
- [ ] Behov / Haller / KPI tabs: tables still read well (they share `--bg`, `--line` and buttons).

---

## Phase 2: needs approval (touches logic or adds logic)

Each item lists what it needs. None of them is started.

### A. Header restructure
In the mockup: the top bar holds the brand, tabs, a save dot, the Venyou sync as "Haller · 2. okt" and an Innstillinger menu. The page header holds the title + meta and "✦ Foreslå plan". The toolbar has three zones: edit (undo/redo, Velg / Fordel behov / Tøm), view (filter menu, grouping, fold toggle) and navigate (I dag, S/M/L, panel toggle).
- **Needs:** JSX moved in `App.tsx` and `Kalender.tsx` (toolbar), a new settings menu with open/close state, a filter popover combining the project select with "Skjul tomme" and "Bare det som gjenstår", and a segmented control for the tools (currently separate buttons).
- **Risk:** low to medium. Handlers stay as they are, but import, backup, restore and the "Bemanning og normaltid" dialog all move. Keyboard shortcuts are unaffected.

### B. Grouping bar: one "+" menu
The unused levels go into a single "+" dropdown instead of a chip each. The active levels sit in one track.
- **Needs:** open/close state and a wrapper element in `GroupingBar.tsx`. Drag-reorder must keep working inside the track.

### C. Project total: hall-phase strip per day
Instead of the neutral `in-span` underline, the project total gets a rounded strip in the colour of that day's hall phase (A/MI/Event/MO/D).
- **Needs:** a new `ph-*` class on the group cells of `depth-0` project rows, derived from the project's venue phases per date (`GroupRow` in `GridRows.tsx`). Also a rule for projects across halls with different dates: the mockup uses the earliest phase.

### D. Totals only when folded + work-phase strip
Subtotal and total day values render only when the level is folded. A folded level shows a slim strip in the Montering/Demontering colour.
- **Needs:** a conditional render on `item.collapsed` in `GroupRow`, and a `mon`/`dem` class on group cells (from the level's dimension or its rows' dominant phase).
- **Risk:** behaviour change. Entry-mode (`Σ/✎`) levels must keep showing their editable values; confirm that first.

### E. Active-date marker in the header
The date of the focused column gets an accent background in `.day-head`.
- **Needs:** pass `edit.focusCol` (or the date) into `HeadRows`, which means changing its memo dependencies.

### F. Collapsible Haller / Bemanning sections
Fold the hall calendar and the staffing lines to get more planning space, with Avvik always visible.
- **Needs:** two pieces of UI state, probably persisted to settings, plus the sticky `grid-top` height recalculated in `Kalender.tsx`.

### G. Dark mode
The Ledger tokens include a dark palette.
- **Needs:** a toggle and persistence, plus a `.dark` token block. The CSS block itself is a Phase-1-sized change, but shipping without a toggle would mean `prefers-color-scheme`, which is a product decision.

### H. Sticky work-phase legend in the "Planlegging" row
- **Needs:** a legend element in the `.col-head` row. CSS: `position:sticky; left:LEFT_W`.

---

## Out of scope
- **Row-detail right panel.** It's shown in the mockup but explicitly excluded from this redesign.
- Behov, Haller, Produkttyper and KPI screens: they inherit Phase 1 tokens, with no layout work.
