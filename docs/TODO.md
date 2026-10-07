# Open items

Status as of 2026-10-07. The app covers the Kalender, the demand ledger (Behov), Bemanning with Personell, the hall ledger (Haller), product types and KPI, with undo, backup and a clean start from the source files.

## Clean start: where it stands

Works from an empty workspace, without the planner workbook:

1. Venyou export → halls, the Kalender's period, and one project per event.
2. `Prosjekt.xlsx` (optional) → project numbers for events with a matching name; the rest are typed in on Haller.
3. Visma export → demand lines; its product types appear on Produkttyper to be given unit and competence; rates go on KPI.
4. "I plan" on Behov → rows in the Kalender per phase, hall, competence and Avd., grouped as the planner chooses.

## Bemanning: built, to be tested by the user

All seven phases of `design_docs/bemanning/` are built on the branch: storage, the rules, the Personell tab, the Bemanning tab, painting, hour editing, and sickness, absence and moved hours. Of the handoff's «Later» list, overtime is now fed into the Kalender's staffing lines. Untouched: hired staff and trade crews, automatic suggestions, tying an assignment to a Kalender row, and showing moved hours in the Kalender.

Where the code is: the types in `domain/types.ts`; the rules in `domain/staffing.ts` (R1–R15 of RULES.md, with the checks D1–D23 of ACCEPTANCE.md in `staffing.test.ts`) and `domain/competences.ts`; the tables `persons`, `unavailability`, `assignments` and `demandAdjustments` (database version 3) and competence styles in `meta`; undo through `updateStaffing` in the store; the tabs in `ui/bemanning/` and `ui/personell/`; styles in `styles/bemanning.css`.

The mockup's invented people and week 42 2026 are read by the tests only (`domain/staffingFixture.ts`, from `design_docs/bemanning/fixtures/`). The app has no way to load them; the menu item that did is removed.

Choices made where the handoff was open or disagreed with itself

- The lunch break is unpaid on weekends and holidays too, as in the mockup: Saturday 08:00–12:00 counts 3,5 hours. RULES.md's example for R2 says 4.
- A full-day paint leaves a gap that is all lunch alone, so a day painted as two half days stays two blocks.
- Hours show quarter hours in full (2,75 t); the mockup rounds to one decimal.
- The list of competences is every competence text on the product types, the demand, the planning rows and the people. With the workbook read in, that includes texts that are not competences (Estimat, Overhead, Ukjent). The demand strip of Bemanning lists only the competences an active person has, plus any other with demand or assigned hours in the week. The keys 1–9 follow the competences people have, in the order set on Personell.
- A competence's name on Personell is how it is shown; it does not rename the competence on the product types. A competence gets its colour and place when it first appears, and these are stored at the first edit of any competence.
- The day in focus is shared with the Kalender through the `planningFocus` preference: the Kalender opens on it and marks it in the date header, and the day of the cell the planner stands on becomes it.
- A holiday on a weekday keeps its wide column but is shown as a day off, like the weekend.
- The right-click menu of a day also paints a full day with one of the person's competences, and opens «Fravær …», the person's absence with a form for a stretch of days, a kind and a part of the day.
- A block whose person is away or lacks the competence never counts. It is «uløst» only while hours of its competence remain that day (`openUnresolved`). Once others cover the day, it is shown as a faint trace and is no longer counted or flagged; the user asked for this, where RULES.md R7 keeps it unresolved. If the person comes back, the block counts again and the day shows a surplus.
- «N uløste blokker · Fjern» counts and removes the open unresolved blocks of the week shown, not of every week. The faint traces are removed by hand.
- Moved hours can be taken back from the popover of the day they were moved to.
- Hours moved from a Friday land on the Saturday; the user has confirmed this.
- The Kalender's «Faste» is the number of active people on Personell (`planningSettings` in `domain/calc.ts`). The number under Innstillinger stands in only until the first person is entered. A person's absence does not lower «Faste»; it shows on its own line, «Fravær faste».
- The competence colours include an orange and an amber, and the primary buttons are orange; the user keeps them for now.

Gaps

- People are entered by hand. There is no import of a staff register, and people cannot be reordered. Absence is entered from Bemanning only, not from Personell.
- Competences that are in use cannot be hidden or removed.
- In the row timeline a block that reaches into overtime cannot be moved or resized; that is done in the week editor.
- The preview «−N» shows for collapsed days only, not while drawing in an open person.
- Reading back from IndexedDB after a reload, and every gesture in the two tabs, are checked by hand in the browser. The test environment has no IndexedDB, and there are no component tests for Bemanning beyond the folded day cell.

## Staffing lines: begun

- **Fravær is in.** The absence entered in Bemanning shows in the Kalender's Bemanning section as the line «Fravær faste (FTE)», worked out per day (`absenceFte` in `domain/staffing.ts`: a whole day away is 1, a part of the day its share of the normal day, active people on workdays only), and is subtracted from «Tilgjengelig». It is read-only in the Kalender. A workspace read from the planner workbook still has the workbook's own Fravær line; with both filled in for the same day the absence counts twice.
- **Overtime is in.** The overtime drawn in Bemanning shows as «Overtid faste (FTE)» (`overtimeByDay` and `overtimeLine` in `domain/staffing.ts`: hours outside the normal day, and every paid hour on a weekend or holiday, divided by the hours of an FTE-day) and is added to «Tilgjengelig». Read-only in the Kalender. The same warning applies as for Fravær: the workbook's own overtime lines count on top of it.
- **Not built.** Adding, renaming and removing the lines the planner types in (Innleid, trade crews, Admin, margin). Without the workbook only «Faste», «Fravær faste» and «Overtid faste» show.

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
- `Kalender.tsx` (about 770 lines) holds the selection, the cell values and the handlers the rows are given, and lays out the page. What the tools would write is worked out in `kalender/strokes.ts`, with tests; scrolling, the drag across the grid's edges and the tool keys are hooks (`useGridViewport`, `useGridDrag`, `useToolKeys`), and the top block and the planning bar are components (`TopSections.tsx`, `KalenderBar.tsx`). The hooks and the selection itself (clicks, keys, the fill handle) still have no tests and are checked by hand. The lines of the grid are memoized components in `kalender/GridRows.tsx`, drawn again only when something on the line changed. Scrolling sideways still draws every line again each time a new day column comes into view.
- The style sheets in `src/styles/` name every colour and every text size in `tokens.css`. Still plain values: the 15 px figures of the header and of Bemanning's demand strip, corner radii, and the dark shadow of the row details. The three figures side by side and the thin bar under them are one set of rules in `base.css` (`.stats`, `.bar`), used by the row details and by Bemanning.
- Numbers typed with a decimal comma are read by one parser (`domain/numbers.ts`), but what an empty field means still differs by place: 0 in the tables and for the crew, nothing in a demand line, invalid for the hours of a day and for hours to move.
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
