import { staffedCompetences } from '../competences'
import { type ISODate } from '../dates'
import { dayType } from '../holidays'
import { competenceKey, sameProject, workOf, type Assignment, type CompetenceKey, type DemandAdjustment, type Work, type Workspace } from '../types'
import { freeHours, overtimeHours, paidHours } from './intervals'
import { blocksOf, normalWindows, okAssignments, unresolvedAssignments } from './time'

/**
 * The balance of demand and assigned hours per competence and day (R8–R12): what remains, what is covered, free capacity, unresolved assignments, and hours carried to the next day.
 * See design_docs/bemanning/RULES.md.
 */

/** Hours of demand nearer zero than this are met. */
export const MET = 0.01

/** How far the assigned hours cover the demand for one competence on one day. */
export interface DayBalance {
  /** The hours the Kalender plans, plus the hours moved to the day. */
  demand: number
  /** The part of the demand that was moved here from another day. */
  carried: number
  assigned: number
  assignedOT: number
  /** Negative when more is assigned than is needed. */
  remaining: number
  covered: number
}

const NO_BALANCE: DayBalance = { demand: 0, carried: 0, assigned: 0, assignedOT: 0, remaining: 0, covered: 0 }

export interface Balance {
  get: (competence: CompetenceKey, date: ISODate) => DayBalance
  /** Every competence with demand or assigned hours on the dates. */
  competences: CompetenceKey[]
}

/** R10: demand, assigned hours and what remains, per competence and day, for the given dates. */
export const buildBalance = (ws: Workspace, dates: ISODate[]): Balance => {
  const wd = ws.settings.workday
  const wanted = new Set(dates)
  const cells = new Map<string, DayBalance>()
  const cell = (competence: CompetenceKey, date: ISODate) => {
    const key = `${competence}|${date}`
    if (!cells.has(key)) cells.set(key, { ...NO_BALANCE })
    return cells.get(key)!
  }
  for (const row of ws.allocations) {
    const competence = competenceKey(row.competence)
    if (!competence) continue
    // A row has FTE on a few days and the period has hundreds: the row's own days are gone through, not the period's.
    for (const date in row.fte) if (row.fte[date] && wanted.has(date)) cell(competence, date).demand += row.fte[date] * ws.settings.hoursPerDay
  }
  for (const adjustment of ws.demandAdjustments ?? []) {
    if (!wanted.has(adjustment.date)) continue
    const c = cell(adjustment.competence, adjustment.date)
    c.demand += adjustment.hours
    c.carried += adjustment.hours
  }
  for (const a of okAssignments(ws)) {
    if (!wanted.has(a.date)) continue
    const c = cell(a.competence, a.date)
    c.assigned += paidHours(a, wd)
    c.assignedOT += overtimeHours(a, dayType(a.date), wd)
  }
  for (const c of cells.values()) {
    c.remaining = c.demand - c.assigned
    c.covered = Math.min(c.demand, c.assigned)
  }
  return {
    get: (competence, date) => cells.get(`${competence}|${date}`) ?? NO_BALANCE,
    competences: [...new Set([...cells.keys()].map((key) => key.slice(0, key.lastIndexOf('|'))))].sort(),
  }
}

export const dayBalance = (ws: Workspace, competence: CompetenceKey, date: ISODate): DayBalance => buildBalance(ws, [date]).get(competence, date)

export interface FreeCapacity {
  hours: number
  /** How many people have free normal time. */
  people: number
}

/**
 * R11: the free normal time of the permanent staff, or of those who have the competence.
 * Free time is shared between a person's competences, so the figures of two competences must not be added up.
 */
export const freeCapacity = (ws: Workspace, date: ISODate, competence?: CompetenceKey): FreeCapacity => {
  const wd = ws.settings.workday
  let hours = 0
  let people = 0
  for (const person of ws.persons ?? []) {
    if (competence !== undefined && !person.competences.includes(competence)) continue
    const free = freeHours(normalWindows(person.id, date, ws.unavailability ?? [], wd), blocksOf(ws.assignments ?? [], person.id, date), wd)
    hours += free
    if (free > 0) people += 1
  }
  return { hours, people }
}

/**
 * The unresolved assignments that still leave a gap: those on a day where hours of their competence remain.
 * Once others cover the day's demand, the assignment is replaced: it still does not count, but there is nothing left to solve.
 */
export const openUnresolved = (ws: Workspace): Assignment[] => {
  const unresolved = unresolvedAssignments(ws)
  if (!unresolved.length) return unresolved
  const balance = buildBalance(ws, [...new Set(unresolved.map((a) => a.date))])
  return unresolved.filter((a) => balance.get(a.competence, a.date).remaining > MET)
}

/** «Fjern uløste»: the assignments without the open unresolved ones on the given dates. Those whose day others cover are left as they are. */
export const removeUnresolved = (ws: Workspace, dates: ISODate[]): Assignment[] => {
  const all = ws.assignments ?? []
  const wanted = new Set(dates)
  const gone = new Set(openUnresolved(ws).filter((a) => wanted.has(a.date)))
  return gone.size ? all.filter((a) => !gone.has(a)) : all
}

/** R11: the remaining hours that the people with the competence have no free normal time for. Workdays only. */
export const uncoverable = (ws: Workspace, competence: CompetenceKey, date: ISODate, balance: Balance = buildBalance(ws, [date])): number =>
  dayType(date) === 'arbeidsdag' ? Math.max(0, balance.get(competence, date).remaining - freeCapacity(ws, date, competence).hours) : 0

export interface WeekTotals {
  /** Covered share of the demand on workdays, 0–1; `null` without demand. */
  coveredShare: number | null
  /** Hours still open on workdays. */
  remaining: number
  overtime: number
  /** Hours still open on weekends and holidays. */
  weekendOpen: number
}

/** R13: the totals of the page header, over the given dates. */
export const weekTotals = (ws: Workspace, dates: ISODate[]): WeekTotals => balanceTotals(buildBalance(ws, dates), dates)

/** The totals of some of the days of a balance that is already worked out, such as the days in view. */
export const balanceTotals = (balance: Balance, dates: ISODate[]): WeekTotals => {
  let demand = 0
  let covered = 0
  let remaining = 0
  let overtime = 0
  let weekendOpen = 0
  for (const date of dates) {
    const workday = dayType(date) === 'arbeidsdag'
    for (const competence of balance.competences) {
      const cell = balance.get(competence, date)
      overtime += cell.assignedOT
      if (workday) {
        demand += cell.demand
        covered += cell.covered
        remaining += Math.max(0, cell.remaining)
      } else weekendOpen += Math.max(0, cell.remaining)
    }
  }
  return { coveredShare: demand > 0 ? covered / demand : null, remaining, overtime, weekendOpen }
}

/** R14: the competence the brush starts with: of those people have, the one with the most hours remaining on the day; the first of them when nothing remains. */
export const defaultBrush = (ws: Workspace, date: ISODate, balance: Balance = buildBalance(ws, [date])): CompetenceKey | null => {
  let best: CompetenceKey | null = null
  for (const { key } of staffedCompetences(ws)) if (best === null || balance.get(key, date).remaining > balance.get(best, date).remaining) best = key
  return best
}

/**
 * The carried hours taken back: the adjustments for the competence on the date are removed. For a project, only those for
 * it; for the competence alone, all of them, so every part a move was shared in goes.
 */
export const removeCarried = (adjustments: DemandAdjustment[], work: CompetenceKey | Work, date: ISODate): DemandAdjustment[] => {
  const { competence, projectNo } = workOf(work)
  const kept = adjustments.filter((a) => !(a.competence === competence && a.date === date && (!projectNo || sameProject(a, { projectNo }))))
  return kept.length === adjustments.length ? adjustments : kept
}
