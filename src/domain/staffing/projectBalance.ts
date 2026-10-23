import { addDays, type ISODate } from '../dates'
import { hireHours, isWaiting } from '../hire'
import { dayType } from '../holidays'
import { PROJECT_HALLS } from '../locations'
import { numberKey } from '../projects'
import { spread } from '../spread'
import { competenceKey, workOf, type CompetenceKey, type DemandAdjustment, type Interval, type Work, type Workspace } from '../types'
import { MET, type Balance } from './balance'
import { onlyOffDays, paintGaps, type DayCell } from './edit'
import { length, normalDay, paidHours, paidTotal } from './intervals'
import { okAssignments } from './time'

/**
 * The balance shared out on projects and their places (the Claude Doc «Prosjektmerking: byggeplan», 2026-10-21): tagged hours first, then the untagged by what each lacks; a stroke cut to where the demand of a competence, a project or a place is met (R47); and hours carried to the next day, shared on what the projects lack.
 * See design_docs/bemanning/RULES.md.
 */

/** The recipient of the hours that are for no project: demand on Kalender rows without a number, and hours moved without a project. */
export const NO_PROJECT = ''

/** How a project is looked up in the balance: by its number, as Resultat finds it; `NO_PROJECT` where it has none. */
const projectKey = (projectNo: string | undefined): string => numberKey(projectNo ?? NO_PROJECT)

/** One project's part of a competence on a day. */
export interface ProjectDay {
  /** The number as the first row or block that has the project writes it; `NO_PROJECT` for the demand without one. */
  projectNo: string
  /** The hours the Kalender plans for the project, plus the hours moved to the day for it. */
  demand: number
  /** The part of the demand that was moved here from another day. */
  carried: number
  /** The hours of blocks, and in `withHired` of confirmed orders, that are for the project. */
  tagged: number
  /** The project's share of the hours that are for no project in particular. */
  shared: number
  /** `demand − tagged − shared`: negative when the project is tagged with more than it needs. */
  remaining: number
  /** The project's part shared out on its places, by `placeKey`, as the project's part is on the projects: `PROJECT_PLACE` for the demand on rows of all its halls. */
  places: Map<string, PlaceDay>
  /** The project's hours for no place in particular more than all its places lack together, which go to none of them. */
  unplaced: number
}

/** One place's part of a project's competence on a day. */
export interface PlaceDay {
  /** The place as the first row or block that has it writes it; `PROJECT_PLACE` for the project's halls. */
  hall: string
  /** The hours the project's rows of the place plan, plus, for `PROJECT_PLACE`, the hours moved to the day for the project. */
  demand: number
  /** The hours of blocks painted on the place's line. */
  tagged: number
  /** The place's share of the project's hours that are for no place in particular: its blocks without one, its confirmed orders and its share of the untagged hours. */
  shared: number
  /** `demand − tagged − shared`. */
  remaining: number
}

/** The place of the demand on a row for all of a project's halls, for none of them, or «Ufordelt»: the halls the project has booked that day (`bookedPlaces`). */
export const PROJECT_PLACE = ''

/** How a place is looked up in the balance: by its name as it is compared, `PROJECT_PLACE` for a row of all the project's halls. */
export const placeKey = (hall: string | undefined): string => {
  const name = (hall ?? '').trim().toLowerCase()
  return name === PROJECT_HALLS.toLowerCase() ? PROJECT_PLACE : name
}

/** A competence on a day, shared out on its projects. */
interface ProjectDayBalance {
  /** By the project's `numberKey`, with `NO_PROJECT` for the demand that has none. */
  projects: Map<string, ProjectDay>
  /** The hours assigned for no project, before they are shared out. */
  untagged: number
  /** The untagged hours more than all the projects lack together, which go to none: «Ikke fordelt». */
  unshared: number
}

export interface ProjectBalance {
  get: (competence: CompetenceKey, date: ISODate) => ProjectDayBalance
  /** One project's part, nothing where it has none. */
  of: (competence: CompetenceKey, date: ISODate, projectNo: string | undefined) => ProjectDay
  /** Every competence with demand or assigned hours on the dates. */
  competences: CompetenceKey[]
}

const NO_PROJECT_DAY: ProjectDay = { projectNo: NO_PROJECT, demand: 0, carried: 0, tagged: 0, shared: 0, remaining: 0, places: new Map(), unplaced: 0 }

const NO_PROJECT_BALANCE: ProjectDayBalance = { projects: new Map(), untagged: 0, unshared: 0 }

/**
 * Shares `untagged` hours out on the recipients by what each lacks after its tagged hours, as `spreadOpen` shares by
 * hours: where one alone lacks hours, it gets them all. Sets each one's `shared` and `remaining`, and returns the
 * hours more than all lack together, which go to none.
 */
const shareOut = (recipients: { demand: number; tagged: number; shared: number; remaining: number }[], untagged: number): number => {
  const lacking = recipients.map((r) => Math.max(0, r.demand - r.tagged))
  const lack = lacking.reduce((sum, hours) => sum + hours, 0)
  const share = Math.min(untagged, lack)
  recipients.forEach((r, i) => {
    r.shared = lack > 0 ? (share * lacking[i]) / lack : 0
    r.remaining = r.demand - r.tagged - r.shared
  })
  return Math.max(0, untagged - lack)
}

/**
 * The balance of `buildBalance` per project, over the whole workspace: what is hidden in the Kalender does not change it.
 * A project gets the hours tagged with it, and a share of the untagged hours by what it still lacks after them, as
 * `spreadOpen` shares by hours: where one project alone lacks hours, it gets them all. Untagged hours more than all
 * lack together go to none. The demand without a project is a recipient of its own, `NO_PROJECT`. Nothing of this
 * is stored. Bemanning counts the permanent staff alone, whose rest is what Innleid orders for; `withHired` counts
 * the confirmed orders too, as Resultat does. Shared by what is lacking, the two give each project the same.
 * Each project's part is shared on its places one step further: the place of a block painted on a place's line is
 * tagged, and the project's other hours go to its places by what each lacks (`places`, `PROJECT_PLACE`).
 */
export const buildProjectBalance = (ws: Workspace, dates: ISODate[], withHired = false): ProjectBalance => {
  const wd = ws.settings.workday
  const wanted = new Set(dates)
  const cells = new Map<string, { projects: Map<string, ProjectDay>; untagged: number; unshared: number }>()
  const cell = (competence: CompetenceKey, date: ISODate) => {
    const key = `${competence}|${date}`
    if (!cells.has(key)) cells.set(key, { projects: new Map(), untagged: 0, unshared: 0 })
    return cells.get(key)!
  }
  const part = (competence: CompetenceKey, date: ISODate, projectNo: string | undefined) => {
    const projects = cell(competence, date).projects
    const key = projectKey(projectNo)
    if (!projects.has(key)) projects.set(key, { ...NO_PROJECT_DAY, projectNo: key ? projectNo!.trim() : NO_PROJECT, places: new Map() })
    return projects.get(key)!
  }
  const place = (p: ProjectDay, hall: string | undefined) => {
    const key = placeKey(hall)
    if (!p.places.has(key)) p.places.set(key, { hall: key ? hall!.trim() : PROJECT_PLACE, demand: 0, tagged: 0, shared: 0, remaining: 0 })
    return p.places.get(key)!
  }
  const assigned = (competence: CompetenceKey, date: ISODate, work: { projectNo?: string; hall?: string }, hours: number) => {
    if (!projectKey(work.projectNo)) {
      cell(competence, date).untagged += hours
      return
    }
    const p = part(competence, date, work.projectNo)
    p.tagged += hours
    if (work.hall?.trim()) place(p, work.hall).tagged += hours
  }
  for (const row of ws.allocations) {
    const competence = competenceKey(row.competence)
    if (!competence) continue
    for (const date in row.fte) {
      if (!row.fte[date] || !wanted.has(date)) continue
      const p = part(competence, date, row.projectNo)
      const hours = row.fte[date] * ws.settings.hoursPerDay
      p.demand += hours
      place(p, row.hall).demand += hours
    }
  }
  for (const adjustment of ws.demandAdjustments ?? []) {
    if (!wanted.has(adjustment.date)) continue
    const p = part(adjustment.competence, adjustment.date, adjustment.projectNo)
    p.demand += adjustment.hours
    p.carried += adjustment.hours
    place(p, PROJECT_PLACE).demand += adjustment.hours
  }
  for (const a of okAssignments(ws)) if (wanted.has(a.date)) assigned(a.competence, a.date, a, paidHours(a, wd))
  if (withHired) for (const order of ws.hireOrders ?? []) if (wanted.has(order.date) && !isWaiting(order)) assigned(order.competence, order.date, order, order.fte * hireHours(order, wd))
  for (const c of cells.values()) {
    const projects = [...c.projects.values()]
    c.unshared = shareOut(projects, c.untagged)
    // A project's hours for no place in particular are shared on its places the same way.
    for (const p of projects) {
      const places = [...p.places.values()]
      const placed = places.reduce((sum, at) => sum + at.tagged, 0)
      p.unplaced = shareOut(places, p.tagged - placed + p.shared)
    }
  }
  const get = (competence: CompetenceKey, date: ISODate) => cells.get(`${competence}|${date}`) ?? NO_PROJECT_BALANCE
  return {
    get,
    of: (competence, date, projectNo) => get(competence, date).projects.get(projectKey(projectNo)) ?? NO_PROJECT_DAY,
    competences: [...new Set([...cells.keys()].map((key) => key.slice(0, key.lastIndexOf('|'))))].sort(),
  }
}

/**
 * The projects that have a line under a competence, in Bemanning and in Innleid alike: those of `shown` (by `numberKey`, the
 * projects shown in the Kalender) with demand of it or hours tagged with it in the days, or with orders of it there
 * (`ordered`, the projects of a day's orders). In the order their work does: by the first of the days they are on, then by name.
 */
export const projectsWithWork = (
  balance: ProjectBalance,
  competence: CompetenceKey,
  dates: ISODate[],
  shown: Set<string>,
  name: (projectNo: string) => string,
  ordered: (date: ISODate) => (string | undefined)[] = () => [],
): string[] => {
  const found = new Map<string, { projectNo: string; first: ISODate }>()
  const add = (projectNo: string, date: ISODate) => {
    const key = projectKey(projectNo)
    if (shown.has(key) && !found.has(key)) found.set(key, { projectNo: projectNo.trim(), first: date })
  }
  for (const date of dates) {
    for (const p of balance.get(competence, date).projects.values()) if (p.demand > MET || p.tagged > MET) add(p.projectNo, date)
    for (const projectNo of ordered(date)) if (projectNo?.trim()) add(projectNo, date)
  }
  return [...found.values()].sort((a, b) => a.first.localeCompare(b.first) || name(a.projectNo).localeCompare(name(b.projectNo), 'nb')).map((line) => line.projectNo)
}

/** A project over a period: what the Kalender plans for it, what is staffed, and what remains. */
export interface ProjectTotal {
  planned: number
  tagged: number
  shared: number
  /** `planned − tagged − shared`. Hours moved from one day to the next are demand on both, so the days' own remaining would count them twice. */
  remaining: number
}

/** The totals per project, by its `numberKey`, of the competences and dates given, and the hours that went to none. */
export const projectTotals = (balance: ProjectBalance, dates: ISODate[], competences: CompetenceKey[] = balance.competences): { projects: Map<string, ProjectTotal>; unshared: number } => {
  const projects = new Map<string, ProjectTotal>()
  let unshared = 0
  for (const competence of competences) {
    for (const date of dates) {
      const day = balance.get(competence, date)
      unshared += day.unshared
      for (const [key, p] of day.projects) {
        const total = projects.get(key) ?? { planned: 0, tagged: 0, shared: 0, remaining: 0 }
        total.planned += p.demand - p.carried
        total.tagged += p.tagged
        total.shared += p.shared
        total.remaining = total.planned - total.tagged - total.shared
        projects.set(key, total)
      }
    }
  }
  return { projects, unshared }
}

/**
 * R47: a stroke of the brush cut to where the demand is met. The days run from where the stroke began to its
 * far end, `back` when that is towards earlier days. The stroke ends on the last of its days that still lacks
 * hours of the competence: the days before it are left as they are, the days past it are dropped, and that
 * day is filled no further than its remaining hours ask, to the quarter of an hour, by all the people of the
 * stroke together. Where they have too little free time for that, they get what the stroke gave them. Nothing
 * is left of a stroke over days that lack no hours. Work for a project goes as far as the project lacks hours, by `projects`.
 */
export const cellsToDemand = (ws: Workspace, cells: DayCell[], work: CompetenceKey | Work, balance: Balance, back = false, projects?: ProjectBalance): DayCell[] => {
  const wd = ws.settings.workday
  const { competence, projectNo, hall } = workOf(work)
  const remaining = (date: ISODate) => {
    if (!projectNo || !projects) return balance.get(competence, date).remaining
    const p = projects.of(competence, date, projectNo)
    return hall?.trim() ? (p.places.get(placeKey(hall))?.remaining ?? 0) : p.remaining
  }
  const offDays = onlyOffDays(cells)
  const outward = [...new Set(cells.map((cell) => cell.date))].sort((a, b) => (back ? b.localeCompare(a) : a.localeCompare(b)))
  const last = outward.findLastIndex((date) => (offDays || dayType(date) === 'arbeidsdag') && remaining(date) > MET)
  if (last < 0) return []
  const far = outward[last]
  const kept = new Set(outward.slice(0, last + 1))
  const ends = cells.filter((cell) => cell.date === far)
  const need = remaining(far)
  const given = (within: Interval) => ends.reduce((sum, cell) => sum + paidTotal(paintGaps(ws, { ...cell, within }, competence, 'full', offDays), wd), 0)
  // Every end of the stroke on that day has the same bounds: the normal day, or the part of it the stroke was drawn to.
  const bounds = ends[0].within ?? normalDay(wd)
  let within = bounds
  for (let t = wd.snap; t < length(bounds); t += wd.snap) {
    const tried = back ? { start: bounds.end - t, end: bounds.end } : { start: bounds.start, end: bounds.start + t }
    if (given(tried) < need - MET) continue
    within = tried
    break
  }
  const whole = within.start <= wd.dayStart && within.end >= wd.dayEnd
  return cells.filter((cell) => kept.has(cell.date)).map((cell) => (cell.date !== far || (whole && !cell.within) ? cell : { ...cell, within }))
}

/**
 * R12: moves unfinished hours to the next day as added demand. The day they come from keeps its demand and its assignments.
 * Moved for a project, the hours are for it. Moved for the competence alone, they are shared on what each project and
 * the demand without one still lack that day, among the permanent staff, so no hours moved are left without a recipient;
 * where none lacks any, they are for no project.
 */
export const carry = (ws: Workspace, work: CompetenceKey | Work, fromDate: ISODate, hours: number, makeId: () => string = () => `adj-${crypto.randomUUID()}`): DemandAdjustment[] => {
  const all = ws.demandAdjustments ?? []
  if (!(hours > 0)) return all
  const { competence, projectNo } = workOf(work)
  const moved = (part: number, to: string | undefined): DemandAdjustment => ({ id: makeId(), competence, ...(to && { projectNo: to }), date: addDays(fromDate, 1), hours: part, reason: 'carry', fromDate, createdAt: new Date().toISOString() })
  if (projectNo) return [...all, moved(hours, projectNo)]
  const lacking = [...buildProjectBalance(ws, [fromDate]).get(competence, fromDate).projects.values()].filter((p) => p.remaining > MET)
  if (!lacking.length) return [...all, moved(hours, undefined)]
  const parts = spread(hours, lacking.map((p) => p.remaining))
  return [...all, ...lacking.flatMap((p, i) => (parts[i] > 0 ? [moved(parts[i], p.projectNo || undefined)] : []))]
}
