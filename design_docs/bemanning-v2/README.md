# Handoff: Plan — Kalender and Bemanning merged on one timeline (v2)

**Place this package in the repo at `design_docs/bemanning-v2/`.**

## The scope, in one sentence

**Merge the two workspaces, Kalender's demand plan and Bemanning, into one Plan surface with a shared timeline.** The header (dates and project context) is the fixed anchor; the rows below switch between distributing demand (**Plan**) and allocating people to meet it (**Bemanning**). Bemanning is no longer a tab and no longer limited to one week.

v1 Bemanning is **built** (`src/ui/bemanning/`, `src/domain/staffing.ts`, tables in database version 3). v2 is a **migration**: reuse the domain and store, move the UI into Kalender, remove the old tab. Where this package is silent, keep the app's current behaviour.

## What the merge means

1. **One surface, two modes.** «Plan · Bemanning» toggle first in Kalender's plan bar. («Plan», because «Behov» is the demand-ledger tab.)
2. **Plan mode is Kalender as it is today.** The toggle is the only addition.
3. **Shared timeline.** Same day columns, scroll container and date header; one focus day (`planningFocus`) for both modes.
4. **The header adapts.** In Bemanning, halls collapse into **one line per project in view** (phase colours, halls in the label), and the capacity lines become **competence demand rows**, summed across projects. Both have a Detalj/Kompakt density.
5. **Rows swap**: Kalender rows ↔ person rows.
6. **Zoom is tied to mode** and the switch animates (460 ms).
7. **Continuous allocation** over the whole Kalender range; weekly figures are derived per ISO week.

## In scope for v2

- Mode toggle, tied zoom, animated switch, focus day across modes.
- Bemanning header: Prosjekter in view (fixed height, foldable, Detalj/Kompakt), Kompetanse rows (summed, always visible, Detalj/Kompakt, v1 «Uten behov» folding).
- Person rows; painting (fills free time only) and erasing.
- **Drag and drop a day's blocks to another day or person** in folded rows (R38).
- Unfolded person: inline hours on a vertical 05:00–22:00 track in every day column.
- **Moved hours (carry)**: kept, from v1's day popover, opened from a demand cell.
- **Person panel** (one view): overtime and absence per person; the absence form moves from v1's modal into the panel (date ranges).
- Copy and paste; overtime-limit flag; right-click menu.

## Removed from the app

- The Bemanning tab, its week picker, and the week editor.

## Decisions from the proofread (2026-10-08)

1. Mode label «Plan · Bemanning».
2. Innleid is out of this redesign; the user will design hired staff himself (docs/TODO.md). Kalender keeps «Faste», «Fravær faste», «Overtid faste».
3. Absence is entered as a **date range** in the Person panel (replacing `AbsenceDialog`); stored as one record per day as today. Absence brushes are a later option.
4. Moved hours stay; drag and drop of blocks between days is added.
5. Unresolved blocks keep the app's rule (`openUnresolved`, faint trace once covered).
6. The focus day stays, marked in the date header only; **no tint** of the workspace columns.
7. Bemanning tab and week editor are removed.
8. Package path `design_docs/bemanning-v2/`.

## Deferred (do not build; see `DEFERRED.md`)

Side-panel views other than Person; per-project demand scope and project tagging; the Plan-mode row inspector's Bemanning section; the expand toggle; Innleid; a weekly work-plan handout (not designed).

The mockup matches v2: deferred features are switched off (`PS_V2 = true` at the top of `mockup/Plan.html`; set it to `false` to see the deferred designs). Mockup simplifications: the absence form has no part-of-day field, and moved hours are kept in memory only.

## Read in this order

1. `README.md` (this file).
2. `UI.md`: the Plan surface.
3. `RULES.md`: v1 rules kept or changed, new rules.
4. `DOMAIN.md`: no schema change; how ranges and prefs work.
5. `ACCEPTANCE.md`: checks.
6. `PHASES.md`: build order from the built v1.
7. `DEFERRED.md`: designs kept for later.
8. `mockup/Plan.html` (or offline `mockup/Plan-standalone.html`): clickable reference. Not production code.

## Design decisions

1. **Header as anchor**: time and project context visible in both modes.
2. **Competence rows are always visible** in Bemanning; only their density changes.
3. **Hours are edited inline** in the unfolded row; overtime fits without compression.
4. **Selection without outlined boxes**: tinted fill (default) or raised neutral (pref); the only outline is the selected-block ring.
5. **Block labels show the full competence name**, no hours; short label when it does not fit.
6. **Absence uses one hatch** (2,5 px lines, 8 px pitch). Sick is red; holiday, course and other are neutral.

## Open questions

1. Should Kompakt be the default density? Revisit after real use.
2. The page check flags small text overlaps in Plan mode («3 ⟷ 12», «Fordel»); not yet compared with the app.
