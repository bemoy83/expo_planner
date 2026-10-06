# Open items

Status as of 2026-10-04. The app covers the Kalender, the demand ledger (Behov), the hall ledger (Haller), product types and KPI, with undo, backup and a clean start from the source files. The current phase is polishing and expanding what is built, not adding new areas.

## Clean start: where it stands

Works from an empty workspace, without the planner workbook:

1. Venyou export → halls, the Kalender's period, and one project per event.
2. `Prosjekt.xlsx` (optional) → project numbers for events with a matching name; the rest are typed in on Haller.
3. Visma export → demand lines; its product types appear on Produkttyper to be given unit and competence; rates go on KPI.
4. "I plan" on Behov → rows in the Kalender per phase, hall, competence and Avd., grouped as the planner chooses.

## Deferred by the user

- **Staffing lines.** Only the base crew shows without the workbook. Adding, renaming and removing lines (Innleid, trade crews, overtime, Fravær, Admin, margin) is not built. Do not start on this until the user asks.

## Still only in the workbook

- **History for earlier years.** «Historikk Antall» and «Historikk Timer» come only with the workbook's ledger. In a clean start, earlier years exist only if older Visma exports are read in. No dedicated flow.
- **Reports.** Resultatside (budget against planned hours per project, with overhead), oppsummering (daily need against crew, with chart), status per week.
- **Budget hours.** Timebudsjett and Tabell_budsjett_arbeidstimer, which feed Resultatside.

## Gaps in what is built

Visma and demand

- Lines without a product type are given a work type one by one on Behov. No rule can do it by article number or description (for example the gangtepper lines).
- The hall rule is fixed in code: first letter of the stand, else the text in `Trans.opplysn. 1`. Department numbers (64, 65, 32) have no names. Neither is editable.
- A product type cannot be renamed in place; add the new name and delete the old.
- One count in the VVS 2026 export differs from the workbook (Fritekst Foga, avd. 65, Hall D: 2 from the export, 3 in the workbook). Not investigated.
- "Ta alle inn i plan" skips lines that give no hours, without saying how many it skipped.
- Editing a workbook line under "Egne linjer og historikk" marks it as the planner's own line from then on.

Projects and halls

- Matching an event to a project number is by exact name only. No suggestions for near matches such as "VVS 2026" and "VVS DAGENE 2026"; the user wants any such suggestions to be confirmed by hand.
- Hall ticks and project numbers are stored by event name and date. If Venyou renames an event or moves its start, the booking counts as new and the choices do not follow.
- In the hall calendar an event's name sits on the first day of the arrangement phase in the hall and scrolls away with it. The build-up days before it carry no name, and nothing tells which event a stretch belongs to once that day is out of view, other than the tooltip on each day.
- "Bare messehaller" in the Kalender is a guess: halls where at least half the bookings have build-up or tear-down periods.
- A Venyou export covers one period. Planning the next year needs a second export; this works but has only been tried with one.
- After the first import, the app's hall ticks win over the workbook's Exclude column.

Kalender

- A planning row made before rows had Hall and Avd. covers all halls and departments, and keeps the demand from being split into rows per hall. To split it, delete the row; its FTE is not moved.
- A level in entry mode (✎) shares a typed number over the rows below by their required hours. It does not look at what is already planned or at the phase, so a level holding both montering and demontering shares one day's number across both. Which levels are in entry mode is kept per browser.
- «Fold sammen» folds to the top level only; there is no "fold to level N".
- The grouping and the folded levels are kept per browser (localStorage), not in the workspace or the backup.
- Demand whose Hall/Sted names no hall on Haller is gathered under «Uavklart» until the planner picks a hall under Plassering on Behov. The choice is for the text and applies in every project; there is no choice for one line or one project only, no table listing the choices, and lines with an empty Hall/Sted cannot be placed. A hall letter with several numbered halls («Hall B» with B1–B4) is left unresolved until chosen.
- If Visma moves a line to another hall, a row already planned for the old hall stays there with no demand behind it. Rows made for several texts that are now all «Uavklart» each show the whole unresolved demand.
- After filling a range and pressing Enter, the selection collapses to one cell. Excel keeps the range.
- Selecting by dragging follows the mouse past the left and right edges but not up or down.
- The fill handle works sideways and to the right of the block's first day only: it does not copy down to other rows, and it cannot be dragged left past the start. Stretching (Alt) on several rows stretches each row by itself.
- The pencil («Fordel behov») shares in whole people, evenly, with what does not divide on the first days and the decimals on the last day. A front- or back-loaded shape and a cap at the available crew are not choices. A plain click with the pencil puts all that is left on that one day.
- A row's window is the build-up (A) or tear-down (D) days of its project in its hall; moving in and out are not counted as work days. Levels do not show a window, and a row for all halls or for «Uavklart» gets the days of all the project's halls together.
- «Foreslå plan» (✦) shares each row's demand the way the pencil does, row by row. Small rows therefore get one day with a decimal each (0,2 here, 0,6 there) instead of being gathered into whole people across rows. It does not look at the available crew.
- The eraser («Tøm») works on planning rows and levels only, not on the staffing lines.
- Notes can be written on planning cells but not on staffing cells; staffing notes from the workbook are shown only.
- A suggested row cannot carry a note or be edited until FTE is typed into it.
- With staffing details open, the top block is taller than the screen and stops being pinned.
- The banner after a Venyou import stays above every tab until closed.

General

- Undo history is lost when the page is reloaded, and a workbook import or a restore from backup cannot be undone.
- The selected project on Behov is not remembered across a reload.
- Data lives in one browser on one computer. There is no server, no sharing and no automatic backup.
- The app is run with `npm run dev`. It is not deployed anywhere.

## Technical debt

- Few component tests and no end-to-end tests: a smoke test and the grid's row component. The grid as a whole, dialogs and imports are verified by hand in a browser.
- One lint warning: a `setState` inside an effect in `Kalender.tsx` (selecting a row that was just added).
- `Kalender.tsx` is still one large component (about 1,200 lines): it holds the selection, the pencil, eraser and fill handle, the keys and the drag across the grid's edges, and lays out the page. The tool switch and the filter (`PlanTools.tsx`), the status bar (`StatusBar.tsx`) and what is drawn of the hall bookings (`useHallCalendar.ts`) are files of their own; the interaction that is left has no tests, so it is best split with tests written first. The lines of the grid are memoized components in `kalender/GridRows.tsx`, drawn again only when something on the line changed. Scrolling sideways still draws every line again each time a new day column comes into view.
- The style sheets in `src/styles/` still hold sizes and a few colours as plain values (the tooltip, the amber of a line with an issue, the frame of the fill handle) instead of tokens.
- A field edited in place in the tables (`input.inline`) looks like any other field: filled, with 7px of padding. Before the Ledger look it was a bare text that showed a frame on hover; whether the taller table rows are wanted has not been decided.
- A fill or paste of several cells in one row writes that row to IndexedDB once per cell.
- Numbers typed with a decimal comma are parsed in several places with slightly different rules (empty means 0, nothing, or invalid).
- `design_docs/` is stale and uses the misspelling "Venyoo". `docs/kalender-workbook.md` describes the workbook, not the app.
- `AllocationRow.importedHours` only has meaning for rows that came from the workbook.

## Test notes

The local-data tests need these files in `example_data/` (git-ignored):

- `Bemanning_Behov_24 måneder.xlsx`
- `utskrift_visma_21.09.26.xlsx`
- `location_format_from-2026-01-01_to-2026-12-31.xlsx`
- `Prosjekt.xlsx`, `Kpier.xlsx`, `Nøkkeltall Visma (mal) 2.0 – Kopi.xlsx`

To load a file in a browser session without a file dialog, with the dev server running:

```js
const res = await fetch('/@fs/<absolute path to repo>/example_data/' + encodeURIComponent(name))
const dt = new DataTransfer()
dt.items.add(new File([await res.blob()], name))
input.files = dt.files
input.dispatchEvent(new Event('change', { bubbles: true }))
```

`input` is the hidden file input next to the button in question. Typing into grid cells needs real key events; inline fields save on `focusout`.
