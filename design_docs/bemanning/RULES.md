# Rules

Pure functions in `src/domain/staffing.ts`, tested in `staffing.test.ts`. The examples use the default `WorkdaySettings` (07:00–15:00, lunch 11:00–11:30, band 06:00–21:00, snap 15) and the fixtures. Hours are decimals and are shown with a comma (`7,5`) using `formatFte`-style formatting.

Notation: times are written `hh:mm` but are `Minute` values in code.

---

## R1 `paidHours(iv: Interval, wd): number`

Duration minus its overlap with `[breakStart, breakEnd)`, divided by 60.

- 07:00–15:00 → 7,5
- 07:00–11:00 → 4
- 11:30–15:00 → 3,5
- 10:00–12:00 → 1,5
- 15:00–18:00 → 3

## R2 `overtimeHours(iv, dayKind, wd): number`

- `helg` / `helligdag`: `paidHours(iv)`, all of it.
- `arbeidsdag`: `paidHours(iv) − paidHours(iv ∩ [dayStart, dayEnd))`.

Examples (arbeidsdag): 13:00–17:00 → 2. 06:00–08:00 → 1. 08:00–14:00 → 0. Saturday 08:00–12:00 → 4.

## R3 `normalWindows(person, date, unav[], wd): Interval[]`

The person's **normal** time that day:

- not `arbeidsdag` → `[]`
- a whole-day unavailability → `[]`
- otherwise `[dayStart, dayEnd)` minus every partial unavailability

Example: «Går 12:00» (unavailable 12:00–15:00) → `[07:00–12:00]`.

## R4 `editableWindows(person, date, unav[], wd): Interval[]`

Where the **week editor** may place blocks:

- a whole-day unavailability → `[]`
- a partial unavailability → `normalWindows` (no overtime around partial days in MVP)
- otherwise `[overtimeEarliest, overtimeLatest)`, which includes weekends and holidays

## R5 `freeIntervals(windows, assignments): Interval[]`

The windows minus the person's assignments that day. Gaps shorter than `snap` are dropped. Sorted.

`freeHours(...) = Σ paidHours(freeIntervals)`.

## R6 Painting a day: `paintDays(ws, cells[], competence, opts): Assignment[] (new state)`

`opts = { span: 'full' | 'half', mode: 'fill' | 'replace' }`. A cell is `{ personId, date }`.

For each cell:

1. Skip it if the person lacks the competence, or `normalWindows` is empty (weekend, holiday, absent). **Painting never creates overtime.**
2. If `mode === 'replace'`, remove the person's assignments that day first.
3. `span === 'full'`: target = `normalWindows`.
   `span === 'half'`: target = the first of `[dayStart, breakStart)` and `[breakEnd, dayEnd)` (each intersected with `normalWindows`) that still has free time. If neither has, skip the cell.
4. Add one assignment per `freeIntervals(target, remaining)`.
5. Merge (R9).

**When to ask**: with `span: 'full'`, if any target cell already holds an assignment of **another** competence, the UI asks «Fyll resten» (fill) / «Erstatt» (replace) / «Avbryt» before calling. A cell holding only the same competence is filled silently. Half-day painting never asks; it only fills.

Examples (Per Solberg, Tuesday, has Teppefliser 07:00–11:00 and FOGA 11:30–15:00):

- paint full Innredning, fill → nothing free → no change, no question
- paint full Innredning, replace → one Innredning 07:00–15:00
- Hanne, Monday, empty, paint half Teppefliser → 07:00–11:00; a second half paint → 11:30–15:00

## R7 Derived status: `assignmentStatus(a, ws): 'ok' | 'unresolved'`

`unresolved` if any of these hold:

- the interval overlaps an unavailability of the person that day
- the person no longer has the competence
- the person is inactive

Unresolved assignments:

- **do not count** in `assignedHours`, so their hours are back in remaining demand at once
- stay visible (hatched, outlined in the competence colour)
- can be deleted one by one, or all at once with «Fjern uløste» (one undo step)

## R8 Editing blocks (week editor and row timeline)

All edits snap to `snap`. In the week editor, the edges of the normal day (07:00 and 15:00) also attract within 10 minutes.

- **Move**: keeps the duration. Clamped between the neighbouring blocks and the `editableWindows` boundary that contains the block.
- **Resize** (top/bottom or left/right edge): same clamps. Minimum length is `snap`.
- **Split** at `t` (double-click): only if both parts would be at least 30 minutes long. The result is two blocks with the same competence. They are **not** merged back while the split is the last edit (merge R9 runs on other edits only).
- **Recolour**: with the brush active, a click on a block of another competence changes it to the brush, if the person has that competence.
- **Draw** (brush active, press on free track):
  - Drag draws the dragged span, clamped to the free interval.
  - A plain click inside normal time fills the free part of normal time within that gap.
  - A plain click in overtime makes a 1 h block from the full hour clicked, clamped to the gap.
- **Delete**: × on the block, Alt-click, or the eraser tool.

The row view (horizontal timeline) uses the same rules but shows only 07:00–15:00. Blocks that reach into overtime are shown clipped to 07:00–15:00, with a «+N» tag, and cannot be moved there (edit them in the week editor).

## R9 `mergeAdjacent(assignments): Assignment[]`

Per person and date, a block whose `start` equals the previous block's `end` with the same competence is joined into it. It keeps the earlier block's `id`.

## R10 Demand and balance per competence × date

```
demand(c, d)     = DOMAIN.md formula
assigned(c, d)   = Σ paidHours of ok assignments with competence c on d
assignedOT(c, d) = Σ overtimeHours of the same
remaining(c, d)  = demand − assigned          // negative = surplus, shown as «+N»
covered(c, d)    = min(demand, assigned)
```

- The demand bar shows, from the left: regular cover (solid colour), overtime cover (striped colour), surplus (amber).
- A red hatched tail from the right is the part that cannot be covered (R11).

## R11 Capacity hint: `freeEligibleHours(c, d)` and `uncoverable(c, d)`

```
freeEligibleHours(c, d) = Σ over active people having c:  freeHours(normalWindows, their assignments)
uncoverable(c, d)       = max(0, remaining(c, d) − freeEligibleHours(c, d))   // workdays only
```

- `remaining` turns red when `uncoverable > 0`.
- The line «Ledig kapasitet, faste» sums `freeHours` over all active people, or only over people who have the focused competence. It also shows how many people have free time.
- Note: free time is shared across competences, so these hints are upper bounds per competence and must **not** be added up across competences.

## R12 Carry unfinished work: `carry(ws, c, fromDate, hours)`

Adds a `DemandAdjustment { competence: c, date: next calendar day, hours, reason: 'carry', fromDate }`.

- `hours > 0`.
- If the next day is a weekend or holiday, the demand lands there. It is covered only by overtime, or left open.
- The demand cell on the target day shows a small «+N» marker, with a tooltip saying where it came from.
- The adjustment can be undone like any other edit.

## R13 Totals

Over the visible week:

- **Dekket %** = Σ covered ÷ Σ demand, over `arbeidsdag`s.
- **Gjenstår** = Σ max(0, remaining), over `arbeidsdag`s.
- **Overtid** = Σ assignedOT, over all days.
- **Helg åpent** = Σ max(0, remaining), over `helg`/`helligdag`.

Per person per week:

- **Normaltid** = paid hours of ok assignments minus their overtime, shown against capacity (Σ paidHours of `normalWindows`).
- **Overtid** = Σ overtimeHours.

## R14 Default brush

When the brush tool is chosen with no competence picked, use the competence with the largest `remaining` on the focus day.

## R15 Eligibility

A person may get an assignment of competence `c` only if `c ∈ person.competences`. Every mutation path checks this (paint, draw, recolour). A gesture that hits only ineligible or unavailable cells does nothing, and shows one toast explaining why (for one cell: «Navn har ikke Kompetanse.» / «Navn er ikke tilgjengelig dag (ferie).»).
