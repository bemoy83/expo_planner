import { addDays, dateRange, type ISODate } from './dates'
import { eventKey, numberKey, numberYear, venueEvents } from './projects'
import { buildProjectBalance, NO_PROJECT, projectTotals, type ProjectBalance, type ProjectTotal } from './staffing/projectBalance'
import { staffHours } from './staffing/time'
import { diffBy, type TableDiff } from './tableDiff'
import { competenceKey, PLANNED_BASIS, VENUE_PHASES, type Budgets, type DateSpan, type VenuePhase, type Workspace, type WorkPhase } from './types'
import { anchorDate, visibleVenue } from './venueImport'

/**
 * Resultat: the season, a row per project, with the hours the planner budgeted against the hours the Kalender plans.
 * The budget is one total per project, typed by the planner, and holds overhead; the plan counts direct work only, so
 * it is compared with the overhead of the settings added.
 */

/** A project number as budgets are looked up by it. */
/** The budget of a project, or null where it has none. */
export const budgetOf = (budgets: Budgets | undefined, projectNo: string): number | null => {
  const key = numberKey(projectNo)
  for (const [no, hours] of Object.entries(budgets ?? {})) if (numberKey(no) === key) return hours
  return null
}

/**
 * The budgets with the project's set to the hours, or removed where there are none: a budget of nought is none, as in
 * the budget workbook, where a project without one has 0. A number written otherwise is the same project.
 */
export const withBudget = (budgets: Budgets | undefined, projectNo: string, hours: number | null): Budgets => {
  const next = Object.fromEntries(Object.entries(budgets ?? {}).filter(([no]) => numberKey(no) !== numberKey(projectNo)))
  if (hours !== null && Number.isFinite(hours) && hours > 0 && projectNo.trim()) next[projectNo.trim()] = hours
  return next
}

/** The budgets after a project is given another number: its budget goes along, and wins over one the new number had. */
export const budgetsRenumbered = (budgets: Budgets | undefined, from: string, to: string): Budgets | undefined => {
  const hours = budgetOf(budgets, from)
  return hours === null ? budgets : withBudget(withBudget(budgets, from, null), to, hours)
}

/** One budget as a file holds it. */
export interface BudgetEntry {
  projectNo: string
  hours: number
}

const entries = (budgets: Budgets | undefined): BudgetEntry[] => Object.entries(budgets ?? {}).map(([projectNo, hours]) => ({ projectNo, hours }))

/** The file wins where it has a project; the rest of the table is kept. */
export const mergeBudgets = (existing: Budgets | undefined, incoming: BudgetEntry[]): Budgets => incoming.reduce((budgets, entry) => withBudget(budgets, entry.projectNo, entry.hours), { ...existing })

export const replaceBudgets = (incoming: BudgetEntry[]): Budgets => mergeBudgets({}, incoming)

export const diffBudgets = (existing: Budgets | undefined, incoming: BudgetEntry[]): TableDiff =>
  diffBy(entries(existing), incoming, (entry) => numberKey(entry.projectNo), (a, b) => a.hours === b.hours)

/** Days of each of the venue's phases a project has in its halls, counted once however many halls have them. */
type HallDays = Record<VenuePhase, number>

/** The span of each of the venue's phases a project has booked in one hall. */
export type HallPhases = Partial<Record<VenuePhase, DateSpan>>

/** The planned hours of one part of a project. */
export interface PhaseHours {
  Montering: number
  Demontering: number
  /** Rows without a work phase. */
  other: number
}

/** The days of build-up and of tear-down, which the plan is set against the permanent staff on. */
type WorkDays = 'assembly' | 'dismantle'

/** One row of the season table. */
export interface SeasonRow {
  projectNo: string
  name: string
  /** The year it is held: of its first booking, else the year its number begins with. */
  year: string
  /** Its first day of build-up, else its first booked day, else its first planned day: what the table is ordered by. */
  start: ISODate | ''
  /** Its first and last booked day, of any phase; without bookings, its first and last planned day. */
  first: ISODate | ''
  last: ISODate | ''
  days: HallDays
  halls: string[]
  /** The phases it has booked per hall. */
  hallPhases: Record<string, HallPhases>
  budget: number | null
  /** FTE × the hours of an FTE-day, per work phase. */
  planned: PhaseHours
  plannedTotal: number
  /** The planned hours per day, FTE × the hours of an FTE-day over all its rows, without overhead. */
  plannedByDay: Record<ISODate, number>
  /** The plan with overhead added, as the budget holds it. */
  withOverhead: number
  /** Budget less the plan with overhead: what is left of the budget, negative where the plan is over it. Null without a budget. */
  deviation: number | null
  /** The deviation as a share of the budget. Null without a budget, or with one of nought. */
  deviationShare: number | null
  /** The hours the permanent staff can work in their normal time, summed over its days of build-up and of tear-down. */
  staff: Record<WorkDays, number>
  /** The hours worked on it. Null until a source of actual hours is agreed: none is read in yet. */
  actual: number | null
  /** Budget less the hours worked. Null without both. */
  actualDeviation: number | null
}

/** Less than this, in hours, is rounding. */
export const NOISE = 0.05

const emptyPhases = (): PhaseHours => ({ Montering: 0, Demontering: 0, other: 0 })
const phaseOf = (phase: WorkPhase | ''): keyof PhaseHours => phase || 'other'
const emptyDays = (): Record<VenuePhase, Set<ISODate>> => ({ assembly: new Set(), movingIn: new Set(), event: new Set(), movingOut: new Set(), dismantle: new Set() })
const sumOf = <T,>(list: T[], of: (item: T) => number) => list.reduce((total, item) => total + of(item), 0)

const compare = (budget: number | null, withOverhead: number) => {
  const deviation = budget === null ? null : budget - withOverhead
  return { deviation, deviationShare: deviation === null || !budget ? null : deviation / budget }
}

/**
 * The season: a row per project number that has a booking shown in the Kalender, planned FTE or a budget, ordered by
 * build-up. Bookings left out of the Kalender are left out here too; planning rows without a number are not counted.
 */
export const seasonRows = (ws: Pick<Workspace, 'venue' | 'hiddenVenue' | 'projects' | 'allocations' | 'budgets' | 'settings' | 'persons' | 'unavailability'>): SeasonRow[] => {
  const venue = visibleVenue(ws.venue, ws.hiddenVenue)
  const rows = new Map<string, Omit<SeasonRow, 'start' | 'first' | 'last' | 'days' | 'staff' | 'deviation' | 'deviationShare' | 'actual' | 'actualDeviation'> & { dates: Record<VenuePhase, Set<ISODate>>; booked: ISODate | ''; plannedDates: ISODate[] }>()
  const rowOf = (projectNo: string, name: string) => {
    const key = numberKey(projectNo)
    let row = rows.get(key)
    if (!row) {
      row = { projectNo: projectNo.trim(), name, year: '', booked: '', dates: emptyDays(), plannedDates: [], halls: [], hallPhases: {}, budget: null, planned: emptyPhases(), plannedTotal: 0, plannedByDay: {}, withOverhead: 0 }
      rows.set(key, row)
    }
    if (!row.name) row.name = name
    return row
  }

  const projectOfEvent = new Map(venueEvents(venue, ws.projects).filter((event) => event.projectNo).map((event) => [event.key, event]))
  for (const booking of venue) {
    const event = projectOfEvent.get(eventKey(booking.eventName, anchorDate(booking)))
    if (!event) continue
    const row = rowOf(event.projectNo, event.name)
    if (!row.halls.includes(booking.hall)) row.halls.push(booking.hall)
    if (!row.booked || event.start < row.booked) row.booked = event.start
    const phases = (row.hallPhases[booking.hall] ??= {})
    for (const phase of VENUE_PHASES) {
      const span = booking.phases[phase]
      if (!span) continue
      for (const date of dateRange(span.start, span.end)) row.dates[phase].add(date)
      const had = phases[phase]
      phases[phase] = had ? { start: had.start < span.start ? had.start : span.start, end: had.end > span.end ? had.end : span.end } : span
    }
  }

  const hoursPerDay = ws.settings.hoursPerDay
  for (const allocation of ws.allocations) {
    if (!allocation.projectNo.trim()) continue
    const dates = Object.keys(allocation.fte).filter((date) => allocation.fte[date])
    if (!dates.length) continue
    const row = rowOf(allocation.projectNo, allocation.projectName)
    row.planned[phaseOf(allocation.phase)] += sumOf(dates, (date) => allocation.fte[date]) * hoursPerDay
    for (const date of dates) row.plannedByDay[date] = (row.plannedByDay[date] ?? 0) + allocation.fte[date] * hoursPerDay
    row.plannedDates.push(...dates)
  }

  for (const [projectNo, hours] of Object.entries(ws.budgets ?? {})) rowOf(projectNo, ws.projects.find((ref) => numberKey(ref.projectNo) === numberKey(projectNo))?.name ?? '').budget = hours

  // The hours of the permanent staff are the same for every project on a day: worked out once a day.
  const staffOn = new Map<ISODate, number>()
  const staffOf = (dates: Set<ISODate>) => sumOf([...dates], (date) => staffOn.get(date) ?? staffOn.set(date, staffHours(ws, date)).get(date)!)
  const overhead = 1 + ws.settings.overhead
  return [...rows.values()]
    .map(({ dates, booked, plannedDates, ...row }): SeasonRow => {
      const booking = VENUE_PHASES.flatMap((phase) => [...dates[phase]]).sort()
      const planning = plannedDates.sort()
      const start = [...dates.assembly].sort()[0] || booked || planning[0] || ''
      const plannedTotal = row.planned.Montering + row.planned.Demontering + row.planned.other
      const withOverhead = plannedTotal * overhead
      return {
        ...row,
        start,
        first: booking[0] ?? planning[0] ?? '',
        last: booking.at(-1) ?? planning.at(-1) ?? '',
        year: (booked || start).slice(0, 4) || numberYear(row.projectNo),
        days: { assembly: dates.assembly.size, movingIn: dates.movingIn.size, event: dates.event.size, movingOut: dates.movingOut.size, dismantle: dates.dismantle.size },
        halls: row.halls.sort((a, b) => a.localeCompare(b, 'nb', { numeric: true })),
        plannedTotal,
        withOverhead,
        ...compare(row.budget, withOverhead),
        staff: { assembly: staffOf(dates.assembly), dismantle: staffOf(dates.dismantle) },
        actual: null,
        actualDeviation: null,
      }
    })
    .sort((a, b) => (a.start || '9999').localeCompare(b.start || '9999') || a.name.localeCompare(b.name, 'nb'))
}

/** Where a project stands on a day: still to come, going on, or done. A project without days is still to come. */
export type SeasonStatus = 'next' | 'live' | 'done'

export const seasonStatus = (row: Pick<SeasonRow, 'first' | 'last'>, today: ISODate): SeasonStatus => (!row.first || row.first > today ? 'next' : row.last < today ? 'done' : 'live')

/** The planned hours per day of build-up or tear-down, against what the permanent staff can work on those days. */
interface DayAverage {
  /** Null where none of the rows has both planned hours and days of the phase. */
  planned: number | null
  /** Null where the rows have no days of the phase. */
  staff: number | null
}

/**
 * The planned hours of montering per day of build-up, and of demontering per day of tear-down, over the rows that have
 * both, with the hours the permanent staff can work averaged over the same days. For one row or for the sum of many.
 */
export const dayAverages = (rows: SeasonRow[]): Record<WorkDays, DayAverage> => {
  const of = (phase: WorkDays, work: 'Montering' | 'Demontering'): DayAverage => {
    const planning = rows.filter((row) => row.planned[work] && row.days[phase])
    const plannedDays = sumOf(planning, (row) => row.days[phase])
    const days = sumOf(rows, (row) => row.days[phase])
    return { planned: plannedDays ? sumOf(planning, (row) => row.planned[work]) / plannedDays : null, staff: days ? sumOf(rows, (row) => row.staff[phase]) / days : null }
  }
  return { assembly: of('assembly', 'Montering'), dismantle: of('dismantle', 'Demontering') }
}

/** What the permanent staff can work per day, averaged over the days of build-up and tear-down of the rows. Null without such days. */
export const staffPerDay = (rows: SeasonRow[]): number | null => {
  const days = sumOf(rows, (row) => row.days.assembly + row.days.dismantle)
  return days ? sumOf(rows, (row) => row.staff.assembly + row.staff.dismantle) / days : null
}

/** The sums of the rows shown. The deviations are over the projects that have a budget alone, which are counted in `budgeted`. */
interface SeasonTotals {
  projects: number
  budgeted: number
  budget: number
  days: HallDays
  planned: PhaseHours
  plannedTotal: number
  withOverhead: number
  /** The plan with overhead of the projects that have a budget, which the deviation compares with. */
  budgetedWithOverhead: number
  deviation: number | null
  deviationShare: number | null
  /** The projects with actual hours and a budget, and their sums. */
  actuals: number
  actual: number
  actualBudget: number
  /** Their plan with overhead, which the actual hours are set against. */
  actualWithOverhead: number
  actualDeviation: number | null
}

export const seasonTotals = (rows: SeasonRow[]): SeasonTotals => {
  const withBudget = rows.filter((row) => row.budget !== null)
  const budget = sumOf(withBudget, (row) => row.budget!)
  const budgetedWithOverhead = sumOf(withBudget, (row) => row.withOverhead)
  const worked = rows.filter((row) => row.actualDeviation !== null)
  const actualBudget = sumOf(worked, (row) => row.budget!)
  const actual = sumOf(worked, (row) => row.actual!)
  return {
    projects: rows.length,
    budgeted: withBudget.length,
    budget,
    days: Object.fromEntries(VENUE_PHASES.map((phase) => [phase, sumOf(rows, (row) => row.days[phase])])) as HallDays,
    planned: { Montering: sumOf(rows, (row) => row.planned.Montering), Demontering: sumOf(rows, (row) => row.planned.Demontering), other: sumOf(rows, (row) => row.planned.other) },
    plannedTotal: sumOf(rows, (row) => row.plannedTotal),
    withOverhead: sumOf(rows, (row) => row.withOverhead),
    budgetedWithOverhead,
    ...compare(withBudget.length ? budget : null, budgetedWithOverhead),
    actuals: worked.length,
    actual,
    actualBudget,
    actualWithOverhead: sumOf(worked, (row) => row.withOverhead),
    actualDeviation: worked.length ? actualBudget - actual : null,
  }
}

/** The sums of the rows, their hours per day against the permanent staff, and what the staff can work per day: what the figures and the sums of the matrix show. */
export const seasonSummary = (rows: SeasonRow[]) => ({ totals: seasonTotals(rows), averages: dayAverages(rows), staff: staffPerDay(rows) })

/** A project's booked phases over all its halls, each from its first day in any hall to its last, in the order of the phases. */
export const bookedPhases = (row: Pick<SeasonRow, 'hallPhases'>): ({ phase: VenuePhase } & DateSpan)[] =>
  VENUE_PHASES.flatMap((phase) => {
    const spans = Object.values(row.hallPhases).flatMap((phases) => phases[phase] ?? [])
    if (!spans.length) return []
    return [{ phase, start: spans.map((span) => span.start).sort()[0], end: spans.map((span) => span.end).sort().at(-1)! }]
  })

/** One day of the season: the planned hours of the rows on it, summed where projects overlap, and what the permanent staff can work. */
export interface SeasonDay {
  date: ISODate
  planned: number
  staff: number
}

/** The days from the first to the last planned day of the rows, each with its planned hours and the hours of the permanent staff. */
export const seasonDays = (ws: Pick<Workspace, 'persons' | 'unavailability' | 'settings'>, rows: SeasonRow[]): SeasonDay[] => {
  const planned = new Map<ISODate, number>()
  for (const row of rows) for (const [date, hours] of Object.entries(row.plannedByDay)) planned.set(date, (planned.get(date) ?? 0) + hours)
  if (!planned.size) return []
  const dates = [...planned.keys()].sort()
  return dateRange(dates[0], dates.at(-1)!).map((date) => ({ date, planned: planned.get(date) ?? 0, staff: staffHours(ws, date) }))
}

/**
 * How far a result is from what it is set against, read after the fact, as a share either way: 0 within 3 %, 1 within
 * 10 %, 2 within 25 %, 3 beyond. Missing the estimate by as much is as bad over as under; the sign says which.
 */
export type ReviewGrade = 0 | 1 | 2 | 3

const REVIEW_STEPS = [0.03, 0.1, 0.25]

export const reviewGrade = (share: number): ReviewGrade => {
  const step = REVIEW_STEPS.findIndex((limit) => Math.abs(share) < limit)
  return (step === -1 ? 3 : step) as ReviewGrade
}

/** How far the hours worked may pass the plan with overhead before it is said that the plan missed: a tenth. */
export const PLAN_MARGIN = 0.1

/** The projects that need the planner, by what they need. A project can be in several. */
interface FollowUps {
  /** The plan with overhead is over the budget, and the project is not done. */
  over: SeasonRow[]
  /** The hours worked are over the budget. */
  actualOver: SeasonRow[]
  /** Starts within two weeks, or has started, and less than nine tenths of its plan is staffed. */
  soon: SeasonRow[]
  /** Has a budget and nothing planned, and is not done. */
  noPlan: SeasonRow[]
  noBudget: SeasonRow[]
}

/** How far ahead a project is said to start soon, in days, and how much of its plan must be staffed by then. */
const SOON_DAYS = 14
const STAFFED_ENOUGH = 0.9

export const followUps = (rows: SeasonRow[], today: ISODate, staffedOf: (row: SeasonRow) => number): FollowUps => {
  const open = rows.filter((row) => seasonStatus(row, today) !== 'done')
  const soon = addDays(today, SOON_DAYS)
  return {
    over: open.filter((row) => row.deviation !== null && row.deviation < -NOISE),
    actualOver: rows.filter((row) => row.actualDeviation !== null && row.actualDeviation < -NOISE),
    soon: open.filter((row) => row.plannedTotal > 0 && !!row.first && row.first <= soon && staffedOf(row) < row.plannedTotal * STAFFED_ENOUGH),
    noPlan: open.filter((row) => row.budget !== null && !row.plannedTotal),
    noBudget: rows.filter((row) => row.budget === null),
  }
}

/** The number of projects that something is to be followed up for. */
export const followUpCount = (follow: FollowUps): number => new Set(Object.values(follow).flatMap((rows: SeasonRow[]) => rows.map((row) => numberKey(row.projectNo)))).size

/** One competence of a project: the hours of the demand it plans with, and the hours planned, per work phase. */
interface CompetenceHours {
  competence: string
  demand: PhaseHours
  planned: PhaseHours
}

/**
 * A project's hours per competence and work phase: the demand under «Planlagt», which the Kalender's rows are planned
 * against, beside what is planned. A competence with neither is left out.
 */
export const projectHours = (ws: Pick<Workspace, 'demand' | 'allocations' | 'settings'>, projectNo: string): CompetenceHours[] => {
  const key = numberKey(projectNo)
  const byCompetence = new Map<string, CompetenceHours>()
  const of = (competence: string) => {
    const name = competence.trim()
    let entry = byCompetence.get(name.toLowerCase())
    if (!entry) byCompetence.set(name.toLowerCase(), (entry = { competence: name, demand: emptyPhases(), planned: emptyPhases() }))
    return entry
  }
  for (const line of ws.demand) {
    if (numberKey(line.projectNo) !== key || line.basis !== PLANNED_BASIS || (!line.assemblyHours && !line.dismantleHours)) continue
    const entry = of(line.competence)
    entry.demand.Montering += line.assemblyHours
    entry.demand.Demontering += line.dismantleHours
  }
  for (const row of ws.allocations) {
    if (numberKey(row.projectNo) !== key) continue
    const fte = Object.values(row.fte).reduce((sum, value) => sum + value, 0)
    if (fte) of(row.competence).planned[phaseOf(row.phase)] += fte * ws.settings.hoursPerDay
  }
  return [...byCompetence.values()].sort((a, b) => a.competence.localeCompare(b.competence, 'nb'))
}

/** The staffing of the season: per project, by its `numberKey`, and what is not on any project. */
interface SeasonStaffing {
  projects: Map<string, ProjectTotal>
  /** The staffing of the demand without a project number. */
  noProject: ProjectTotal
  /** The hours staffed beyond what all the projects lack: «Ikke fordelt». */
  unshared: number
}

/** Every day something is planned, staffed, ordered or moved to: the days the season's balance is counted on. */
const seasonDates = (ws: Workspace): ISODate[] => {
  const dates = new Set<ISODate>()
  for (const row of ws.allocations) for (const date in row.fte) if (row.fte[date]) dates.add(date)
  for (const a of ws.assignments ?? []) dates.add(a.date)
  for (const order of ws.hireOrders ?? []) dates.add(order.date)
  for (const adjustment of ws.demandAdjustments ?? []) dates.add(adjustment.date)
  return [...dates].sort()
}

/** The balance of the season per project, with the permanent staff and the confirmed orders of Innleid, over the whole workspace. */
export const seasonBalance = (ws: Workspace): { balance: ProjectBalance; dates: ISODate[] } => {
  const dates = seasonDates(ws)
  return { balance: buildProjectBalance(ws, dates, true), dates }
}

/**
 * What the season is staffed with, per project: the hours tagged with it and its share of the rest, against what is planned.
 * Hours moved from one day to the next are counted once, as the plan is: what remains is planned less staffed.
 */
export const seasonStaffing = ({ balance, dates }: ReturnType<typeof seasonBalance>): SeasonStaffing => {
  const { projects, unshared } = projectTotals(balance, dates)
  const noProject = projects.get(NO_PROJECT) ?? { planned: 0, tagged: 0, shared: 0, remaining: 0 }
  projects.delete(NO_PROJECT)
  return { projects, noProject, unshared }
}

/** One competence of a project: what it is staffed with per work phase, and what remains of its plan. */
interface CompetenceStaffing {
  competence: string
  tagged: PhaseHours
  shared: PhaseHours
  remaining: number
}

/**
 * A project's staffing per competence and work phase. A day's hours go to the phases of the project's rows that day
 * by their FTE; hours on a day without a row of the project are without a phase.
 */
export const projectStaffing = (ws: Workspace, { balance, dates }: ReturnType<typeof seasonBalance>, projectNo: string): CompetenceStaffing[] => {
  const key = numberKey(projectNo)
  const rows = ws.allocations.filter((row) => numberKey(row.projectNo) === key)
  const names = new Map(rows.map((row) => [competenceKey(row.competence), row.competence.trim()]))
  const entries = new Map<string, CompetenceStaffing & { planned: number; staffed: number }>()
  for (const competence of balance.competences) {
    for (const date of dates) {
      const p = balance.of(competence, date, projectNo)
      if (!p.demand && !p.tagged && !p.shared) continue
      const entry = entries.get(competence) ?? { competence: names.get(competence) ?? competence, tagged: emptyPhases(), shared: emptyPhases(), remaining: 0, planned: 0, staffed: 0 }
      const phases = rows.filter((row) => competenceKey(row.competence) === competence && row.fte[date])
      const fte = phases.reduce((sum, row) => sum + row.fte[date], 0)
      for (const [phase, weight] of fte ? phases.map((row) => [phaseOf(row.phase), row.fte[date] / fte] as const) : [['other', 1] as const]) {
        entry.tagged[phase] += p.tagged * weight
        entry.shared[phase] += p.shared * weight
      }
      entry.planned += p.demand - p.carried
      entry.staffed += p.tagged + p.shared
      entry.remaining = entry.planned - entry.staffed
      entries.set(competence, entry)
    }
  }
  return [...entries.values()].map(({ planned: _planned, staffed: _staffed, ...entry }) => entry).sort((a, b) => a.competence.localeCompare(b.competence, 'nb'))
}
