# Open items

Status as of 2026-10-23. The app covers the Kalender with its two modes, Plan and Bemanning (with its parts Faste and Innleid) and the work plans, the demand (Behov, with Visma · gjennomgang and Egen registrering), and the planner's tables in three tabs: Haller (VenYou, Prosjekter, Hallregler), Mannskap (Personell, Leverandører, Kompetanser) and Oppsett (Produkttyper, Tekstregler, Utelatte artikler), and Resultat. It has undo, backup, a shared workspace synced with Supabase, and a clean start from the source files, and is published to GitHub Pages from main (`.github/workflows/pages.yml`).

## Toward a first version

Agreed with the user 2026-10-18. The app is feature complete for a first version when the planner can plan one real season from a clean start on the Venyou, Visma and KPI files alone, get the figures of the workbook's Resultatside without opening Excel, read in an updated Venyou export without losing work, and keep the data safe on the published app. What stands in the way, most of it listed again further down:

- **Reports and budget.** Resultatside is built (2026-10-18), to be tested by the user; see «Resultatside: agreed design» in [decisions.md](decisions.md).
- **An event that Venyou renames or moves.** Nothing says so when a new export renames or moves an event that has choices or FTE. Renamed, the event finds no project by its name and has no rows until it is linked again on Prosjekter, where the old project is offered when the names are alike; the rows, demand and budget are kept by number. A tick «Skjult i Kalender» is stored by hall, name and start (`venueKey`), so it is lost on a rename or a new start. Moved, the windows follow the booking while the planned FTE, stored per date on the rows, stays on the old days outside them, to be moved by hand. Wanted: a notice of what an export changed, and planned FTE that moves with its window (inferred from the code, not tried).
- **Data that lasts.** Signed in, the workspace is shared and synced with Supabase (`docs/supabase-sync-plan.md`, phases 1 to 4 built 2026-10-21), and the app reminds the planner to download a backup a week after the last. Still open: the free plan keeps no backup of its own, the undo history is lost on reload, and the questions of data protection and the company's Microsoft tenant are the user's.
- **One season end to end.** Much that is built is marked «to be tested by the user» or checked by tests only: Bemanning, Behov, Oppsett, Innleid, the levels of detail of Plan, competences that follow a product type. A walk through a real season on the real files, in the order of a clean start, has not been done.

Not needed for a first version: oppsummering and status per week, history for earlier years (wanted later, for comparing a project year over year), moving a whole span, a «Foreslå plan» that gathers into whole people or looks at the crew, sending orders to suppliers, trade crews and Admin (deferred by the user), a staff register import, notes on staffing lines.

## Clean start: where it stands

The app starts from an empty workspace and the source files. It does not read the planner workbook: the import was removed 2026-10-08, with the staffing lines typed in by hand that only the workbook filled, and a backup made from a workbook import is refused on restore. The steps of a clean start:

1. Venyou export → halls, the Kalender's period, and one project per event.
2. Prosjekter → a project for each event without one: the suggested number, or the number it has in Visma. `Prosjekt.xlsx` (optional) can be read in there once with «Importer fra fil».
3. Visma export → demand lines; its product types appear on KPI to be given unit, competence and rates. `Kpier.xlsx` (optional) fills them in; the unit in use is chosen by hand for a product type with several.
4. Behov → a Visma line that gives hours and has a hall counts by itself, unless it is left out; the demand becomes rows in the Kalender per phase, hall, competence and Avd., grouped as the planner chooses.

## Built, to be tested by the user

What was built in each part, where the designs and the app disagreed and what was chosen, is in [decisions.md](decisions.md) (moved there 2026-10-23). The open points of each stay below.

- [Bemanning: a mode of the Kalender, to be tested by the user](decisions.md#bemanning-a-mode-of-the-kalender-to-be-tested-by-the-user)
- [Behov redesign: built, to be tested by the user](decisions.md#behov-redesign-built-to-be-tested-by-the-user)
- [Oppsett redesign: built, to be tested by the user](decisions.md#oppsett-redesign-built-to-be-tested-by-the-user)
- [Haller and Mannskap redesign: merged](decisions.md#haller-and-mannskap-redesign-merged)
- [Innleid: built, to be tested by the user](decisions.md#innleid-built-to-be-tested-by-the-user)
- [Resultatside: agreed design](decisions.md#resultatside-agreed-design)
- [Resultat redesign: built, to be tested by the user](decisions.md#resultat-redesign-built-to-be-tested-by-the-user)
- [Behov v2, the table as a card: built, to be tested by the user](decisions.md#behov-v2-the-table-as-a-card-built-to-be-tested-by-the-user)
- [Project tagging, places and work plans: built, to be tested by the user](decisions.md#project-tagging-places-and-work-plans-built-to-be-tested-by-the-user)
- [Spans in the plan: their ends are pulled, to be tested by the user](decisions.md#spans-in-the-plan-their-ends-are-pulled-to-be-tested-by-the-user)

## Staffing lines: begun

- **Fravær is in.** The absence entered in Bemanning shows in the Kalender's Bemanning section as the line «Fravær faste (FTE)», worked out per day (`absenceFte` in `domain/staffing/time.ts`: a whole day away is 1, a part of the day its share of the normal day, on workdays only), and is subtracted from «Tilgjengelig». It is read-only in the Kalender.
- **Overtime is in.** The overtime drawn in Bemanning shows as «Overtid faste (FTE)» (`overtimeByDay` and `overtimeLine` in `domain/staffing/time.ts`: hours outside the normal day, and every paid hour on a weekend or holiday, divided by the hours of an FTE-day) and is added to «Tilgjengelig». Read-only in the Kalender.
- **Innleid is in (2026-10-13).** The confirmed orders of Bemanning · Innleid show as «Innleid (FTE)» and are added to «Tilgjengelig»; see «Innleid: begun». Read-only in the Kalender.
- **Deferred by the user (2026-10-07): the lines typed in by hand** (Innleid, trade crews, Admin, margin). The workbook was their only source; with its import gone, their storage and editing in the Kalender are removed too. Do not build them again. The user will design another system for hired crew, like Bemanning but for innleid: in his words it is basically every competence demand that is not met after the permanent staff are assigned. His design is `design_docs/innleid/`, built and merged 2026-10-13. Trade crews, Admin and margin are still not built.

## What the workbook has and the app does not

- **History for earlier years.** The workbook's ledger has «Historikk Antall» and «Historikk Timer», and its Resultatside has «Historikk arbeidstimer», which are the actual timesheet hours of an earlier year, typed in its budget file. In the app, earlier years exist only if older Visma exports are read in, and there is no dedicated flow. The user wants history for comparing a project year over year, but not in the first version (2026-10-18).
- **Reports.** Oppsummering (daily need against crew, with chart), status per week.

## Gaps in what is built

Visma and demand

- When a product type is given another competence on KPI, the rows already planned for its lines move to the new competence with their FTE, in the same undo step (`followCompetence` in `domain/plannedRows.ts`). A row stays where it is when it still has demand under the old competence, when its lines went to two competences, or when the new place is already planned by another row; its FTE is then moved by hand. When the old competence is then named by nothing but people (no product type, demand line or planning row), it is replaced for them too: the people who had it get the new one, their blocks and moved hours follow, and the new one takes over its colour and place (`supersededCompetences` and `replaceCompetence` in `domain/competences.ts`). The planner's own lines do not follow, and while one of them still names the old competence, the people keep it. Checked by tests only, not yet by hand in the browser.
- Behov with no project chosen («Alle prosjekter» in the rail) lists the Visma lines of every project, with the project named on each line. The filter «Trenger avklaring · Med · Utelatt · Alle» works there and inside a project. The list shows at most 400 lines at a time (`LIST_LIMIT` in `VismaView.tsx`); the bar for the lines selected acts on those selected.
- Lines without a product type are given a work type on Behov, one by one or in «Avklar», where the type can be remembered for the article text (2026-10-14). An article number can be left out of the demand altogether (Utelatte artikler, 2026-10-15), but there is no rule that gives a type by article number.
- The Hall/Sted text of a Visma line is fixed in the reader (`vismaHall`): «Hall» and the first letter of the stand, else the text in `Trans.opplysn. 1`. Hallregler places that text in a hall; the reading of it is not editable. Department numbers (64, 65, 32) have no names.
- A product type cannot be renamed in place on Produkttyper; add the new name and delete the old.
- One count in the VVS 2026 export differs from the workbook (Fritekst Foga, avd. 65, Hall D: 2 from the export, 3 in the workbook). Not investigated.

Projects and halls

- An event is matched to a project by its name and year. A near match («VVS 2026» and «VVS DAGENE 2026») is offered on Prosjekter and taken by hand, as the user wants; it is never taken by itself.
- An event is linked to its project by name, and a hidden booking is kept by hall, name and start; what a rename or a move does is under «Toward a first version».
- Areas and «Steder» (2026-10-10): the planner gathers halls in areas on Hallregler («Områder», the fourth sheet of the Hallregler file), and ticks areas and halls under «Steder» in the page header of both modes. It replaced «Bare messehaller / Vis alle», a guess from the bookings. A project is left out when it has bookings and none of them in a ticked hall, whole: one with a booking in a ticked hall shows all its rows. Its FTE is then out of the staffing lines' need and of Bemanning's demand too; hours already assigned to people are not tied to a project and still count. Under the tree are the statuses of Venyou found in the bookings («Status i VenYou»): the bookings of an unticked status are out of the hall calendar and of the rows' windows, and a project whose bookings all have such a status is left out like one in unticked halls. A status that is new in an export shows by itself. The column filters of the VenYou tab filter that table only. What is unticked is kept per browser by name, so an area that is renamed shows again. Until an area is made the tree is a flat list of halls. Checked in the browser on a clean start with the Venyou file: an area made on Hallregler, the tree, a whole area and single halls unticked, the hall calendar and the project lines following, and the button in Bemanning; the one status of the example export unticked and ticked again. Not checked by hand: an export with several statuses (by test only), the need and Bemanning's demand with FTE planned (the rule has a test, `areas.test.ts`), and the Områder sheet in Excel (by test only).
- A Venyou export covers one period. Planning the next year needs a second export; this works but has only been tried with one.

Kalender

- A planning row made before rows had Hall and Avd. covers all halls and departments, and keeps the demand from being split into rows per hall. To split it, delete the row; its FTE is not moved.
- A folded level below a project takes numbers itself, with no switch (2026-10-17). A number typed there is shared by required hours over its rows that can be worked that day (`spreadOpen` in `domain/spread.ts`); it does not look at what is already planned. Since Prosjekt and Arbeidsfase are always the first two levels, such a level never holds both montering and demontering.
- The level of detail is picked in the planning bar (1, 2, 3 … or «Alle», 2026-10-17); a chevron still folds one branch. To be tested by the user.
- The grouping and the folded levels are kept per browser (localStorage), not in the workspace or the backup.
- Demand whose Hall/Sted names no hall or place is gathered under «Mangler hall» until the planner picks a place under Plassering on Behov, or makes a rule on Hallregler. A choice is for the text in every project, or for one project; there is none for a single line.
- If Visma moves a line to another hall, a row already planned for the old hall stays there with no demand behind it. «Rader uten behov» under Filter lists such rows, in the whole period; they are moved or deleted by hand, one at a time. Rows made for several texts that are now all «Mangler hall» each show the whole unresolved demand.
- Selecting by dragging follows the mouse past the left and right edges but not up or down.
- The pencil («Fordel behov») shares in whole people, evenly, with what does not divide on the first days and the decimals on the last day. A front- or back-loaded shape and a cap at the available crew are not choices. A plain click with the pencil puts all that is left on that one day.
- A row's window is the build-up (A) or tear-down (D) days of its project in its hall; moving in and out are not counted as work days. A folded level shows the window of its rows together (`levelWindows`), and a row for all halls or for «Mangler hall» gets the days of all the project's halls together.
- «Foreslå plan» (✦) shares each row's demand the way the pencil does, row by row. Small rows therefore get one day with a decimal each (0,2 here, 0,6 there) instead of being gathered into whole people across rows. It does not look at the available crew.
- Notes can be written on planning cells; the staffing lines have none.
- A suggested row cannot carry a note or be edited until FTE is typed into it.
- With the hall calendar and the staffing details both open on a laptop screen, the pinned top block leaves the planning rows about three lines. The user accepts this and will redesign if a way of working needs all of it open at once. With many halls ticked under «Steder» the block can be taller than the grid; the staffing lines then slide in under the hall calendar, and after them the upper halls under the date header.
- Only the line of a top level stays in view while its lines scroll past; the levels under it scroll away with their rows. A click on an event's bar in the hall calendar finds the project only among the lines that are shown: not when the filter hides it or the levels above it are folded.
- The banner after a Venyou import stays above every tab until closed.

General

- Personell and Kompetanser are exported and imported as files too (2026-10-10), on the code of the KPI file. Personell (`import/personellFile.ts`): a row per person with Navn, Notat and a column per competence, marked with x («Aktiv» went with the flag, 2026-10-15). People are matched by name, so two people cannot have the same name; what a file has no column for is kept; «Erstatt alt» removes the people the file lacks, with their blocks and absence, and the dialog says how many. A column the app does not know is a new competence. Kompetanser (`import/kompetanserFile.ts`): Kompetanse, Kort and Farge, in the planner's order; the file's rows come first, in its order; a name the app does not know is a new competence, since a file cannot rename one.
- A competence has one name (2026-10-10). The «Navn» on Kompetanser used to change only how it was shown, while KPI, Behov and the planning rows kept their text. A name changed there is now changed everywhere, as one undo step (`renameCompetence`), and the name of another competence is refused. A workspace or backup stored with a competence shown under another name gets that name everywhere when it is loaded (`withOneCompetenceName`), and is stored again at once. Checked in the browser: a rename reaching KPI and the people, a refused name, the three files out and back, merge, «Erstatt alt» on Personell, and undo of all of it. Not checked by hand: a rename with demand lines, planning rows and blocks in Bemanning (tests only), the update on load of a workspace stored with two names (tests only), and the files in Excel itself.
- The KPI table is exported and imported as a file (2026-10-10), from «Fil» on Oppsett: a row per product type and unit with the columns Produkttype, Enhet, I bruk, Kompetanse, Montering and Demontering (`import/kpiFile.ts`), and the excluded article numbers on a sheet of their own. A file with an «I bruk» column decides the unit in use; one without, as `Kpier.xlsx`, leaves the planner's choice. Names are matched with or without the number and brackets of Visma. `Kpier.xlsx` is no longer needed. Not checked: opening the file in Excel itself, and «Erstatt alt» by hand.
- A product type is known by its name alone (2026-10-10): «FOGA-vegger», and «5999 Diverse» for what Visma writes as «1 [5999 [Diverse]]». The Visma reader takes the name out of «Produkttype 2» (`vismaProductType` in `import/vismaExport.ts`), and the KPI table, its file, the rates and the demand lines hold the name, matched whatever its case (`productTypeKey` in `domain/kpi.ts`). `Kpier.xlsx`, which names the types as Visma does, is read the same way. The Visma text is no longer shown as a tooltip on KPI.
- Cleanup after the day's reversals (2026-10-10): the Hall/Sted of a Visma line is worked out in the reader (`vismaHall`); the hall rules are one stored record with the examples written in once, with the first halls from Venyou; the five table files share one reading flow (`ui/useTableFile.ts`) and one diff (`domain/tableDiff.ts`); the event year of a demand line, which nothing read, is gone; and so are the migrations for data stored earlier, since the planner starts clean. A backup made before this day does not restore correctly.
- The product types (Oppsett › Produkttyper since 2026-10-15) hold per type and unit the unit in use, the competence, the rates and what the type lacks. The Nøkkeltall workbook is not read. A type with several units has none in use until the planner chooses, and its lines give no hours until then; a chosen unit is kept when the file is read again, for as long as it has rates (`keepChosenUnits`). Renaming a unit is checked by tests only.
- VenYou (2026-10-15): events by the month they start, their halls as buttons, the phases in the plan's colours, and «Alle · Mangler prosjekt · Skjult i Kalender». The project number is read from Prosjekter, not typed here.
- Prosjekter (2026-10-10): the project table is edited in the app, a row per project with the names it goes by, and is exported and imported as a file with a row per name (`import/prosjekterFile.ts`). An event is matched by name and year, so a name that comes back every year gets the number of its own year; the year is that of the number's first two digits unless another is set. Numbers typed on the events by earlier versions (`eventLinks`) are read into the table when the data is loaded (`withEventLinksAsProjects`). Checked by hand in the browser with the real files: suggested numbers one by one and for all, a name several projects carry, another number, another name, another year, undo, and the merge dialog. Not checked by hand: the export button's file (by test only), and rows and demand lines following a number (by test only). An event without a project is offered the project it is like before a number of its own: a name alike enough (`ALIKE`) in the same year, unless that project has an event on other days, or a name that holds the other (`WITHIN`) where the project has an event on the same days. With the real files that gives 21 offers among 85 events, read through by hand and all sound; the offers were taken one by one and all at once in the browser. A number from orders taking over from a made-up one (`withNumberTakingOver`) is checked by test only.
- `DataTable` (`ui/DataTable.tsx`, columns as `Column` in `ui/useTable.ts`, with sorting and Excel-like column filters) draws the Visma view of Behov, Tekstregler and Utelatte artikler. The tabs of tables draw their rows on `.op-table` in `register.css`, with a search and a filter switch, and Uplassert on Hallregler takes column filters from `useTable`. The filters and the sorting last while the tab is open; they are not stored. The Visma lines are checked by the component test only (`DataTable.test.tsx`).
- Undo history is lost when the page is reloaded, and a restore from backup cannot be undone. In a shared workspace a planner undoes their own steps only (`store/history.ts`).
- The selected project on Behov is not remembered across a reload.
- Not signed in, data lives in one browser on one computer. Signed in, a shared workspace is kept in a database of its own in the browser and synced with Supabase; there is no server of our own and no automatic backup beyond the weekly reminder.
- The app is published to GitHub Pages on each push to main (`.github/workflows/pages.yml`, 2026-10-11), with a relative base. Each browser that opens it has its own empty workspace until it is signed in.

## Technical debt

- No end-to-end tests. The Kalender's Plan and Bemanning have component tests that drive the page through the real store on a fake IndexedDB (`kalender/Kalender.test.tsx`, `bemanning/Bemanning.test.tsx`, 2026-10-23): clicks, keys, typing, range fills as one undo step, copy and paste, the eraser, pulled ends, a folded level, the brush, moves, Escape and the switches between the modes. The store has tests of its own (`store/workspaceStore.test.tsx`, 2026-10-23): undo and redo, one step per event, changes from elsewhere, and a failed write tried again. Innleid, the dialogs and the imports are verified by hand in a browser.
- `Kalender.tsx` (470 lines) and `bemanning/BemanningScope.tsx` (240 lines) were split into hooks on 2026-10-23, with no change of behaviour; see «How it fits together» in CLAUDE.md. What is left in `Kalender.tsx` is mostly the page's markup: the head, the top block, the planning bar and the panels of the three views. The lines of the grid are memoized components in `kalender/GridRows.tsx`, drawn again only when something on the line changed. Scrolling sideways still draws every line again each time a new day column comes into view.
- The style sheets in `src/styles/` name every colour and every text size in `tokens.css`. Still plain values: the 15 px figures of the header and of Bemanning's demand strip, corner radii, and the dark shadow of the row details. The three figures side by side and the thin bar under them are one set of rules in `base.css` (`.stats`, `.bar`), used by the row details and by Bemanning.
- Numbers typed with a decimal comma are read by one parser (`domain/numbers.ts`), but what an empty field means still differs by place: 0 in the tables and for the crew, nothing in a demand line, invalid for the hours of a day and for hours to move.
- `docs/kalender-workbook.md` describes the workbook, which the app does not read.
- Done on 2026-10-23, second round: the sync engine's runs have tests (`sync/engine.test.ts`), and a row read from the shared copy is taken in only with a known kind and a value of that kind's shape (`remoteRecord`, `fitsKind` in `store/records.ts`); the matching of Prosjekter is worked out apart from its counts (`matchProjects`, `withProjectCounts`), once per Venyou, table and known numbers; the names of days and months come from one list each (`domain/dates.ts`), and figures, hours and times of day are written by `ui/format.ts`; the table readers share `cell`, `column`, `firstSheetWith` and `FileFormatError`; V, B and T are in `ui/toolKeys.ts`; the cloud's remembered workspace is a preference; the staffing fixture is in `src/test/`; the pure tests run without jsdom; `kalender.css` has no `!important` (the red days' tint is `--holiday-tint`), and the sizes and times both the code and the style sheets need are written in the code and handed to them as variables (`ui/cssVars.ts`: `--left-w`, `--panel-w`, `--day-inset`, `--leave-ms`), checked against 44 screenshots of the demo season that are the same to the pixel. The `color-mix()` outside `tokens.css` were looked through: a mix used twice for one thing became a token (`--bar-ink`, `--attention-ring`), and the others stay where they are by the rule in CLAUDE.md (60 screenshots, the same to the pixel). `PlacingPanel.tsx` keeps its own frame: it is a column beside Hallregler, open while the page is, not a panel that slides in and closes, which is what `SidePanel` is.
- Left from the survey of 2026-10-23 (the memo bugs, a retry of failed writes, tests of the store, the caches of `okAssignments` and of blocks and absence by person and day, plurals through `count`, the date header's heights, `pushTo` for maps of lists, and `export` dropped from 109 declarations no other file uses were done then, and `domain/staffing.ts` was split into `domain/staffing/` the same day):
  - Each mode guards its keys itself (modifiers, typing, Escape, an open popover): Plan in `kalender/useToolKeys.ts`, Bemanning in `bemanning/useBemanningKeys.ts` (in the capture phase), Innleid in `innleid/InnleidScope.tsx`. Their rules differ where the modes do; only the tool keys are shared (`ui/toolKeys.ts`).

## Test notes

Testing is on the invented season (`src/demo/demoData.ts`); `npm run demo-data` writes its files to `demo_data/`, to read in one by one: the Venyou export, KPI under Oppsett, then the Visma export, Kompetanser, Personell and Leverandører under Mannskap, and the budgets under Resultat.

The tests against the real files are deleted (2026-10-19); the planner keeps those files outside the project.

- `utskrift_visma_21.09.26.xlsx`
- `location_format_from-2026-01-01_to-2026-12-31.xlsx`
- `Prosjekt.xlsx`, `Kpier.xlsx`

To load a file in a browser session without a file dialog, with the dev server running:

```js
const res = await fetch('/@fs/<absolute path to repo>/demo_data/' + encodeURIComponent(name))
const dt = new DataTransfer()
dt.items.add(new File([await res.blob()], name))
input.files = dt.files
input.dispatchEvent(new Event('change', { bubbles: true }))
```

`input` is the hidden file input next to the button in question. Typing into grid cells needs real key events; inline fields save on `focusout`.
