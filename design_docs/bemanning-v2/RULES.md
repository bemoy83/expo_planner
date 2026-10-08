# Rules, v2

Pure functions in `src/domain/staffing.ts`, tests in `staffing.test.ts`. v1 numbering is kept so existing tests stay valid.

## Kept from v1 unchanged

R1 `paidHours`, R2 `overtimeHours`, R3 `normalWindows`, R4 `editableWindows`, R5 `freeIntervals`, R7 `assignmentStatus` (unresolved), R9 `mergeAdjacent`, R11 capacity hints, R13 totals, R15 eligibility. See `../bemanning/RULES.md`.

R7 as implemented in the app (`openUnresolved`: unresolved only while hours of the competence remain that day; faint trace after) is kept; it overrides v1 RULES.md R7.

## Changed

### R6 Painting a day (fill only)
`paintDays(ws, cells[], competence, { span: 'full' | 'half' })` (exists in `staffing.ts`).
- `mode: 'replace'` is removed from the UI. Keep the parameter in the domain if convenient, but no gesture uses it.
- Per eligible cell (R15, available, not sick, `arbeidsdag`): `full` fills `freeIntervals(normalWindows)`; `half` fills `freeIntervals([dayStart, breakStart))`, and if that is empty, `freeIntervals([breakEnd, dayEnd))`.
- Then `mergeAdjacent`.
- Cells that yield nothing are skipped silently. If the gesture was a single cell and nothing was painted, the UI explains why (no competence / absence / sick).

### R10 Demand per competence × date (summed)
`demand(ws, c, d)` = Σ over Kalender rows with competence `c` of `fte[d] × hoursPerDay`, plus adjustments (R12). `assigned` and `remaining` as v1 (`buildBalance`, `dayBalance`). No project scope in v2.

### R12 Carry (moved hours)
Kept as in the app: moving unfinished hours to another day and taking them back, from v1's day popover. In v2 the popover opens from a demand cell in Bemanning (UI §3.4).

### R14 Default brush
Use the competence with the largest `remaining` on the **first visible workday** (no focus day any more).
## New

> Deferred rules (R16, R17, R20–R22, R26, R27, R30–R33) are in `DEFERRED.md`.

### R18 Zoom fit on entering Bemanning
`fitWidth(range, viewWidth) = clamp(floor(viewWidth / days(range)), 80, 160)` where `viewWidth` = scroll width − label column (400) − open panel (340).
Range priority: (1) selected project's `[min phase start, max phase end]`; (2) last stored Bemanning range; (3) 10 days from the Behov view's left edge. After fitting, scroll so the range's first day is at the left edge.

### R19 Moving a block
`moveAssignment(ws, id, toDate, toStart, toPerson?)`: keeps duration and competence. Refused (no change, toast) if the target overlaps another assignment of the same person, or the target day is absent (any unavailability) for that person. Clamped to `[overtimeEarliest, overtimeLatest)`. Sick target days are refused.

### R23 Focus day
v1's `planningFocus` (shared with Plan mode). Set by: header date click, demand cell click, person-cell mousedown **with the Velg tool**. Painting, erasing and dragging never set it. Shown only as the header date pill; no column tint.

### R24 Block label fit
Given block width `w` (px) and padding 13: full name if `w − 13 ≥ len(name) × 6,7`; else short label if `w − 13 ≥ len(short) × 7`; else none. *Auto* additionally shows hours (`len × 6 + 6`) when it fits after the name. Measure text in production instead of the estimate.

### R25 Overtime badge
Per folded day cell: `Σ overtimeHours(blocks)`. Shown as «+N» when > 0,05.

### R28 Zoom interpolation
Given start width `W0`, scroll `s0`, target `W1`, `s1`: anchor day positions `d0 = s0 / W0`, `d1 = s1 / W1`. At eased progress `e` (cubic in-out over 460 ms): `W = exp(lerp(ln W0, ln W1, e))`, `scrollLeft = lerp(d0, d1, e) × W`. Render every frame with the interpolated width; commit final values at the end.

### R29 Focus day across modes
Both modes read and write `planningFocus`. Plan → Bemanning: R18's range is the project window if it contains the focus day, else the stored range if it contains it, else 10 days from the Monday of its week. Bemanning → Plan: centre on the focus day only if it would fall outside the restored view.

### R34 Paste
`paste(ws, clip, anchorDate)`: for each item, target = anchor + dayOffset (skip past the range end). Skip if the person is absent or sick that day. For each block, fill `freeIntervals([start, end))` with copies; then `mergeAdjacent`. One undo step. Same people only (no row shifting).

### R35 Absence as date ranges
The Person panel's form (replacing `AbsenceDialog`) takes kind, from, to, whole day or part of a day, note. It writes one `Unavailability` per day in the range (as the app does today); the panel groups consecutive days of the same kind back into periods for display and editing. Editing a period rewrites its days; «Friskmeld fra d» deletes the sick days from d on. Blocks on those days follow the v1 rule (R7 as implemented: `openUnresolved`).

### R36 Overtime limit
Per person and ISO week: `Σ overtimeHours` of non-unresolved blocks. Flag when `> overtimeLimitPerWeek`. Flag only; never blocks an edit.

### R37 Projects in view
Visible days `[a, b]` = columns intersecting the scroll viewport minus the label column and an open side panel. In view = projects whose `[first phase, last phase]` intersects `[a, b]`, **plus** projects already listed that still intersect `[a − 2, b + 2]` (hysteresis: enter when visible, leave only 2 days after). Sorted by event start, then first phase. **Slots** (fixed height) = `max over every window of the same width n = b − a + 1` of the number of projects intersecting it, computed for the whole range at the current zoom using the hysteresis-widened window `n + 4`; recompute when the zoom or viewport width changes, not while scrolling.
- Implementation note: the mockup polls the scroll position on an interval as a safety net; production should use the scroll event (rAF-throttled) and a ResizeObserver on the viewport and side panel only.

### R38 Drag a block between days (folded rows)
`moveDay(ws, fromPerson, fromDate, blockIds, toPerson, toDate, { copy })`: for each block, fill `freeIntervals([start, end))` on the target with the same competence; the target person must be eligible (R15), available and not sick that day, else refused with a toast. Without `copy`, remove the moved parts from the source. Then `mergeAdjacent`. One undo step. In the unfolded row, R19 applies (time and day).
