# Open items

Status as of 2026-10-04. The app covers the Kalender, the demand ledger (Behov), the hall ledger (Haller), product types and KPI, with undo, backup and a clean start from the source files. The current phase is polishing and expanding what is built, not adding new areas.

## Clean start: where it stands

Works from an empty workspace, without the planner workbook:

1. Venyou export → halls, the Kalender's period, and one project per event.
2. `Prosjekt.xlsx` (optional) → project numbers for events with a matching name; the rest are typed in on Haller.
3. Visma export → demand lines; its product types appear on Produkttyper to be given unit and competence; rates go on KPI.
4. "I plan" on Behov → rows in the Kalender per competence and phase.

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
- "Bare messehaller" in the Kalender is a guess: halls where at least half the bookings have build-up or tear-down periods.
- A Venyou export covers one period. Planning the next year needs a second export; this works but has only been tried with one.
- After the first import, the app's hall ticks win over the workbook's Exclude column.

Kalender

- After filling a range and pressing Enter, the selection collapses to one cell. Excel keeps the range.
- No drag-fill, and no selecting by dragging; only Shift+click and Shift+arrows.
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

- No component or end-to-end tests beyond a smoke test. The grid, dialogs and imports are verified by hand in a browser.
- One lint warning: a `setState` inside an effect in `Kalender.tsx` (selecting a row that was just added).
- `Kalender.tsx` is one large component (about 830 lines).
- Recalculating Visma lines runs once per toggled line; "Ta alle inn i plan" does it for every line in turn.
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
