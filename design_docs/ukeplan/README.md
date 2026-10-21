# Week plan, day plan and where the work is

A proposal, not yet agreed and not built (2026-10-21). `proposal.html` holds the sketches, on the demo season (week 44, Spillfestivalen 2026 built up in B1–B4), and the open decisions; the same page is published as the artifact «Ukeplan og dagsplan».

## The three printouts

- **Felles ukeplan** – A4 landscape, Monday to Sunday, no names: a line per competence with each day's target in people (hours ÷ normal day, rounded up) and hours, marked where hours are short or orders wait. The project phases over the days, sums split in permanent and hired.
- **Ukeplan per montør** – A4 portrait, a sheet per person: each day's blocks on a small time track (06–21), the competence, overtime, absence, and the hours of the week.
- **Dagsplan** – one page per day, read-only, opened from a date in Bemanning: the teams per competence with their people and times, the hired crew per supplier with its answer, coverage against the demand, who is away and who has no block.

## Where

A block (`Assignment`) has no project or hall: the fields exist in the type and are never set, and project tagging was deferred in `bemanning-v2/DEFERRED.md`. The planner's idea: pick a project in Bemanning among those in view (`projectsInView`), the demand follows the pick, and the competence is painted as before; each project then gets an account of hours (Behov → Tildelt → Gjenstår, later Utført) that the blocks write to. The proposal weighs three ways to tag a block: an active project (A), tagging by itself where only one project in view needs the competence that day (B), and the demand split per project under each competence, with the line in focus as the brush (C). Suggested: B as the rule and C to see where hours are short; project first, hall later.

Carrying the rest of a day (`carry` in `staffing.ts`, `DemandAdjustment`) is per competence today; with tagging it would carry within the project.
