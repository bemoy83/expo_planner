# Reuse map

Build from what exists. Paths are those used by earlier handoffs (`design_docs/bemanning-v2/`); confirm them in the repo. **Reuse** = use as is. **Extend** = add a variant/prop to the existing piece. **New** = nothing in the app covers it.

## Surface

| Design part | Build from | Kind |
|---|---|---|
| Mode band (header + toolbar), «Plan · Bemanning» toggle | Kalender plan bar, `planMode`, `.khdr` / `.kpbar-in` band styles | Reuse |
| «Faste · Innleid» sub-toggle | Same segmented control as the mode toggle | Extend (second toggle; hue per sub-mode only if C3 approved) |
| Day columns, date header, week label, weekend fill, today line, scroll container | Kalender grid (`KalenderGrid`, `Row`, `.kcell`, `.ktodayln`, `.khead`) at a fixed 116 px day width | Reuse |
| Section rows («Restbehov etter faste», «Leverandører») | `.ksec` section row | Reuse |
| Avvik row | Kalender `capRow(…, { avvik: true })` + `heatStyle` | Reuse (colours per C1) |
| Competence colours, dot, names | `competenceStyles`, `staffedCompetences` | Reuse |
| Rest demand per competence × day | `buildBalance` / `dayBalance` → `remaining` × hours (R10 in bemanning-v2) | Reuse |
| Undo / redo (⌘Z / ⌘⇧Z), one step per gesture | App history/undo used by Bemanning painting | Reuse |
| Brush + erase gesture (drag across day cells, ⌥-drag erases, Esc ends) | Bemanning painting tool state and drag handling | Extend (target = competence row, payload = supplier) |
| Click / drag / ⇧-click day selection, ← → move, ⇧ extends | Bemanning focus/selection handling (`planningFocus` style) | Extend (selection is a range of days on one competence) |
| Side panel shell | App inspector / panel | Reuse (slide-over only if C4) |
| Popover / menu shell, positioning | App popover/menu component | Reuse (dismissal per C5) |
| Segmented control, stepper (− n +), icon button, menu item | App UI primitives | Reuse |
| Status chip / glyph (Venter, Bekreftet) | — | **New** (small: glyph + label, see UI §6) |
| Order chip in a day cell | Bemanning block label pattern (colour fill, `--on-line` text) | Extend (count badge + supplier name) |
| Coverage bar (3 px, confirmed solid / waiting hatched) | Kompakt competence line from bemanning-v2 (solid/hatch) | Extend |
| Icons | App icon component (Lucide names listed in UI §9) | Reuse |
| Toast | App toast | Reuse |

## Domain

| Need | Build from | Kind |
|---|---|---|
| Supplier list (name, competences, shifts, rate, contact) | — | **New** entity (DOMAIN §1) |
| Order (supplier, competence, date, count, shift times, answer) | Assignment shape is the closest model | **New** entity (DOMAIN §2) |
| Shift hours (duration − 30 min break if ≥ 6 h) | `paidHours` (R1) | Reuse |
| Shift presets Dag / Kveld / Natt | App shift settings if they exist; else new constant | Reuse / New |
| Coverage per competence × day | — | **New** pure function `coverage` (RULES I1) |
| Avvik per day | Kalender `devs` pattern | Extend (RULES I2) |
| Pre-filled count, run planning, merge duplicates | — | **New** (RULES I3–I5), mirrors `mergeAdjacent` (R9) |
| Answer changes | — | **New** (RULES I6–I7) |
| Order text for copy | — | **New** (RULES I9) |
| Persistence | App store / database | **New** tables (DOMAIN §4) — needs a schema version bump; ask before migrating |
