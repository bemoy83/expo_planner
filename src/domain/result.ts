import { dateRange, type ISODate } from './dates'
import { eventKey, numberKey, numberYear, venueEvents } from './projects'
import { diffBy, type TableDiff } from './tableDiff'
import { PLANNED_BASIS, type Budgets, type Workspace, type WorkPhase } from './types'
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
export interface HallDays {
  assembly: number
  event: number
  dismantle: number
}

/** The planned hours of one part of a project. */
export interface PhaseHours {
  Montering: number
  Demontering: number
  /** Rows without a work phase. */
  other: number
}

/** One row of the season table. */
export interface SeasonRow {
  projectNo: string
  name: string
  /** The year it is held: of its first booking, else the year its number begins with. */
  year: string
  /** Its first day of build-up, else its first booked day, else its first planned day: what the table is ordered by. */
  start: ISODate | ''
  days: HallDays
  halls: string[]
  budget: number | null
  /** FTE × the hours of an FTE-day, per work phase. */
  planned: PhaseHours
  plannedTotal: number
  /** The plan with overhead added, as the budget holds it. */
  withOverhead: number
  /** Budget less the plan with overhead: what is left of the budget, negative where the plan is over it. Null without a budget. */
  deviation: number | null
  /** The deviation as a share of the budget. Null without a budget, or with one of nought. */
  deviationShare: number | null
}

const emptyPhases = (): PhaseHours => ({ Montering: 0, Demontering: 0, other: 0 })
const phaseOf = (phase: WorkPhase | ''): keyof PhaseHours => phase || 'other'

const compare = (budget: number | null, withOverhead: number) => {
  const deviation = budget === null ? null : budget - withOverhead
  return { deviation, deviationShare: deviation === null || !budget ? null : deviation / budget }
}

/**
 * The season: a row per project number that has a booking shown in the Kalender, planned FTE or a budget, ordered by
 * build-up. Bookings left out of the Kalender are left out here too; planning rows without a number are not counted.
 */
export const seasonRows = (ws: Pick<Workspace, 'venue' | 'hiddenVenue' | 'projects' | 'allocations' | 'budgets' | 'settings'>): SeasonRow[] => {
  const venue = visibleVenue(ws.venue, ws.hiddenVenue)
  const rows = new Map<string, SeasonRow & { dates: Record<keyof HallDays, Set<ISODate>>; booked: ISODate | '' }>()
  const rowOf = (projectNo: string, name: string) => {
    const key = numberKey(projectNo)
    let row = rows.get(key)
    if (!row) {
      row = {
        projectNo: projectNo.trim(),
        name,
        year: '',
        start: '',
        booked: '',
        days: { assembly: 0, event: 0, dismantle: 0 },
        dates: { assembly: new Set(), event: new Set(), dismantle: new Set() },
        halls: [],
        budget: null,
        planned: emptyPhases(),
        plannedTotal: 0,
        withOverhead: 0,
        deviation: null,
        deviationShare: null,
      }
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
    for (const phase of ['assembly', 'event', 'dismantle'] as const) {
      const span = booking.phases[phase]
      if (span) for (const date of dateRange(span.start, span.end)) row.dates[phase].add(date)
    }
  }

  const hoursPerDay = ws.settings.hoursPerDay
  const firstPlanned = new Map<string, ISODate>()
  for (const allocation of ws.allocations) {
    if (!allocation.projectNo.trim()) continue
    const dates = Object.keys(allocation.fte).filter((date) => allocation.fte[date])
    if (!dates.length) continue
    const row = rowOf(allocation.projectNo, allocation.projectName)
    const fte = dates.reduce((sum, date) => sum + allocation.fte[date], 0)
    row.planned[phaseOf(allocation.phase)] += fte * hoursPerDay
    const first = dates.sort()[0]
    const key = numberKey(allocation.projectNo)
    if (!firstPlanned.has(key) || first < firstPlanned.get(key)!) firstPlanned.set(key, first)
  }

  for (const [projectNo, hours] of Object.entries(ws.budgets ?? {})) rowOf(projectNo, ws.projects.find((ref) => numberKey(ref.projectNo) === numberKey(projectNo))?.name ?? '').budget = hours

  const overhead = 1 + ws.settings.overhead
  return [...rows.entries()]
    .map(([key, { dates, booked, ...row }]): SeasonRow => {
      const start = [...dates.assembly].sort()[0] || booked || firstPlanned.get(key) || ''
      const plannedTotal = row.planned.Montering + row.planned.Demontering + row.planned.other
      const withOverhead = plannedTotal * overhead
      return {
        ...row,
        start,
        year: (booked || start).slice(0, 4) || numberYear(row.projectNo),
        days: { assembly: dates.assembly.size, event: dates.event.size, dismantle: dates.dismantle.size },
        halls: row.halls.sort((a, b) => a.localeCompare(b, 'nb', { numeric: true })),
        plannedTotal,
        withOverhead,
        ...compare(row.budget, withOverhead),
      }
    })
    .sort((a, b) => (a.start || '9999').localeCompare(b.start || '9999') || a.name.localeCompare(b.name, 'nb'))
}

/** The sums of the rows shown. The deviation is over the projects that have a budget alone, which are counted in `budgeted`. */
export interface SeasonTotals {
  projects: number
  budgeted: number
  budget: number
  planned: PhaseHours
  plannedTotal: number
  withOverhead: number
  /** The plan with overhead of the projects that have a budget, which the deviation compares with. */
  budgetedWithOverhead: number
  deviation: number | null
  deviationShare: number | null
}

export const seasonTotals = (rows: SeasonRow[]): SeasonTotals => {
  const withBudget = rows.filter((row) => row.budget !== null)
  const sum = (list: SeasonRow[], of: (row: SeasonRow) => number) => list.reduce((total, row) => total + of(row), 0)
  const budget = sum(withBudget, (row) => row.budget!)
  const budgetedWithOverhead = sum(withBudget, (row) => row.withOverhead)
  const compared = compare(withBudget.length ? budget : null, budgetedWithOverhead)
  return {
    projects: rows.length,
    budgeted: withBudget.length,
    budget,
    planned: { Montering: sum(rows, (row) => row.planned.Montering), Demontering: sum(rows, (row) => row.planned.Demontering), other: sum(rows, (row) => row.planned.other) },
    plannedTotal: sum(rows, (row) => row.plannedTotal),
    withOverhead: sum(rows, (row) => row.withOverhead),
    budgetedWithOverhead,
    ...compared,
  }
}

/** One competence of a project: the hours of the demand it plans with, and the hours planned, per work phase. */
export interface CompetenceHours {
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
