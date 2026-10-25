import { competenceStyles } from '../competences'
import { pushTo } from '../collections'
import { daysBetween, type ISODate } from '../dates'
import { dayType } from '../holidays'
import { isSuggestedRow } from '../plannedRows'
import { numberKey } from '../projects'
import { shareOverDays } from '../spread'
import { freeIntervals, paidHours } from '../staffing/intervals'
import { normalWindows, okAssignments } from '../staffing/time'
import { competenceKey, type AllocationRow, type Assignment, type CompetenceKey, type CompetenceStyle, type Interval, type Stage, type Workspace } from '../types'

/**
 * The planning engine (step 3 of the Claude Doc «Planleggingsmotor: byggeplan»): the days of the demand and the
 * permanent staff on them, for every project of the period at once, so that no project takes the best people by
 * being planned first. It writes nothing itself: it hands back the next workspace, which the planner takes project by
 * project (`takeProjects`). What makes a plan good is the score (`score.ts`); the engine builds a plan that holds
 * to its rules and then moves days to where people are free.
 *
 * 1. The demand of each row is a job, placed in its window where its stage puts it (R2): the stages of a hall share
 *    the window in overlapping parts, oppmerking first; a running or extra competence has the whole window. A
 *    competence done by at least so many in a hall is given that many a day (R4). A tear-down is the other way round (R9).
 * 2. The jobs are staffed hardest competence first (R7), then the tightest window: on each day the people who have
 *    the competence and free normal time, those who did the same work the day before first, then those who did the
 *    same competence or the one before it in its chain, and those with the fewest competences, so the others stay free (R3, R5).
 * 3. What nobody could take on a day is moved to a day of the window where someone can, and then to a day before the
 *    build-up or after the tear-down that the hall stands free (`nearby`, R6): the planner starts earlier before he
 *    hires in. Those days are listed for Venyou (`outside`). What is left stays in the plan, uncovered, for Bemanning
 *    and Innleid to show.
 *
 * Only normal time is planned: overtime and hire are the planner's (R6). Blocks the planner painted stay, and those
 * the engine painted before are planned again. Whether the FTE the planner typed stays is his choice (`keepTyped`).
 * Nothing is random: the same workspace gives the same plan.
 */

export interface SolveInput {
  ws: Workspace
  /** The rows of the plan, stored and suggested, of the projects to plan. */
  rows: AllocationRow[]
  /** The FTE-days a row needs in all. */
  required: (row: AllocationRow) => number
  windowOf: (row: AllocationRow) => Set<ISODate> | undefined
  /** The working days next to a row's window that its halls stand free, nearest first (`freeDaysNear`); none where not given. */
  nearby?: (row: AllocationRow) => ISODate[]
  /** Whether the FTE the planner typed stays where it is; else it is planned again with the rest. */
  keepTyped: boolean
  makeId?: () => string
}

/** What a day of FTE less than this is: nothing. */
const NOISE = 0.05
/** Hours less than this are not worth a block. */
const SMALLEST = 0.25

/** The stages in the order a stand is built. */
const ORDERED: Stage[] = ['oppmerking', 'gulv', 'standbygging', 'tilvalg', 'losore']

const tenth = (value: number) => Math.round(value * 10) / 10

interface Job {
  row: AllocationRow
  competence: CompetenceKey
  /** The days it may be done on, in the order they come. */
  days: ISODate[]
  /** The days its stage puts it on, a part of `days`. */
  run: ISODate[]
  /** The days next to the window its halls stand free, nearest first. */
  near: ISODate[]
  /** FTE-days still to place. */
  need: number
  /** The fewest a day, where the competence has one. */
  min: number
  /** The planner's order of the competence: lower is harder to replace. */
  rank: number
  /** FTE by day, as the engine places it. */
  fte: Record<ISODate, number>
}

/** The workdays of a window, or all its days where it has none. */
const workdaysOf = (window: Set<ISODate>): ISODate[] => {
  const days = [...window].sort()
  const work = days.filter((date) => dayType(date) === 'arbeidsdag')
  return work.length ? work : days
}

/**
 * The part of the window the stage of a job puts it in: the `count` stages present in its hall and phase each take an
 * overlapping part, the `index`th starting where the one before is half done.
 */
const stagePart = (days: ISODate[], index: number, count: number): ISODate[] => {
  if (count <= 1) return days
  const from = Math.floor((index * days.length) / (count + 1))
  const to = Math.max(from + 1, Math.ceil(((index + 2) * days.length) / (count + 1)))
  return days.slice(from, to)
}

/** The FTE a job is given on its run: whole people, evenly, the decimals last; at least `min` a day where it has one. */
const placeOnRun = (job: Job, extra: boolean): void => {
  const run = extra ? [...job.run].reverse() : job.run
  const days = job.min ? Math.max(1, Math.min(run.length, Math.floor(job.need / job.min + 1e-9))) : run.length
  shareOverDays(job.need, days).forEach((part, i) => part && (job.fte[run[i]] = (job.fte[run[i]] ?? 0) + part))
}

interface Staff {
  /** Each person's blocks by day: those there were and those the engine paints. */
  blocks: Map<string, Assignment[]>
  add: (a: Assignment) => void
  /** The free normal time of a person on a day. */
  free: (personId: string, date: ISODate) => Interval[]
  /** The last block of a person on the nearest day before, within a few days. */
  before: (personId: string, date: ISODate) => Assignment | undefined
}

const dayKey = (personId: string, date: ISODate) => `${personId}|${date}`

const staffOf = (ws: Workspace, kept: readonly Assignment[]): Staff => {
  const wd = ws.settings.workday
  const blocks = new Map<string, Assignment[]>()
  const byPerson = new Map<string, Assignment[]>()
  const add = (a: Assignment) => {
    pushTo(blocks, dayKey(a.personId, a.date), a)
    pushTo(byPerson, a.personId, a)
  }
  kept.forEach(add)
  return {
    blocks,
    add,
    free: (personId, date) => freeIntervals(normalWindows(personId, date, ws.unavailability ?? [], wd), blocks.get(dayKey(personId, date)) ?? [], wd.snap),
    before: (personId, date) => {
      let found: Assignment | undefined
      for (const a of byPerson.get(personId) ?? []) {
        const gap = daysBetween(a.date, date)
        if (gap <= 0 || gap > 3) continue
        if (!found || a.date > found.date || (a.date === found.date && a.end > found.end)) found = a
      }
      return found
    },
  }
}

/** Cuts a stretch of free time to the paid hours wanted, on the snap: what is left of it stays free. */
const cut = (iv: Interval, hours: number, snap: number, wd: Workspace['settings']['workday']): Interval => {
  if (paidHours(iv, wd) <= hours + 1e-9) return iv
  let end = iv.start + snap
  while (end < iv.end && paidHours({ start: iv.start, end }, wd) < hours - 1e-9) end += snap
  return { start: iv.start, end: Math.min(end, iv.end) }
}

/**
 * The people who can take a job on a day, best first: who did the same row the day before, who did the same competence
 * or the one before it in its chain, then who changes nothing else; and among those, who has the fewest competences.
 */
const candidates = (ws: Workspace, staff: Staff, job: Job, date: ISODate, nextOf: Map<CompetenceKey, CompetenceKey | undefined>) => {
  const wd = ws.settings.workday
  const rank = (personId: string): number => {
    const before = staff.before(personId, date)
    if (!before) return 2
    if (before.competence !== job.competence) return nextOf.get(before.competence) === job.competence ? 1.5 : 3
    const sameProject = numberKey(before.projectNo ?? '') === numberKey(job.row.projectNo)
    const sameHall = (before.hall ?? '').trim().toLowerCase() === (job.row.hall ?? '').trim().toLowerCase()
    return sameProject && sameHall ? 0 : sameHall ? 0.5 : 1
  }
  return (ws.persons ?? [])
    .filter((person) => person.competences.includes(job.competence))
    .map((person) => ({ person, free: staff.free(person.id, date), rank: rank(person.id) }))
    .filter((c) => c.free.reduce((sum, iv) => sum + paidHours(iv, wd), 0) >= SMALLEST)
    .sort((a, b) => a.rank - b.rank || a.person.competences.length - b.person.competences.length || a.person.order - b.person.order)
}

/** Paints people on a job's day until its hours are covered or nobody is left; returns the hours nobody could take. */
const staffDay = (ws: Workspace, staff: Staff, job: Job, date: ISODate, hours: number, nextOf: Map<CompetenceKey, CompetenceKey | undefined>, makeId: () => string): number => {
  const wd = ws.settings.workday
  let left = hours
  for (const { person, free } of candidates(ws, staff, job, date, nextOf)) {
    for (const iv of free) {
      if (left < SMALLEST) break
      const piece = cut(iv, left, wd.snap, wd)
      const paid = paidHours(piece, wd)
      if (paid < SMALLEST) continue
      staff.add({
        id: makeId(),
        personId: person.id,
        date,
        competence: job.competence,
        start: piece.start,
        end: piece.end,
        source: 'suggested',
        ...(job.row.projectNo ? { projectNo: job.row.projectNo, ...(job.row.hall?.trim() ? { hall: job.row.hall } : {}) } : {}),
      })
      left -= paid
    }
    if (left < SMALLEST) break
  }
  return Math.max(0, left)
}

/** The hours the planner's own blocks already give a job on a day: his blocks of its competence for its project, in its hall or none. */
const ownCover = (kept: readonly Assignment[], job: Job, date: ISODate, wd: Workspace['settings']['workday']): number =>
  kept
    .filter(
      (a) =>
        a.source === 'manual' &&
        a.date === date &&
        a.competence === job.competence &&
        numberKey(a.projectNo ?? '') === numberKey(job.row.projectNo) &&
        (!a.hall || (a.hall ?? '').trim().toLowerCase() === (job.row.hall ?? '').trim().toLowerCase()),
    )
    .reduce((sum, a) => sum + paidHours(a, wd), 0)

export interface Solution {
  /** The workspace with the engine's plan for every project. */
  workspace: Workspace
  /** The projects the engine planned, by their number as written. */
  projects: string[]
  /** The days the engine works in a hall outside the project's window, for the planner to tell Venyou: by project, hall and day. */
  outside: OutsideDay[]
}

export interface OutsideDay {
  projectNo: string
  projectName: string
  /** The row's hall or place; empty for a row of all the project's halls. */
  hall: string
  date: ISODate
}

export const solve = ({ ws, rows, required, windowOf, nearby = () => [], keepTyped, makeId = () => `eng-${crypto.randomUUID()}` }: SolveInput): Solution => {
  const wd = ws.settings.workday
  const perDay = ws.settings.hoursPerDay
  const styles = competenceStyles(ws)
  const styleOf = new Map<CompetenceKey, CompetenceStyle & { index: number }>(styles.map((style, index) => [style.key, { ...style, index }]))
  const nextOf = new Map(styles.map((style) => [style.key, style.next]))

  // What stays: the planner's blocks, and, if he wants, the FTE he typed.
  const kept = okAssignments({ ...ws, assignments: (ws.assignments ?? []).filter((a) => a.source !== 'suggested') })
  const fixedOf = (row: AllocationRow): Record<ISODate, number> => {
    if (isSuggestedRow(row) || !keepTyped) return {}
    const engine = new Set(row.engine ?? [])
    return Object.fromEntries(Object.entries(row.fte).filter(([date, fte]) => fte && !engine.has(date)))
  }

  // 1. The jobs, placed where their stages put them.
  const jobs: Job[] = []
  const byPlace = new Map<string, Job[]>()
  for (const row of rows) {
    const window = windowOf(row)
    const competence = competenceKey(row.competence)
    if (!window?.size || !competence || !row.phase) continue
    const fixed = fixedOf(row)
    const need = tenth(required(row) - Object.values(fixed).reduce((sum, v) => sum + v, 0))
    const style = styleOf.get(competence)
    const job: Job = { row, competence, days: workdaysOf(window), run: [], near: nearby(row), need, min: style?.minPerHall ?? 0, rank: style?.index ?? styles.length, fte: { ...fixed } }
    jobs.push(job)
    pushTo(byPlace, `${numberKey(row.projectNo)}|${(row.hall ?? '').trim().toLowerCase()}|${row.phase}`, job)
  }
  for (const group of byPlace.values()) {
    const tearDown = group[0].row.phase === 'Demontering'
    const order = tearDown ? [...ORDERED].reverse() : ORDERED
    const present = order.filter((stage) => group.some((job) => styleOf.get(job.competence)?.stage === stage))
    for (const job of group) {
      const stage = styleOf.get(job.competence)?.stage
      const index = stage ? present.indexOf(stage) : -1
      job.run = index < 0 ? job.days : stagePart(job.days, index, present.length)
      if (job.need > NOISE) placeOnRun(job, stage === 'ekstra')
    }
  }

  // 2. The people, hardest competence first, then the tightest window.
  const staff = staffOf(ws, kept)
  jobs.sort((a, b) => a.rank - b.rank || a.days.length - b.days.length || (a.days[0] ?? '').localeCompare(b.days[0] ?? ''))
  const short = new Map<Job, Map<ISODate, number>>()
  for (const job of jobs) {
    const left = new Map<ISODate, number>()
    for (const date of Object.keys(job.fte).sort()) {
      const hours = job.fte[date] * perDay - ownCover(kept, job, date, wd)
      if (hours < SMALLEST) continue
      const rest = staffDay(ws, staff, job, date, hours, nextOf, makeId)
      if (rest >= SMALLEST) left.set(date, rest)
    }
    if (left.size) short.set(job, left)
  }

  // 3. What nobody could take is moved to a day of the window where someone can: the days of its run first.
  for (const [job, left] of short) {
    for (const [date, hours] of left) {
      const fixed = fixedOf(job.row)
      if (fixed[date]) continue
      let rest = hours
      const others = [...job.run, ...job.days.filter((d) => !job.run.includes(d)), ...job.near].filter((d) => d !== date)
      for (const other of others) {
        if (rest < SMALLEST) break
        const free = candidates(ws, staff, job, other, nextOf).reduce((sum, c) => sum + c.free.reduce((s, iv) => s + paidHours(iv, wd), 0), 0)
        if (free < SMALLEST) continue
        // Moved in tenths of a day, as the Kalender writes FTE, no more than the day has room for.
        const moved = Math.min(rest, Math.floor((Math.min(rest, free) / perDay) * 10 + 1e-9) / 10 * perDay)
        if (moved < SMALLEST) continue
        const taken = moved - staffDay(ws, staff, job, other, moved, nextOf, makeId)
        if (taken < SMALLEST) continue
        const fte = tenth(taken / perDay)
        job.fte[other] = tenth((job.fte[other] ?? 0) + fte)
        job.fte[date] = tenth(job.fte[date] - fte)
        if (job.fte[date] <= NOISE) delete job.fte[date]
        rest -= taken
      }
    }
  }

  // The rows as the engine leaves them, the days it wrote marked; a suggested row with FTE becomes a stored row.
  const byRow = new Map(jobs.map((job) => [job.row.id, job]))
  let order = Math.max(-1, ...ws.allocations.map((row) => row.order))
  const projects = new Set<string>()
  const allocations = ws.allocations.map((row) => {
    const job = byRow.get(row.id)
    if (!job) return row
    projects.add(row.projectNo)
    const fixed = fixedOf(row)
    const engine = Object.keys(job.fte).filter((date) => !(date in fixed)).sort()
    const same = Object.keys(job.fte).length === Object.keys(row.fte).filter((date) => row.fte[date]).length && Object.entries(job.fte).every(([date, fte]) => row.fte[date] === fte)
    if (same && engine.join() === (row.engine ?? []).join()) return row
    return { ...row, fte: job.fte, ...(engine.length ? { engine } : { engine: undefined }) }
  })
  for (const job of jobs) {
    if (!isSuggestedRow(job.row) || !Object.keys(job.fte).length) continue
    projects.add(job.row.projectNo)
    allocations.push({ ...job.row, id: `row-${makeId()}`, order: ++order, fte: job.fte, notes: {}, engine: Object.keys(job.fte).sort() })
  }
  const outside = new Map<string, OutsideDay>()
  for (const job of jobs) {
    const window = new Set(job.days)
    for (const date of Object.keys(job.fte))
      if (!window.has(date) && job.near.includes(date)) {
        const hall = (job.row.hall ?? '').trim()
        outside.set(`${numberKey(job.row.projectNo)}|${hall.toLowerCase()}|${date}`, { projectNo: job.row.projectNo, projectName: job.row.projectName, hall, date })
      }
  }
  const painted = [...staff.blocks.values()].flat().filter((a) => a.source === 'suggested')
  const assignments = [...(ws.assignments ?? []).filter((a) => a.source !== 'suggested'), ...painted]
  return { workspace: { ...ws, allocations, assignments }, projects: [...projects], outside: [...outside.values()].sort((a, b) => a.hall.localeCompare(b.hall, 'nb') || a.date.localeCompare(b.date)) }
}

/**
 * The workspace with the engine's plan taken for some of its projects: their rows and the engine's blocks for them
 * as the solution has them; every other project as it is. The engine's earlier blocks for a project taken are replaced.
 */
export const takeProjects = (ws: Workspace, solution: Workspace, projectNos: string[]): Workspace => {
  const taken = new Set(projectNos.map(numberKey))
  const isTaken = (projectNo: string | undefined) => taken.has(numberKey(projectNo ?? ''))
  const solved = new Map(solution.allocations.map((row) => [row.id, row]))
  const allocations = ws.allocations.map((row) => (isTaken(row.projectNo) ? (solved.get(row.id) ?? row) : row))
  const known = new Set(ws.allocations.map((row) => row.id))
  for (const row of solution.allocations) if (!known.has(row.id) && isTaken(row.projectNo)) allocations.push(row)
  const assignments = [
    ...(ws.assignments ?? []).filter((a) => !(a.source === 'suggested' && isTaken(a.projectNo))),
    ...(solution.assignments ?? []).filter((a) => a.source === 'suggested' && isTaken(a.projectNo)),
  ]
  return { ...ws, allocations, assignments }
}
