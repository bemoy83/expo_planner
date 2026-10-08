# Expo Planner

A browser app for planning crew for exhibition build-up (montering) and tear-down (demontering). It replaces the planner's Excel workbook (`Bemanning_Behov_24 måneder.xlsx`), which it does not read: the app stands on the source exports alone. The workbook was the model for the rules and the test data while the app was built.

Open work is listed in [docs/TODO.md](docs/TODO.md). How the old workbook works is described in [docs/kalender-workbook.md](docs/kalender-workbook.md). The files in `design_docs/` come from an abandoned earlier attempt; read them for background only, they are not requirements.

## Commands

```bash
npm run dev     # dev server
npm test        # Vitest, all tests
npm run build   # type check (tsc -b) + production build
npm run lint    # oxlint
```

Run `npx tsc -b` after edits; tests are type-checked through `tsconfig.test.json`, not by Vitest.

## What the app does

Six tabs, all in Norwegian:

- **Kalender** – the planning workspace. Date header, hall calendar and staffing totals are pinned above the planning rows, and right above the rows sits the planning bar with the tools (`kalender/PlanBar.tsx`): Velg, Fordel behov and Tøm (keys V, F, T; Shift-drag and Alt-drag give the pencil and the eraser for one stroke), filter, grouping and zoom. A right-click on a planning cell opens a menu for the cell and its row, and the panel toggle in the page header slides row details in over the grid (`kalender/RowInspector.tsx`). The Avvik line is a heat map (`kalender/heat.ts`), switched off under Innstillinger. The rows form a hierarchy the planner arranges («Grupper etter»: Prosjekt, Arbeidsfase, Hall/Sted, Kompetanse, Avd., in any order); FTE per day is stored on the rows and every level above sums. A level can be switched from Σ to entry (✎): a number typed there is shared out over its rows by required hours (`domain/spread.ts`). The selection has a fill handle as in Excel: drag to copy the block over more days, Alt-drag to stretch its sum over them. The pencil («Fordel behov») shares what is left of a line's demand over the working days drawn across. Each row shows its window, the build-up or tear-down days of its project in its hall (`domain/windows.ts`), and ✦ («Foreslå plan») fills rows over their windows. A click on a project's name brings its days into view, in narrower columns if they do not fit (`fitSpan` in `kalender/layout.ts`), and keeps its halls and bars lit in the hall calendar until it is clicked again or Escape is pressed. The line of a top level stays at the top of the rows while the lines under it scroll past (`levelSections` in `kalender/rows.ts`), and a click on an event's bar in the hall calendar scrolls the rows to its project.
  The Kalender has two modes, switched first in the planning bar: **Plan**, the rows above, and **Bemanning**, who does the work: the permanent staff by name against the hours that remain per competence and day, over the whole period. In Bemanning the date header stays, the hall calendar becomes one line per project in view (`bemanning/ProjectLines.tsx`, `projectsInView.ts`), the staffing lines become the demand per competence, read from the planned FTE (`DemandRows.tsx`), and the rows become the people (`PeopleRows.tsx`). The switch zooms between the two column widths (`kalender/zoom.ts`, `useModeZoom.ts`). A competence in focus is also the brush: it fills free time only, whole days or half, one person's hours open as a track of time per day with overtime (`UnfoldedPerson.tsx`, `TimeTrack.tsx`), and sickness gives a person's hours back to the demand. With Velg, a day's blocks are dragged to another day or person, and selected days are copied and pasted. A click on a name opens the Person panel (`PersonPanel.tsx`): overtime per week against a limit, and absence entered as periods. What the parts of the mode share is held by `BemanningScope.tsx`, so the grid is not drawn again when the pointer moves over the people. Designed in `design_docs/bemanning-v2/`, on the rules of `design_docs/bemanning/RULES.md`.
- **Behov** – the demand ledger per project: Visma lines, the planner's own lines and earlier years. "I plan" takes a Visma line into the demand that is planned with («Planlagt»).
- **Haller** – every hall booking from Venyou, with a tick for whether it shows in the Kalender, and the project number per event.
- **Produkttyper** – how each Visma product type is read: unit and competence.
- **KPI** – rates (units per person-hour) for montering and demontering.
- **Personell** – the permanent staff with their competences, and how each competence is shown (name, short name, colour, order).

Sources read from files: the Venyou export (`location_format_from-…_to-….xlsx`), Visma exports (`utskrift_visma_….xlsx`), and optionally `Prosjekt.xlsx`, `Kpier.xlsx` and `Nøkkeltall Visma …xlsx` as one-time shortcuts.

## How it fits together

- `src/domain/` – pure logic, no React and no storage. Start here.
  - `types.ts` – the `Workspace` and its records.
  - `visma.ts` – Visma booking lines → demand lines. One line per project × Avdeling × work type × hall; hours = quantity ÷ rate × (1 − Effekt). Units `ordre` and `stands` count stands; other units sum `Totalt antall`.
  - `kpi.ts` – the product-type table and the rate table, with merge/replace for imports.
  - `venue.ts`, `venueImport.ts` – the hall calendar, merging a Venyou export, hidden bookings.
  - `projects.ts` – projects are the Venyou events; the project list only matches an event name to a Visma project number.
  - `locations.ts` – places a demand line in a hall of the hall ledger: the planner's choice for that Hall/Sted text (Plassering on Behov, stored in `hallAliases`), else the hall the text names, else «Uavklart». The line keeps its own text.
  - `plannedRows.ts` – demand under «Planlagt» shows as suggested Kalender rows, one per project × phase × hall × competence × Avd. A row with no hall or Avd. covers all of them.
  - `calc.ts` – required hours per row (like the workbook's TIMER column), daily need, capacity.
  - `calendarRange.ts` – the Kalender's period follows the hall bookings.
  - `staffing.ts` – the rules of Bemanning: paid hours and overtime, when a person can work, painting and editing assignments, and the balance of demand and assigned hours per competence and day. `competences.ts` – the list of competences and their styles, and edits to people.
- `src/import/` – file readers. `xlsx.ts` is a small own reader (cached values only).
- `src/store/` – `db.ts` (Dexie/IndexedDB), `workspaceStore.tsx` (all mutations, each persisted and recorded for undo), `history.ts` (undo steps), `backup.ts`, `prefs.ts` (view preferences per browser, in localStorage).
- `src/ui/` – one folder per tab, and `bemanning/` for the Kalender's Bemanning mode. `kalender/Kalender.tsx` is a custom virtualized grid; `kalender/rows.ts` builds the row hierarchy from the chosen grouping, `kalender/strokes.ts` works out what the pencil, «Foreslå plan», the fill handle and a paste would write, and `kalender/GridRows.tsx` holds the lines of the grid as memoized components. They get the selection as plain values per line (`CellEdit`) and their handlers through `useStableActions`; keep it that way, or every line is drawn again on each scroll frame. What the tabs share is in `common.tsx` (undo buttons, message banner, merge-or-replace dialog), `files.ts`, `fields.tsx` and `ColumnHead.tsx` with `columnFilter.ts` (filters on a table's columns).
- `src/styles/` – the style sheets, imported in this order by `main.tsx`: `tokens.css` (fonts, colours and text sizes, light and dark), `base.css` (controls, the shell, menus, dialogs), `tables.css` (the ledgers of the other tabs), `kalender.css`, `inspector.css` and `bemanning.css`. Each rule is written once; do not add a later rule that overrides an earlier one, change the rule.

Everything is stored in the browser (IndexedDB database `expo-planner`). There is no server.

## Conventions

- UI text is Norwegian (bokmål). Code, comments, commit messages and docs are English.
- The venue system is called **Venyou** (venue + you). "Venyoo" in `design_docs/` is a misspelling.
- Keep source and status apart: a Visma line always stays a Visma line; the planner toggles it in or out of the plan. Decisions the planner makes (Effekt, in plan, chosen work type, chosen location, hidden halls, project numbers) are stored separately from imported data, keyed so they survive the next import.
- Reference data lives in editable tables in the app. A file import is at most an optional shortcut and must offer merge or replace when the table already has content.
- Every mutation goes through `workspaceStore.tsx`, is undoable, and is persisted. Edits made in one user action form one undo step.
- New domain logic gets a test next to it. Tests ending in "(local data)" run against the real files in `example_data/` and are skipped when those are missing.

## Data and privacy

`example_data/` and all `.xlsx` files are git-ignored: they contain real customer and booking data. Never commit them, and do not copy customer names from them into tests, docs or commit messages. Event and project names already used in tests (VVS, Hage, Oslo Motor Show) are fine.

## Checking against the real files

With `example_data/` present, the local-data tests verify the readers of the Venyou, Visma and KPI files. To try the app in a browser without file dialogs, start the dev server and load a file through Vite's `/@fs/` path into the hidden file input (see the test notes in docs/TODO.md).

## Working with the user

- Work on a branch, push it, and report. The user says "merge to main"; then fast-forward main, run the tests, push, and delete the branch locally and on GitHub.
- The user tests in a clean state: Innstillinger → "Slett alt og start på nytt", then reads the sources in one by one.
- Staffing lines: the absence from Bemanning is in the Kalender (2026-10-07). Lines typed in by hand (Innleid, trade crews, Admin) came with the workbook only and are removed with it (2026-10-08); the Kalender's staffing lines are «Faste» and the two worked out from Bemanning. A replacement is deferred: the user will design a system for hired crew like Bemanning, covering the competence demand left after the permanent staff are assigned. Do not start on either until he asks.
