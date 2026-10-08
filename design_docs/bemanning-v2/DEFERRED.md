# Deferred designs (not part of v2)

Kept so the design is not lost. **Do not build.** Rule numbers refer to the old v2 drafts.

## Per-project demand scope and project tagging
Clicking a project label to filter demand, «Sum / <prosjekt>» scope, auto-clear on scroll-out, tagging assignments with a project, block notes. Per-project demand needs no tags (derived from Kalender rows); when it returns, coverage stays computed against the sum since staff are shared.

   - **Clicking a project label** selects that project in the filter, switches demand scope to that project, and re-fits the columns to its window (R18, animated). Clicking the selected project again clears the filter (scope back to Sum). **When the selected project leaves the list while scrolling, the filter clears automatically** (scope back to Sum) with an info toast «<Prosjekt> er ute av utsnittet. Behovet viser igjen sum for alle prosjekter.» Allocation follows the timeline; the project only filters demand. Not during the mode-switch zoom. Labels have a hover state; tooltip «Vis behovet for <prosjekt>» / «Vis behov for alle prosjekter».

## Expand toggle
   - *(Deferred, not in v2: hiding Kompetanse leaves nothing to allocate towards; revisit only with a thin-line demand summary.)* **Expand toggle** (icon button, chevrons-down-up / chevrons-up-down, active state when on): hides the Prosjekter and Kompetanse sections entirely (section rows included) so person rows sit directly under the date header and plan bar. Click again to restore. Fold states of the sections are preserved underneath. Tooltip: «Mer plass til personell: skjul prosjekter og kompetanse» / «Vis prosjekter og kompetanse». Behov mode is unaffected.

## Plan-mode row inspector: Bemanning section (needs tagging)
### Row inspector: Bemanning section
Placed after «Fremdrift». Only shown when the row has FTE on days inside its window.
- Eyebrow «BEMANNING», right: «timer · merket <project>».
- Stats: Planlagt (Σ FTE × 7,5 on window days) · Bemannet (Σ min(plan, staffed) per day, with %) · Hull (red, «≈ N dagsverk»; ✓ «dekket» when 0).
- Table per window day with FTE: Dag · Plan · Bemannet · Hull (red / ✓ / amber «+N»). Rows are clickable.
- Button «Fyll i Bemanning» (secondary, users icon), or «Vis i Bemanning» when there is no gap.
- **Staffed** for a row and day = Σ paid hours of non-unresolved assignments with the row's competence **tagged with the row's project** (R26).
- **Jump** (button or table row, R27): sets the project filter to the row's project and demand scope to that project, switches to Bemanning fitted to the project window, selects the day, and opens the panel's Behov gap mode for the row's competence on that day (the first day with a gap for the button).


## Side-panel views other than Person
### Behov, gap mode (competence × day)
Opened by a demand cell, a header date, or the segment.
- Header: «■ Vegger», «ons 21. okt [· helg, overtid] [· project]». Actions: ‹ › previous/next day with demand, close.
- Competence chips for the day (short label + red remaining), tinted fill on the active one.
- Stats: Behov · Tildelt (%) · Gjenstår (red / ✓ / «+N overdekket», «≈ N dagsverk»).
- «Ledige med Vegger · N»: candidates ranked by R20. Each row: name, tags («7,5 t ledig · fortsetter · på Hage · overtid»), buttons «Hel dag»/«Resten» and «Halv».
- «Ikke tilgjengelig · N» (folded): name + reason (Ferie, Syk, Opptatt · VEG/TEP).

### Behov, person mode («Hvor kan Anders hjelpe?»)
Shown when the last thing touched was a person (name, cell). See R21.
- Header: title, «U41–42 · 5.–18. okt», ‹ › week, close.
- Chips: «Alle» plus the person's competences (filter).
- Stats: Ledig (normal hours) · Kan dekke (hours of shortfall) · Treff (days).
- Day list: date button (selects the day), free hours, and per short competence a split chip «■ VEG −11 | Dag | ½». The competence part jumps to gap mode for that day. Busy, absent and no-demand days are muted.

### Mannskap (crew)

> **Deferred.** Designed and present in the mockup, but not part of the v2 build. Do not implement until the user asks. Kalender's «Innleid» stays as it is today (manual).

Opened by clicking a crew row label. The segmented shows «Person» as active.
- Header: «■ Manpower · Vegger», «Innleid mannskap · teller i «Innleid» i Behov».
- Stats: Dagsverk (days) · Timer · Navngitt.
- «Per dag»: the crew's days ± one day, with remaining hours of the competence in red and a − count + stepper.
- «Gi navn»: name field + «Legg til» (R32). Lists named people from this crew; click opens their Person view.
- (Deferred) Behov gap mode also lists crews with the competence: «Manpower · 4 × på dagen · 2 til dekker» with −1 / +1.

### Blokk
- Header: «■ Vegger», «Name · tir 20. okt». Actions: show person, close.
- Fields: Tid · Timer (with «N overtid») · Kompetanse (select, the person's competences) · Prosjekt (select, «Ikke merket» + projects) · Notat (text, saved on blur/Enter).
- «Gjenta»: «Neste arbeidsdag», «Ut uka (N dager)», «Ut <project> (dates)» when tagged (R22).
- Footer: «Fjern blokk».


## Innleid (hired staff)
The user will design hired staff himself («every competence demand not met after the permanent staff are assigned», docs/TODO.md). The crew design below is superseded by that and kept only as reference. Kalender has no Innleid line (removed 2026-10-07).

### 3.9 Innleid section

> **Deferred.** Designed and present in the mockup, but not part of the v2 build. Do not implement until the user asks. Kalender's «Innleid» stays as it is today (manual).

Below the permanent staff (and below the «Uten X» group), a 30 px section row «INNLEID · N mannskap · M navngitt» with the hint «Antall per dag teller som «Innleid» i Behov · mal med kompetansen for å fylle hullet».
- **Crew rows** (40 px), one per crew (supplier × competence). Label: supplier, competence tag (swatch + name), «N dagsverk». Click opens the crew in the panel (§7, Mannskap).
  - Day cell: a full-width block in a 30 % tint of the competence colour with «4 ×» (and the competence name at ≥ 90 px). Weekends allowed.
  - Velg tool, hover: a dark − / + stepper at the right edge changes the count by one.
  - Pensel with the crew's competence: hover and drag preview «n → m ×» (ghost); release sets the count to what covers the day's remaining hours (R31). Other brushes skip crew rows («hoppes over»).
  - Erase / Alt: clears the count (dashed grey preview).
- **Named hired people** follow, as normal person rows with a small supplier pill after the name. They paint, unfold and edit exactly like permanent staff.


## Old day-selection draft
## 8. Day selection (R23)

> **Deferred** (README «Deferred»). Kept for reference; not in the v2 build.

- There is no persistent focus day while painting or dragging.
- The header date marker shows the side panel's day (gap mode), or the day last chosen by clicking a header date, a demand cell, or a person cell with the Velg tool.
- Hovering any person cell shows a **crosshair**: the date and the demand column of that day get a light ink tint. It follows drags and clears on leaving the grid.
- Week context (unfolded person's «Uke N», help mode's default range, R14 default brush) follows the **first visible workday** while scrolling.


## Deferred rules

### R16 Demand scope availability
Per-project scope is available only when a project is selected in the filter. Clearing the filter resets scope to Sum.

### R17 Assignment tagging
When a project is selected in the filter, every assignment created by painting, drawing, gap-filler or help buttons gets `projectNo` = that project. Otherwise none. The tag can be changed or cleared in the Blokk panel. Moving or resizing keeps the tag.

### R20 Gap candidates (Behov gap mode)
For competence `c`, date `d`, people with `c`:
- Excluded with a reason: absent (kind label), sick («Syk»), or `freeHours([dayStart, dayEnd)) < 0,5` («Opptatt · <their competences that day>»).
- `free` = free hours in the normal window (weekends: the same window, counted as overtime).
- `cont` = the person has `c` on `d−1` or `d+1`.
- `onProj` = a project is selected and the person has a block tagged with it in the same ISO week.
- `ot` = weekend, or week normal hours + free > week capacity.
- Score = `free × 10 + (cont ? 6 : 0) + (onProj ? 4 : 0) − (ot ? 30 : 0)`. Sort descending.
- «Hel dag» / «Resten» fills the free normal window (R6 full, extended to weekends for this action only); «Halv» uses R6 half. Shown when `free ≥ 4`.

### R21 Help list (Behov person mode)
For person `p`, a 14-day range starting on the Monday of the anchor day (selected day if any, else first visible workday). Per day:
- Weekend days with no shortage in `p`'s competences are omitted.
- Absent/sick → muted with the reason. `free < 0,5` → «Opptatt». No shortage in the (filtered) competences → «N t ledig · ikke behov».
- Otherwise list each competence of `p` with `remaining > 0`, largest first, with assign buttons (R20 semantics).
- Summary: Ledig = Σ free on workdays; Kan dekke = Σ min(free, Σ shortage); Treff = days with free ≥ 0,5 and a shortage.

### R22 Repeat a block
`repeatAssignment(ws, id, dates[])`: for each date, unless absent or sick, fills `freeIntervals([a.start, a.end))` with copies (same competence, tag, note). Then `mergeAdjacent`. One undo step. Date sets offered: next workday; remaining workdays of the ISO week; remaining workdays up to the tagged project's last phase day.

### R26 Staffed hours for a Kalender row
`staffed(row, d) = Σ paidHours(a)` for assignments with `a.competence = row.competence`, `a.projectNo = row.projectNo`, `a.date = d`, not unresolved. Untagged assignments do not count toward a row. Hull per day = `row.fte[d] × hoursPerDay − staffed`.
Note: two rows of the same project and competence (e.g. Vegger Hall B1 and B2) share the same tagged assignments; the inspector shows the project-level figure. If per-hall staffing is needed later, add `hall` to the tag.

### R27 Jump from Behov to Bemanning
`openInBemanning(row, d)`: projectFilter = row.projectNo; demandScope = 'project'; planMode = 'bemanning' with R18 fit to that project; selectedDay = d; panel = gap(row.competence, d). One navigation, no data change, not an undo step.

### R30 Crew hours in the balance
`assigned(c, d, scope)` adds `crew.counts[d] × hoursPerDay` for crews with competence `c` (with scope: only crews with `projectNo = scope`). Crew hours never have overtime; weekend counts still count as normal crew days (supplier billing is out of scope).

### R31 Paint on a crew row
For a crew with competence = brush and date `d` (not weekend): `target = current + max(0, ceil((demand − assigned) / hoursPerDay − 0,01))`. Set `counts[d] = target` when larger than current. Erase sets the count to 0. One undo step per gesture, together with any person cells in the same rectangle.

### R32 Name one from a crew
`nameFromCrew(crew, name)`: create `Person { kind: 'hired', supplier, competences: [crew.competence], fromCrew }`; for every date with `counts > 0`: decrement the count and add a full normal-day assignment (07:00–15:00) for the new person, tagged with `crew.projectNo`. Kalender «Innleid» is unchanged by this (one count becomes one named person). One undo step.

### R33 Kalender «Innleid» feed
`hiredFte(d) = Σ crews counts[d] + |{ hired persons with a non-unresolved assignment on d }|`.
