# Week plan, day plan and where the work is

A proposal, not yet agreed and not built (2026-10-21). `proposal.html` holds the sketches, on the demo season (week 44, Spillfestivalen 2026 built up in B1–B4), and the open decisions; the same page is published as the artifact «Ukeplan og dagsplan».

## The three printouts

- **Felles ukeplan** – A4 landscape, Monday to Sunday, no names: a line per competence with each day's target in people (hours ÷ normal day, rounded up) and hours, marked where hours are short or orders wait. The project phases over the days, sums split in permanent and hired.
- **Ukeplan per montør** – A4 portrait, a sheet per person: each day's blocks on a small time track (06–21), the competence, overtime, absence, and the hours of the week.
- **Dagsplan** – one page per day, read-only, opened from a date in Bemanning: the teams per competence with their people and times, the hired crew per supplier with its answer, coverage against the demand, who is away and who has no block.

## Where

A block (`Assignment`) has no project or hall: the fields exist in the type and are never set, and project tagging was deferred in `bemanning-v2/DEFERRED.md`. The planner's idea: pick a project in Bemanning among those in view (`projectsInView`), the demand follows the pick, and the competence is painted as before; each project then gets an account of hours (Behov → Tildelt → Gjenstår, later Utført) that the blocks write to. The proposal weighs three ways to tag a block: an active project (A), tagging by itself where only one project in view needs the competence that day (B), and the demand split per project under each competence, with the line in focus as the brush (C). Suggested: B as the rule and C to see where hours are short; project first, hall later.

**Locked as the preliminary choice: B and C (2026-10-21).** Project tagging is built on its own, independent of the printouts, since it gives Resultat staffed hours per project. Picking a competence in the demand unfolds it into a sum line and a line per project in view; the other competences shrink to a thin line with their deviation and are not hidden (so a person's other competences stay in sight). The line in focus is the brush: on a project line the block gets that project, on the sum line it gets the project by itself where only one project in view needs the competence that day (B). With no competence picked, everything is as today; Esc folds back. Tag by project first and show the project's halls; the hall on a block comes later if the crew needs it.

Carrying the rest of a day (`carry` in `staffing.ts`, `DemandAdjustment`) is per competence today; with tagging it would carry within the project.

**Answers (2026-10-21):** a block is tagged only when a project line is picked; one without stays untagged and still counts in the sum. The account stops at Gjenstår. Confirmed hire orders get a project too. Open: whether the untagged hours of a competence and day are shared out over its projects in the background, as `spreadOpen` shares FTE in the Kalender, which would replace B's tagging by itself.

## Places on the printouts (2026-10-22)

Project tagging and places on blocks are built (`buildProjectBalance`, `workPlace.ts`), so the proposal is updated: every printout says where the work is, as project and place («B», as the rows write it). A place painted on a place's line is set; any other is worked out by `blockPlaces` and marked «≈». The shared week plan has a thin line per place under a competence only where it works in two or more places that week; the fitter's sheet shows project and place per block, the largest share where a block is split; the day plan has a team per place under each competence, with the hired crew under its project's place (orders have a project, not yet a place). Open decisions are listed at the foot of `proposal.html`.

## After the review (2026-10-22)

From the review in the thread «Vurdering av ukeplan og dagsplan»: a block without a set place goes whole to one place (a new pure function beside `blockPlaces`, by largest remaining need in a fixed order), since `blockPlaces` gives every untagged block the same shares and «the largest share» would send them all to one place. «≈» marks only a place that could have been another that day (two places of a project, or two projects). «Sett stedene» stores the distribution on the blocks in one undo step before printing. The sheets count like Resultat (permanent staff and confirmed orders, whole workspace); waiting orders are shown but not counted; «Uten sted» and «Uten prosjekt» keep everyone on the sheet. The day plan is the list of fitters grouped by place and competence; the team view is kept only as an alternative. A print frame with `print.css`, always the light palette, competence names in text, up to two pages. Opened from the page header, a right-click on a day, and the Person panel.

## Week plan redrawn (2026-10-22)

The planner's design check: the day plan as a list stays; the shared week plan was a copy of Behov in Bemanning (a line per competence with hours and people) and is replaced. The week plan is now the whole picture of what happens where, for each project of the week, with no hours: a block per project (phase over the days: build-up, show days, tear-down), under it a line per place and work, a bar from the first to the last day of work labelled competence and Avd. (from the planning row), the most people on a day as a small number, and a small tag where crew is missing or an order waits, also gathered in a box under the sheet. Hours, rounding and the balance stay in Bemanning and the day plan. Open: whether the day plan should show the planning rows' notes per day.

## Decided (2026-10-22)

Two printouts only: the shared week plan and the day plan as a list. The sheet per fitter and the team view (3b) are dropped. The week plan has no numbers on its bars; the place stands in front of a line only where the project has two or more halls that week. The day plan lists the planning rows' notes for the day at the top (place and competence per note), and a fitter who splits the day over two competences stands under both with the whole day on the time track: the group's own block full, the other an empty frame. Build order: the distribution of places in the domain with tests, then the day plan and the print frame, then the week plan.

**Day plan not grouped by competence (2026-10-22):** the list is grouped by place only; the competence is on the bar, named in text. A fitter stands once per place with the whole day on the track (a split day shows both competences in one row); within a place, fitters are sorted by competence and then name, with a thin rule between competences. The coverage per competence moved to a strip above the list. A fitter whose blocks go to two places stands under both, the other place's block as an empty frame.

**Day plan: place on the bar too (2026-10-22):** the list has no groups. A fitter is one row a day, and each block of the bar carries place and competence («B · Vegger»), so a move between halls or competences is on the one bar. The places are named in a key above the list; rows are sorted by the place where the fitter starts, then competence, then name. This replaces the earlier rule that a fitter whose blocks go to two places stands under both.

**Projects on the day plan, hours out (2026-10-22):** the day plan opens with a card per project of the day (name and number, place with the halls booked, phase with day n of N and when the show opens, coverage per competence worked out for the project with `buildProjectBalance`, and the notes of its planning rows), then the list of fitters. The hours column is replaced by a project column (the name, an arrow where a fitter changes project in the day). The sheet's header counts people, not hours.

## Built (2026-10-22)

Slices 1–4 are built: `dealPlaces` and `withPlacesSet` (`domain/workPlace.ts`), the day plan (`domain/dayPlan.ts`, `ui/dagsplan/DayPlanSheet.tsx`), the week plan (`domain/weekPlan.ts`, `WeekPlanSheet.tsx`), and the dialog with print (`WorkPlanDialog.tsx`, `styles/dagsplan.css`, `styles/print.css`). Not built: a place on hire orders (a supplier's place is worked out from the project's demand and marked ≈ where the project has several), the planning rows' notes beyond the cards, and a check of the printed result in a real printer dialog.

**Week plan, one line per competence (2026-10-22):** the first build drew a bar per competence, place and department, so a competence stood several times. It is now one line per competence of a project, a bar over each stretch of days it is planned (a gap is a pause), with the departments written on it and the places only where the project has two or more halls that week.

**The day plan grouped for the start-up meeting (2c, 2026-10-22):** the list is grouped as it is read out, place then competence then people, since grouping by competence alone had broken where someone works two competences in a day. A person stands in every group they work in, with the whole day on the bar (the group's blocks full, the rest in outline) and the group's time in text; a later part of the day has a line before the name. A group counts its people as whole days, so no one is counted twice. Built in `dayPlan.ts` (`groups`) and `DayPlanSheet.tsx`; the project column and the arrow are gone, since the place's heading names the project.

**What is to be done, on the day plan (2026-10-23):** each competence of a place names its work from the demand: the two product types that give the most hours in the phase of the day, with their quantities over the whole phase, «+N til» for the rest, and «ca. N % i dag», the day's planned FTE over the phase's, which rests on the KPI rates the plan is made from (`dayWork` in `dayPlan.ts`). The planner's answers: how yesterday went needs a study of its own; hired crew stay anonymous; no new data, only the planning rows' notes; the ≈ notice on opening the day plan is the reminder to set the places.
