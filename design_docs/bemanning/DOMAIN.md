# Domain model

All new types go in `src/domain/types.ts` (or a new `src/domain/staffing.ts` re-exported from it). Pure data, no React.

## Time

```ts
/** Minutes after midnight, 0–1440. Values made by the UI are multiples of `snap`. */
export type Minute = number
export interface Interval { start: Minute; end: Minute }   // end > start, half-open [start, end)

export interface WorkdaySettings {
  dayStart: Minute          // 420  = 07:00
  dayEnd: Minute            // 900  = 15:00
  breakStart: Minute        // 660  = 11:00, unpaid
  breakEnd: Minute          // 690  = 11:30
  overtimeEarliest: Minute  // 360  = 06:00, first minute the week editor shows
  overtimeLatest: Minute    // 1260 = 21:00
  snap: Minute              // 15
}
```

`Settings` gets `workday: WorkdaySettings` with these defaults. `settings.hoursPerDay` stays (Kalender uses it). A test asserts `paidHours(dayStart, dayEnd) === hoursPerDay` for the defaults, and the settings UI shows a warning if they diverge.

Dates are the repo's `ISODate`. Day kind comes from `dayType(date)`: `'arbeidsdag' | 'helg' | 'helligdag'`.

## Competences

```ts
/** Normalized competence text, as calc.ts `norm()`: trim + lowercase. */
export type CompetenceKey = string

export interface CompetenceStyle {
  key: CompetenceKey
  label: string         // display text, e.g. «Teppefliser»
  shortLabel: string    // ≤ 4 chars, e.g. «TEP», used where blocks are narrow
  color: LineColor      // one of the design system's line tokens
  order: number         // order in the demand strip and the 1–9 keys
}
export type LineColor = 'line-blue' | 'line-teal' | 'line-green' | 'line-amber' | 'line-rose' | 'line-violet' | 'line-slate' | 'line-orange'
```

- **The list of competences is derived.** It is the union of the competence texts on `kpi.workTypes`, `demand`, `allocations` and `persons`. Empty texts are skipped.
- **Styles** are stored in `meta` under `'competenceStyles'` as `Record<CompetenceKey, CompetenceStyle>`. A competence without a style gets one on first render. Colours are handed out in token order, skipping colours already taken. `order` is set alphabetically. The planner can reorder and recolour.
- The keyboard shortcuts 1–9 follow `order`.

## People

```ts
export interface Person {
  id: string
  name: string
  order: number
  active: boolean                  // inactive people are hidden in Bemanning but keep their history
  competences: CompetenceKey[]
  note?: string
}
```

New Dexie table `persons: 'id'`.

## Availability

Base availability is implicit: every `arbeidsdag` from `dayStart` to `dayEnd`. On `helg` and `helligdag` the person has no normal time, but overtime can be drawn there.

```ts
export type UnavailabilityKind = 'syk' | 'ferie' | 'kurs' | 'annet'
export interface Unavailability {
  id: string
  personId: string
  date: ISODate
  kind: UnavailabilityKind
  /** Both unset: the whole day. Set: only this part of the day (e.g. leaves at 12:00). */
  start?: Minute
  end?: Minute
  note?: string
}
```

New table `unavailability: 'id, personId, date'`.

One record type covers both absence known in advance (ferie, kurs) and absence that happens after planning (syk). The consequences are the same and are derived (see `RULES.md` R7): any assignment that overlaps unavailability is *unresolved*. The UI shows `syk` differently, with a red label and a count of unresolved blocks.

## Assignments

```ts
export interface Assignment {
  id: string
  personId: string
  date: ISODate
  competence: CompetenceKey
  start: Minute
  end: Minute
  source: 'manual' | 'suggested'   // 'suggested' reserved for the future algorithm
  projectNo?: string               // reserved, unset in MVP
  hall?: string                    // reserved, unset in MVP
}
```

New table `assignments: 'id, personId, date'`.

**Invariants**, kept by every mutation and checked by a test helper:

- No two assignments of one person on one date overlap.
- `start` and `end` are multiples of `snap`, and `end - start >= snap`.
- `overtimeEarliest <= start` and `end <= overtimeLatest`.
- Neighbouring assignments with the same competence are merged (R9).

Invalid states are **not stored**. Unresolved, ineligible or outside-availability are *derived* states (R7), so they heal by themselves if the cause goes away (for example a sick day is taken back).

## Demand

Bemanning does not compute demand. It reads the plan the Kalender holds:

```
demandHours(competence, date) =
    Σ over allocations with norm(row.competence) === competence:  row.fte[date] × settings.hoursPerDay
  + Σ adjustments for (competence, date)
```

```ts
export interface DemandAdjustment {
  id: string
  competence: CompetenceKey
  date: ISODate          // the day the hours are added to
  hours: number          // > 0 in MVP
  reason: 'carry'        // 'manual' reserved
  fromDate?: ISODate     // for 'carry': the day the work was not finished
  createdAt: string
  note?: string
}
```

New table `demandAdjustments: 'id, date'`. A carry **only adds** to the next day. The day the work was not finished keeps its demand and its assignments (the people did work), so it does not suddenly show a surplus.

## Workspace and storage

```ts
interface Workspace {
  // …existing
  persons?: Person[]
  unavailability?: Unavailability[]
  assignments?: Assignment[]
  demandAdjustments?: DemandAdjustment[]
  competenceStyles?: Record<CompetenceKey, CompetenceStyle>
}
```

- `db.ts`: `this.version(3).stores({ persons: 'id', unavailability: 'id, personId, date', assignments: 'id, personId, date', demandAdjustments: 'id, date' })`. Add the tables to `TABLES()`, `loadWorkspace`, `saveWorkspace` and `clearAll`, plus `writeStaffing(change)` doing one transaction like `writeDemand`.
- `history.ts`: add `persons`, `unavailability`, `assignments` and `demandAdjustments` as `Map<string, Delta<T | null>>`, and `competenceStyles?: Delta<…>`. Extend `emptyChange`, `isEmptyChange`, `applyChange` and `changeWrites`.
- **One user gesture is one undo step**, for example a drag over 12 cells, or marking someone sick for the rest of the week.
- `backup.ts` includes the new tables.
- View preferences go in `prefs.ts` (localStorage): expand mode (`'row' | 'week'`), whether the demand strip is folded, and the expanded rows in row mode.

## Shared planning context

Add to `prefs.ts`: `planningFocus: { date: ISODate }`. Kalender sets it when the planner selects a cell or a date; Bemanning sets it when the planner selects a day. Each tab opens on the ISO week of `planningFocus.date` with that day focused. If it is unset, both use today.
