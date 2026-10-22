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
