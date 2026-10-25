import { competenceStyles } from '../competences'
import { pushTo } from '../collections'
import { addDays, type ISODate } from '../dates'
import { hireHours, shiftTimes } from '../hire'
import { dayType, workdayAfter, workdayBefore } from '../holidays'
import { isSuggestedRow } from '../plannedRows'
import { numberKey } from '../projects'
import { shareOverDays } from '../spread'
import { freeIntervals, paidHours, paidTotal } from '../staffing/intervals'
import { normalWindows, okAssignments } from '../staffing/time'
import { stageOfType } from '../kpi'
import { hallKey, hireCost, stageOrderOf, stagePlace, stagesOf, weightsOf } from './score'
import { competenceKey, type AllocationRow, type Assignment, type CompetenceKey, type CompetenceStyle, type HireOrder, type Interval, type Stage, type Supplier, type Workspace } from '../types'

/**
 * The planning engine (step 3 of the Claude Doc «Planleggingsmotor: byggeplan»): the days of the demand and the
 * permanent staff on them, for every project of the period at once, so that no project takes the best people by
 * being planned first. It writes nothing itself: it hands back the next workspace, which the planner takes project by
 * project (`takeProjects`). What makes a plan good is the score (`score.ts`); the engine builds a plan that holds
 * to its rules, with the days and the people chosen together.
 *
 * 1. The demand of each row is a job, its window the build-up or tear-down days of its project in its hall.
 * 2. The days are gone through one at a time: those of the build-ups first, back from the day the exhibitors move in,
 *    so a window is filled from its end and a day before it takes only what the window cannot hold; then those of the
 *    tear-downs, on from the end of the event (the planner, 2026-10-25). On a day, a job is open once the stage before it
 *    in the order its days are planned has begun (R2), the day before where the window itself, not widened, has a day for
 *    each stage; a running competence once the walls have; a tear-down's stages the other way round (R9), and so a
 *    build-up's, as it is planned back, but they must begin in their order too: a stage of a build-up opens only once its
 *    work, at its slowest, would reach back past the day the stage after it begins, or where its days run out. The
 *    planner's own blocks and orders count on every day before any day is planned. Work no supplier offers is given to
 *    those who have it first. The open jobs are given, first, what they must do that day to be done in time,
 *    the most pressed first, a competence done by at least so many in a hall that many (R4); and then whatever people
 *    are still free for, so nobody stands idle while work can be begun. Extra work comes last. Each time, those who were
 *    in the hall for the project the day before (after, planned back) come back first, then those who were in the hall, then the others,
 *    the fewest competences first (R3, R5).
 *    Where the permanent staff cannot do what a job must do that day, people are hired in (the Claude Doc «Innleie i
 *    planleggingsmotoren»): a hired person is one more person, from the first supplier who offers the competence for the
 *    day shift, kept on from day to day as the permanent staff are, to the next hall or project or along the chain, and
 *    let go when there is no work for a day. Someone is hired only for half a day's work or more, but on a job's last day as planned
 *    or where the job would otherwise have nobody on a day in the middle of its span. Less than half a day of a job is
 *    not left for a later day where it can be done that day, and a day outside the window is begun for half a day's work
 *    or more, as Venyou must block the hall for it.
 *    A job given more than its share keeps an even crew: once it has fewer people than the day before, it is given no more
 *    than it had, so no quiet day falls in the middle of its span (the planner, 2026-10-25).
 * 3. What nobody could take stays in the plan, uncovered, spread over its window, for Bemanning and Innleid to show.
 * 4. Where hours are left, the window of the project's hall and phase is widened onto the days before the build-up or
 *    after the tear-down that the hall stands free (`nearby`, R6), and all its work is planned again over the widened
 *    span, where that saves more than the days outside cost over all projects on those days. Those days are listed for
 *    Venyou (`outside`).
 * 5. Each day's blocks of a competence are shared out again on the same people, so each has as few pieces as can be
 *    (`consolidate`), and a person's day is laid out in one stretch per project and hall, yesterday's work first (`inStretches`).
 *
 * Only normal time is planned: overtime is the planner's (R6). The hired people come back as orders that wait for an
 * answer, marked as the engine's (`HireOrder.engine`), in the plan it hands back alone: they are never taken with it,
 * but the score counts them, and «Til innleie» lists them. The orders the planner has made count as cover. Blocks the
 * planner painted stay, and those the engine painted before are planned again. Whether the FTE the planner typed stays is his choice (`keepTyped`).
 * Nothing is random: the same workspace gives the same plan.
 */

export interface SolveInput {
  ws: Workspace
  /** The rows of the plan, stored and suggested, of the projects to plan. */
  rows: AllocationRow[]
  /** The FTE-days a row needs in all. */
  required: (row: AllocationRow) => number
  windowOf: (row: AllocationRow) => Set<ISODate> | undefined
  /** A row's required hours by the product type of its demand, so that its work is split by stage (`hoursByWorkType`); one stage, its competence's, where not given. */
  hoursByWork?: (row: AllocationRow) => Map<string, number>
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
/** Hours nearer than this are the same. */
const EPS = 0.01

const tenth = (value: number) => Math.round(value * 10) / 10
/** The days each way past a widened span over which what it changes is weighed: who was where steers the days after. */
const MARGIN = 3

interface Job {
  row: AllocationRow
  competence: CompetenceKey
  /** The working days of its window as the hall calendar gives it. */
  window: Set<ISODate>
  /** The days it may be done on, in the order they come: its window, widened where the engine starts earlier. */
  days: ISODate[]
  /** The days next to the window its halls stand free, nearest first. */
  near: ISODate[]
  /** Its project, hall and phase, whose stages keep their order. */
  place: string
  /** Its stage: that of its product types, or of its competence. */
  kind?: Stage
  /** The way its days are planned: a build-up back from the day the exhibitors move in (-1), a tear-down on from the end of the event (1). */
  dir: 1 | -1
  /** Its days in the order they are planned. */
  seq: ISODate[]
  /** The place of its stage among those of its project, hall and phase in the order its days are planned, a build-up's
   * last stage first; -1 for a competence with none in that order. */
  step: number
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

interface Staff {
  /** Each person's blocks by day: those there were and those the engine paints. */
  blocks: Map<string, Assignment[]>
  add: (a: Assignment) => void
  /** The free normal time of a person on a day. */
  free: (personId: string, date: ISODate) => Interval[]
  /** The block of a person nearest a day on the nearest day before it (`dir` 1) or after it (-1), within a few days. */
  before: (personId: string, date: ISODate, dir: 1 | -1) => Assignment | undefined
}

const dayKey = (personId: string, date: ISODate) => `${personId}|${date}`

/** The three days before a day (`dir` 1) or after it (-1), nearest first; asked for again and again, so kept. */
const near3 = new Map<string, ISODate[]>()
const daysNear = (date: ISODate, dir: 1 | -1): ISODate[] => {
  const key = `${date}|${dir}`
  let days = near3.get(key)
  if (!days) near3.set(key, (days = [1, 2, 3].map((gap) => addDays(date, -gap * dir))))
  return days
}


const staffOf = (ws: Workspace, kept: readonly Assignment[]): Staff => {
  const wd = ws.settings.workday
  const blocks = new Map<string, Assignment[]>()
  // The last and the first block of each person's day, so the day before and after are found without going through the season.
  const last = new Map<string, Assignment>()
  const first = new Map<string, Assignment>()
  const add = (a: Assignment) => {
    const key = dayKey(a.personId, a.date)
    pushTo(blocks, key, a)
    const was = last.get(key)
    if (!was || a.end > was.end) last.set(key, a)
    const early = first.get(key)
    if (!early || a.start < early.start) first.set(key, a)
  }
  kept.forEach(add)
  // Each person's normal time on a day, which the engine asks for again and again.
  const normal = new Map<string, Interval[]>()
  const normalOf = (personId: string, date: ISODate) => {
    const key = dayKey(personId, date)
    let windows = normal.get(key)
    if (!windows) normal.set(key, (windows = normalWindows(personId, date, ws.unavailability ?? [], wd)))
    return windows
  }
  return {
    blocks,
    add,
    free: (personId, date) => freeIntervals(normalOf(personId, date), blocks.get(dayKey(personId, date)) ?? [], wd.snap),
    before: (personId, date, dir) => {
      for (const day of daysNear(date, dir)) {
        const found = (dir === 1 ? last : first).get(dayKey(personId, day))
        if (found) return found
      }
      return undefined
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

/** Someone who can be put on work: a permanent person, or one hired in from a supplier. */
interface Staffer {
  id: string
  competences: CompetenceKey[]
  order: number
  /** For one hired in: the supplier. */
  supplierId?: string
}

/** The id of a hired person is of this shape, so a block of one is told from one of the permanent staff. */
const HIRE = 'hire:'
const isHired = (personId: string) => personId.startsWith(HIRE)

/**
 * The people who can take a job on a day, best first: who did the same row the day before (the day after, for a job
 * planned backwards), who did the same competence
 * or the one before it in its chain, then who changes nothing else; and among those, who has the fewest competences.
 */
const candidates = (ws: Workspace, staff: Staff, job: Job, date: ISODate, nextOf: Map<CompetenceKey, CompetenceKey | undefined>, people: readonly Staffer[]) => {
  const wd = ws.settings.workday
  const rank = (personId: string): number => {
    const before = staff.before(personId, date, job.dir)
    if (!before) return 2
    if (before.competence !== job.competence) return nextOf.get(before.competence) === job.competence ? 1.5 : 3
    const sameProject = numberKey(before.projectNo ?? '') === numberKey(job.row.projectNo)
    const sameHall = hallKey(before.hall) === hallKey(job.row.hall)
    return sameProject && sameHall ? 0 : sameHall ? 0.5 : 1
  }
  return people
    .filter((person) => person.competences.includes(job.competence))
    .map((person) => {
      const free = staff.free(person.id, date)
      return { person, free, paid: paidTotal(free, wd), rank: rank(person.id) }
    })
    .filter((c) => c.paid >= SMALLEST)
    .sort((a, b) => a.rank - b.rank || a.person.competences.length - b.person.competences.length || a.person.order - b.person.order)
}

/**
 * Paints people on a job's day until its hours are covered or nobody is left; returns the hours nobody could take. Of
 * those as good for continuity, one hired in that day comes first, as the day is paid for. Each person is given whole
 * tenths of a day, as the plan counts them, so the FTE of a day are just what its blocks give: a tenth rounded up
 * would show as hours nobody covers, one rounded down as work left for the days after.
 */
const staffDay = (ws: Workspace, staff: Staff, job: Job, date: ISODate, hours: number, nextOf: Map<CompetenceKey, CompetenceKey | undefined>, makeId: () => string, people: readonly Staffer[], maxRank = Infinity): number => {
  const wd = ws.settings.workday
  const tenthOfDay = ws.settings.hoursPerDay / 10
  const tenths = (value: number) => Math.floor((value + EPS) / tenthOfDay) * tenthOfDay
  let left = hours
  const done = new Set<string>()
  // Who can take it, worked out once: painting one of them changes nobody else's day.
  const pool = candidates(ws, staff, job, date, nextOf, people).filter((c) => c.rank <= maxRank && tenths(c.paid) > EPS)
  while (left >= tenthOfDay - EPS) {
    // Among those as good for continuity, the one whose free time fits what is left best: who can take it all with the
    // least to spare, else who has the most, so the work goes to as few people as can be and leaves no scraps.
    const fit = (free: number) => (free >= left - EPS ? free - left : 1000 - free)
    const pick = pool
      .filter((c) => !done.has(c.person.id))
      .sort((a, b) => a.rank - b.rank || Number(!!b.person.supplierId) - Number(!!a.person.supplierId) || fit(tenths(a.paid)) - fit(tenths(b.paid)) || a.person.competences.length - b.person.competences.length || a.person.order - b.person.order)[0]
    if (!pick) break
    const { person, free } = pick
    done.add(person.id)
    let want = tenths(Math.min(left, pick.paid))
    for (const iv of free) {
      if (want < SMALLEST) break
      const piece = cut(iv, want, wd.snap, wd)
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
      want -= paid
    }
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
        (!a.hall || hallKey(a.hall) === hallKey(job.row.hall)),
    )
    .reduce((sum, a) => sum + paidHours(a, wd), 0)

/** What a block is work of, as far as moving between pieces of it changes nothing: competence, project and place. */
const workKey = (a: Pick<Assignment, 'competence' | 'projectNo' | 'hall'>) => `${a.competence}|${numberKey(a.projectNo ?? '')}|${hallKey(a.hall)}`

/**
 * The engine's blocks of a day shared out again, competence by competence, so that each person has as few pieces of
 * work as can be: the hours of each piece of work and the time each person gives the competence stay as they were, but
 * the biggest pieces get whole people first, the one who did a piece the day before keeps it, and what is left of a
 * piece goes to the person it fits best. Pieces of a person that meet are one block.
 */
export const consolidate = (painted: Assignment[], wd: Workspace['settings']['workday'], makeId: () => string): Assignment[] => {
  const byDay = new Map<string, Assignment[]>()
  for (const a of painted) pushTo(byDay, `${a.date}|${a.competence}`, a)
  const lastWork = new Map<string, string>()
  const out: Assignment[] = []
  for (const key of [...byDay.keys()].sort()) {
    const blocks = byDay.get(key)!
    const slots = new Map<string, Interval[]>()
    const need = new Map<string, { hours: number; sample: Assignment }>()
    for (const a of blocks) {
      pushTo(slots, a.personId, { start: a.start, end: a.end })
      const work = need.get(workKey(a)) ?? { hours: 0, sample: a }
      work.hours += paidHours(a, wd)
      need.set(workKey(a), work)
    }
    const room = new Map([...slots].map(([personId, ivs]) => [personId, paidTotal(ivs, wd)]))
    const given = new Map<string, { work: string; hours: number }[]>()
    const give = (personId: string, work: string, hours: number) => {
      pushTo(given, personId, { work, hours })
      room.set(personId, room.get(personId)! - hours)
    }
    for (const [work, { hours }] of [...need].sort(([, a], [, b]) => b.hours - a.hours)) {
      let left = hours
      while (left > EPS) {
        const open = [...room].filter(([, r]) => r > EPS)
        if (!open.length) break
        const kept = (personId: string) => (lastWork.get(personId) === work ? 0 : 1)
        // Whole people first, the one who had the work the day before before the others, then the one with the most room.
        const whole = open.filter(([, r]) => r <= left + EPS).sort(([a, ra], [b, rb]) => kept(a) - kept(b) || rb - ra)
        if (whole.length) {
          const [personId, r] = whole[0]
          give(personId, work, r)
          left -= r
          continue
        }
        // What is left goes to the one it fits best: the least room that takes it all.
        const [personId] = open.sort(([a, ra], [b, rb]) => kept(a) - kept(b) || ra - rb)[0]
        give(personId, work, left)
        left = 0
      }
    }
    for (const [personId, pieces] of given) {
      // Yesterday's work first, so the day goes on from where it ended.
      pieces.sort((a, b) => (lastWork.get(personId) === b.work ? 1 : 0) - (lastWork.get(personId) === a.work ? 1 : 0))
      const free = [...slots.get(personId)!].sort((a, b) => a.start - b.start)
      let at = 0
      pieces.forEach((piece, index) => {
        let hours = piece.hours
        const sample = need.get(piece.work)!.sample
        while (at < free.length && (hours > EPS || index === pieces.length - 1)) {
          const slot = free[at]
          const part = index === pieces.length - 1 ? slot : cut(slot, hours, wd.snap, wd)
          const previous = out.at(-1)
          if (previous && previous.personId === personId && previous.date === sample.date && workKey(previous) === piece.work && previous.end === part.start) previous.end = part.end
          else out.push({ ...sample, id: makeId(), personId, start: part.start, end: part.end })
          hours -= paidHours(part, wd)
          if (part.end >= slot.end) at++
          else free[at] = { start: part.end, end: slot.end }
        }
      })
      lastWork.set(personId, pieces.at(-1)!.work)
    }
  }
  return out
}

/**
 * Each person's day laid out so that each project, and within it each hall, is one stretch: what the person ended the
 * day before with comes first, then the rest of that project, then the other projects one after the other. The time the
 * person gives the engine's work and the hours of each piece stay as they were; only their order in the day changes, so
 * a day is A then B, never A, B and A again (the planner, 2026-10-25).
 */
export const inStretches = (painted: Assignment[], wd: Workspace['settings']['workday'], makeId: () => string): Assignment[] => {
  const byDay = new Map<string, Assignment[]>()
  for (const a of painted) pushTo(byDay, `${a.date}|${a.personId}`, a)
  const lastWork = new Map<string, Assignment>()
  const out: Assignment[] = []
  for (const key of [...byDay.keys()].sort()) {
    const blocks = byDay.get(key)!.sort((a, b) => a.start - b.start)
    const personId = blocks[0].personId
    const pieces = new Map<string, { sample: Assignment; hours: number }>()
    for (const a of blocks) {
      const piece = pieces.get(workKey(a)) ?? { sample: a, hours: 0 }
      piece.hours += paidHours(a, wd)
      pieces.set(workKey(a), piece)
    }
    const before = lastWork.get(personId)
    const first = before && pieces.has(workKey(before)) ? before : blocks[0]
    const sameProject = (a: Assignment) => numberKey(a.projectNo ?? '') === numberKey(first.projectNo ?? '')
    const sameHall = (a: Assignment) => sameProject(a) && hallKey(a.hall) === hallKey(first.hall)
    const order = [...pieces.values()].sort(
      (a, b) =>
        Number(workKey(b.sample) === workKey(first)) - Number(workKey(a.sample) === workKey(first)) ||
        Number(sameHall(b.sample)) - Number(sameHall(a.sample)) ||
        Number(sameProject(b.sample)) - Number(sameProject(a.sample)) ||
        numberKey(a.sample.projectNo ?? '').localeCompare(numberKey(b.sample.projectNo ?? '')) ||
        hallKey(a.sample.hall).localeCompare(hallKey(b.sample.hall)) ||
        a.sample.competence.localeCompare(b.sample.competence),
    )
    const free = blocks.map((a) => ({ start: a.start, end: a.end }))
    let at = 0
    order.forEach((piece, index) => {
      let hours = piece.hours
      while (at < free.length && (hours > EPS || index === order.length - 1)) {
        const slot = free[at]
        const part = index === order.length - 1 ? slot : cut(slot, hours, wd.snap, wd)
        const previous = out.at(-1)
        if (previous && previous.personId === personId && previous.date === piece.sample.date && workKey(previous) === workKey(piece.sample) && previous.end === part.start) previous.end = part.end
        else out.push({ ...piece.sample, id: makeId(), start: part.start, end: part.end })
        hours -= paidHours(part, wd)
        if (part.end >= slot.end) at++
        else free[at] = { start: part.end, end: slot.end }
      }
    })
    lastWork.set(personId, order.at(-1)!.sample)
  }
  return out
}

export interface Solution {
  /** The workspace with the engine's plan for every project. */
  workspace: Workspace
  /** The projects the engine planned, by their number as written. */
  projects: string[]
  /** The days the engine works in a hall outside the project's window, for the planner to tell Venyou: by project, hall and day. */
  outside: OutsideDay[]
  /** The rows given, as the engine leaves them, in the same order: a suggested row it put FTE on is the stored row it became. */
  rows: AllocationRow[]
  /** The people the engine hires in, each for one run of working days. */
  hired: HiredRun[]
}

/** One person hired in for a run of working days, as «Til innleie» lists it. */
export interface HiredRun {
  supplierId: string
  /** The competence the person was hired for, and those further along its chain the person went on to. */
  competences: CompetenceKey[]
  /** The days, in order. */
  dates: ISODate[]
  /** The projects the person worked for, by their number as written. */
  projectNos: string[]
}

export interface OutsideDay {
  projectNo: string
  projectName: string
  /** The row's hall or place; empty for a row of all the project's halls. */
  hall: string
  date: ISODate
}

export const solve = ({ ws, rows, required, windowOf, hoursByWork, nearby = () => [], keepTyped, makeId = () => `eng-${crypto.randomUUID()}` }: SolveInput): Solution => {
  const wd = ws.settings.workday
  const perDay = ws.settings.hoursPerDay
  const styles = competenceStyles(ws)
  const styleOf = new Map<CompetenceKey, CompetenceStyle & { index: number }>(styles.map((style, index) => [style.key, { ...style, index }]))
  const nextOf = new Map(styles.map((style) => [style.key, style.next]))
  const weights = weightsOf(ws.settings)
  const costOfHire = hireCost(styles, weights)
  const persons: Staffer[] = ws.persons ?? []
  const dayShift = shiftTimes('dag', wd)
  // The supplier a competence is hired from: the first in the planner's order who offers it for the day shift.
  const suppliers = [...(ws.suppliers ?? [])].sort((a, b) => a.order - b.order)
  const supplierFor = (competence: CompetenceKey): Supplier | undefined => suppliers.find((s) => s.competences.includes(competence) && s.shifts.includes('dag'))

  // What stays: the planner's blocks, and, if he wants, the FTE he typed.
  const kept = okAssignments({ ...ws, assignments: (ws.assignments ?? []).filter((a) => a.source !== 'suggested') })
  const fixedOf = (row: AllocationRow): Record<ISODate, number> => {
    if (isSuggestedRow(row) || !keepTyped) return {}
    const engine = new Set(row.engine ?? [])
    return Object.fromEntries(Object.entries(row.fte).filter(([date, fte]) => fte && !engine.has(date)))
  }

  /**
   * One plan of every job, steps 1 to 3 above, with each project, hall and phase given the free days `extra` next to its
   * window as days of it. Hands back the jobs, the people and the hours nobody took, by project, hall and phase.
   */
  const planWith = (extra: Map<string, ISODate[]>) => {
    // 1. The jobs: each row's demand in its window, widened by `extra`, with the place of its stage among those of its
    // project, hall and phase.
    const jobs: Job[] = []
    const byPlace = new Map<string, Job[]>()
    for (const row of rows) {
      const window = windowOf(row)
      const competence = competenceKey(row.competence)
      if (!window?.size || !competence || !row.phase) continue
      const fixed = fixedOf(row)
      const need = tenth(required(row) - Object.values(fixed).reduce((sum, v) => sum + v, 0))
      const style = styleOf.get(competence)
      const place = stagePlace(row)
      const own = workdaysOf(window)
      const days = [...new Set([...own, ...(extra.get(place) ?? [])])].sort()
      // A row's work is split by the stage of its product types, as built-up floor is carpentry on the floor; the FTE the
      // planner typed goes with the stage that has the most of it.
      const byStage = new Map<Stage | undefined, number>()
      for (const [workType, hours] of hoursByWork?.(row) ?? []) {
        const kind = stageOfType(ws.kpi, workType, style?.stage)
        byStage.set(kind, (byStage.get(kind) ?? 0) + hours)
      }
      if (!byStage.size) byStage.set(style?.stage, 1)
      const total = [...byStage.values()].reduce((sum, hours) => sum + hours, 0) || 1
      const most = [...byStage].sort(([, a], [, b]) => b - a)[0][0]
      const dir = row.phase === 'Montering' ? -1 : 1
      const seq = dir === 1 ? days : [...days].reverse()
      for (const [kind, hours] of byStage) {
        const job: Job = { row, competence, kind, window: new Set(own), days, dir, seq, near: nearby(row), place, step: -1, need: tenth((need * hours) / total), min: style?.minPerHall ?? 0, rank: style?.index ?? styles.length, fte: kind === most ? { ...fixed } : {} }
        jobs.push(job)
        pushTo(byPlace, place, job)
      }
    }
    const stagesIn = new Map<string, number>()
    for (const [place, group] of byPlace) {
      const present = stagesOf(group[0].row.phase, stageOrderOf(ws.settings)).filter((stage) => group.some((job) => job.kind === stage))
      stagesIn.set(place, present.length)
      for (const job of group) {
        const stage = job.kind ? present.indexOf(job.kind) : -1
        job.step = stage < 0 || job.dir === 1 ? stage : present.length - 1 - stage
      }
    }

    // 2. A day at a time, the days and the people together, so that work goes where someone is free (the planner,
    // 2026-10-25: no day piled over the crew while people stand idle the next), a build-up's days from its last. On a day,
    // a job is open once the stage before it in the order its days are planned has begun, the day before where the window
    // itself has a day for each stage; a running competence once the walls have. The open jobs are given, first, what they
    // must do that day to be done in time, spread over the days they have left, the most pressed first and the stages in
    // the order they are planned; and then what people are still free for, so nobody stands idle while there is work that
    // can be begun. Each time, those who were in the hall for the project the day before (or after) come back first, then
    // those who were in the hall, and only then the others.
    const staff = staffOf(ws, kept)
    // The orders the planner has made, answered or not, cover a project's competence on a day, once over its jobs.
    const ordered = new Map<string, number>()
    for (const order of ws.hireOrders ?? []) {
      const key = `${order.competence}|${numberKey(order.projectNo ?? '')}|${order.date}`
      ordered.set(key, (ordered.get(key) ?? 0) + order.fte * hireHours(order, wd))
    }
    const orderCover = (job: Job, date: ISODate, most: number): number => {
      const key = `${job.competence}|${numberKey(job.row.projectNo)}|${date}`
      const hours = Math.min(most, ordered.get(key) ?? 0)
      if (hours > 0) ordered.set(key, ordered.get(key)! - hours)
      return hours
    }
    // The people hired in, and what their work costs, by place and by day, for the widening to weigh.
    const hires: Staffer[] = []
    const hiredAt = new Map<string, number>()
    const costOn = new Map<ISODate, number>()
    const cost = (date: ISODate, value: number) => costOn.set(date, (costOn.get(date) ?? 0) + value)
    // The hired people at work on each day, as they are put on work.
    const hiredOn = new Map<ISODate, Set<Staffer>>()
    const working = (worker: Staffer, date: ISODate) => staff.blocks.has(dayKey(worker.id, date))
    const poolOf = (date: ISODate): Staffer[] => (hiredOn.get(date)?.size ? [...persons, ...hiredOn.get(date)!] : persons)
    const newHire = (supplier: Supplier, competence: CompetenceKey): Staffer => {
      const competences = [competence]
      for (let next = nextOf.get(competence); next && supplier.competences.includes(next) && !competences.includes(next); next = nextOf.get(next)) competences.push(next)
      const hire = { id: `${HIRE}${supplier.id}:${competence}:${hires.length}`, competences, order: 10000 + hires.length, supplierId: supplier.id }
      hires.push(hire)
      return hire
    }
    // Hires people for hours of a job on a day: those on a run of days who worked the day before first, the one whose
    // work changes least, else a new one, for half a day's work at the least unless `small`. Returns the hours nobody
    // could take, as no supplier offers the competence.
    const hireFor = (job: Job, date: ISODate, hours: number, small: boolean): number => {
      const before = job.dir === 1 ? workdayBefore(date) : workdayAfter(date)
      let rest = hours
      while (rest >= SMALLEST) {
        // One hired in today with time left is paid for the day already; then one who worked yesterday.
        const today = candidates(ws, staff, job, date, nextOf, [...(hiredOn.get(date) ?? [])]).filter((c) => c.paid >= perDay / 10 - EPS)
        const going = [...(hiredOn.get(before) ?? [])].filter((hire) => !working(hire, date))
        let hire = today[0]?.person ?? candidates(ws, staff, job, date, nextOf, going)[0]?.person
        if (!hire) {
          const supplier = supplierFor(job.competence)
          if (!supplier || (!small && rest < perDay / 2 - EPS)) break
          hire = newHire(supplier, job.competence)
          cost(date, weights.hireStart)
        }
        const was = rest
        rest = staffDay(ws, staff, job, date, rest, nextOf, makeId, [hire])
        if (rest > was - SMALLEST) break
        if (!hiredOn.has(date)) hiredOn.set(date, new Set())
        hiredOn.get(date)!.add(hire)
      }
      hiredAt.set(job.place, (hiredAt.get(job.place) ?? 0) + (hours - rest) * costOfHire(job.competence))
      cost(date, (hours - rest) * costOfHire(job.competence))
      return rest
    }
    const left = new Map(jobs.map((job) => [job, job.need]))
    // Whether a day comes before another in the order a job's days are planned.
    const ahead = (job: Job, a: ISODate, b: ISODate) => (job.dir === 1 ? a < b : a > b)
    // The first day of each job in the order its days are planned: a build-up's last day.
    const began = new Map<Job, ISODate>()
    // The furthest day of each job in that order, by its place in it: a build-up's first day.
    const reach = new Map<Job, number>()
    for (const job of jobs) {
      const days = job.seq.filter((date) => job.fte[date])
      if (days.length) began.set(job, days[0])
      if (days.length) reach.set(job, job.seq.indexOf(days.at(-1)!))
    }
    // The most days a job's work can take: done by the fewest it is done by, or by one person.
    const slowest = (job: Job) => Math.max(1, Math.ceil(left.get(job)! / Math.max(1, job.min) - 1e-9))
    const hasWork = (job: Job) => job.need > NOISE || Object.keys(job.fte).length > 0
    const isOpen = (job: Job, date: ISODate): boolean => {
      const group = byPlace.get(job.place)!
      const at = job.seq.indexOf(date)
      // Work of a build-up whose days run out is open whatever the stages after it do, so it is not left undone.
      if (job.dir === -1 && job.step !== 0 && daysLeft(job, date) <= slowest(job)) return true
      if (job.kind === 'lopende') {
        const walls = group.filter((other) => other.kind === 'standbygging' && hasWork(other))
        if (!walls.length) return true
        // Running work goes with the walls: not before they are begun. Planned forwards, it opens once they have begun;
        // planned backwards, it may go on after they are done, but not to a day before the first day they have.
        if (job.dir === 1) return walls.some((wall) => began.has(wall) && began.get(wall)! <= date)
        return walls.some((wall) => began.has(wall) && (left.get(wall)! > NOISE || at <= reach.get(wall)!))
      }
      if (job.step <= 0) return true
      const before = group.filter((other) => other.step >= 0 && other.step < job.step && hasWork(other))
      if (!before.length) return true
      const last = Math.max(...before.map((other) => other.step))
      const prev = before.filter((other) => other.step === last)
      if (!prev.every((other) => began.has(other))) return false
      // The stage before, in the order the days are planned, must have begun a day before, or the same day where the
      // window is short: so a build-up's stages end in their order.
      const lag = workdaysOf(job.window).length >= stagesIn.get(job.place)! ? 1 : 0
      if (prev.some((other) => job.seq.indexOf(began.get(other)!) > at - lag)) return false
      if (job.dir === 1) return true
      // Planned backwards, a build-up's stages must begin in their order too, or the hall is marked out on the day the
      // exhibitors move in: a stage is opened only once its work, at its slowest, would reach back to the day before the
      // stage after it begins, as far as that stage's pace so far says when that is.
      const begins = prev.map((other) => {
        const rest = left.get(other)!
        if (rest <= NOISE) return reach.get(other)!
        const placed = Object.values(other.fte).filter((fte) => fte > NOISE)
        const pace = placed.reduce((sum, fte) => sum + fte, 0) / Math.max(1, placed.length)
        return Math.max(reach.get(other)!, at + Math.ceil(rest / Math.max(pace, NOISE) - 1e-9))
      })
      return at + slowest(job) - 1 >= Math.max(...begins) + lag
    }
    const daysLeft = (job: Job, date: ISODate) => job.seq.length - job.seq.indexOf(date)
    // The places with work on a day: a day outside a window is begun for half a day's work or more, as it costs a day of
    // the hall that Venyou must block.
    const placeOn = new Set<string>()
    const onDay = (job: Job, date: ISODate) => `${job.place}|${date}`
    const opens = (job: Job, date: ISODate, hours: number) => job.window.has(date) || placeOn.has(onDay(job, date)) || hours >= perDay / 2 - EPS
    const take = (job: Job, date: ISODate, took: number) => {
      placeOn.add(onDay(job, date))
      reach.set(job, Math.max(reach.get(job) ?? -1, job.seq.indexOf(date)))
      job.fte[date] = tenth((job.fte[date] ?? 0) + took)
      left.set(job, tenth(left.get(job)! - took))
      if (!began.has(job) || ahead(job, date, began.get(job)!)) began.set(job, date)
    }
    // People are given whole tenths of a day (`staffDay`), so what they do is the plan's FTE as it stands.
    const record = (job: Job, date: ISODate, hours: number) => {
      const took = tenth(hours / perDay)
      if (took > NOISE) take(job, date, took)
    }
    // What a job is given on a day, and what is left of it with that, where less than half a day would be left over: a
    // scrap left for later days asks a day of its own, often outside the window.
    const amount = (job: Job, fte: number) => (left.get(job)! - fte < 0.5 ? left.get(job)! : Math.min(left.get(job)!, fte))
    const give = (job: Job, date: ISODate, fte: number, maxRank: number) => {
      const wanted = amount(job, fte) * perDay
      if (wanted < SMALLEST) return
      if (!opens(job, date, Math.min(wanted, candidates(ws, staff, job, date, nextOf, poolOf(date)).filter((c) => c.rank <= maxRank).reduce((sum, c) => sum + c.paid, 0)))) return
      // A day outside the window costs a day of the hall: who is free must be able to do half a day's work there.
      record(job, date, wanted - staffDay(ws, staff, job, date, wanted, nextOf, makeId, poolOf(date), maxRank))
    }
    // People are hired for what the permanent staff could not do of a job's share of the day: half a day's work at the
    // least, as less waits for the days after, but on the last day of the job, and where the job has begun and would
    // otherwise have no one that day, a quiet day in the middle of its span.
    const hire = (job: Job, date: ISODate, fte: number) => {
      const wanted = amount(job, fte) * perDay
      const small = daysLeft(job, date) <= 1 || (!job.fte[date] && began.has(job) && ahead(job, began.get(job)!, date))
      if (wanted < SMALLEST || (wanted < perDay / 2 && !small) || !opens(job, date, wanted)) return
      record(job, date, wanted - hireFor(job, date, wanted, small))
    }
    // What a job may be given over its share: anything while its crew has not yet gone down, and once it has, no more
    // than it had the day before, so no day in the middle of its span is quieter than the days around it.
    const roomOf = (job: Job, date: ISODate): number => {
      const at = job.seq.indexOf(date)
      let went = false
      for (let i = 1; i < at && !went; i++) went = (job.fte[job.seq[i]] ?? 0) < (job.fte[job.seq[i - 1]] ?? 0) - NOISE
      if (!went || at < 1) return left.get(job)!
      return Math.max(0, (job.fte[job.seq[at - 1]] ?? 0) - (job.fte[date] ?? 0))
    }
    jobs.sort((a, b) => a.rank - b.rank || hallKey(a.row.hall).localeCompare(hallKey(b.row.hall), 'nb', { numeric: true }))
    const openFrom = new Map<Job, ISODate>()
    const extraWork = (job: Job) => job.kind === 'ekstra'
    const planDay = (jobs: Job[], date: ISODate) => {
      // The FTE the planner typed is staffed first, as he put it.
      for (const job of jobs) {
        const typed = fixedOf(job.row)[date]
        if (!typed) continue
        const hours = typed * perDay - ownCover(kept, job, date, wd)
        if (hours >= SMALLEST) staffDay(ws, staff, job, date, hours, nextOf, makeId, poolOf(date))
      }
      // A job's share of the day: what it has left over the days it has left, as it stands when it opens that day.
      const share = new Map<Job, number>()
      const due = (job: Job) => Math.max(job.min, Math.ceil(share.get(job)! - 1e-9))
      const pressed = (job: Job) => left.get(job)! / Math.max(1, daysLeft(job, date))
      // Jobs are opened in rounds, as a stage begun today can open the next today where the window is short.
      const done = new Set<Job>()
      for (let round = 0; round < 8; round++) {
        const open = jobs.filter((job) => !done.has(job) && left.get(job)! > NOISE && job.days.includes(date) && isOpen(job, date))
        if (!open.length) break
        for (const job of open) {
          done.add(job)
          share.set(job, pressed(job))
          if (!openFrom.has(job)) openFrom.set(job, date)
        }
        open.sort((a, b) => Number(extraWork(a)) - Number(extraWork(b)) || pressed(b) - pressed(a) || a.step - b.step || a.rank - b.rank)
        // Work no supplier offers is given its share first, by whoever has the competence, as nobody can be hired for it.
        for (const job of open) if (!supplierFor(job.competence)) give(job, date, due(job) - (job.fte[date] ?? 0), Infinity)
        for (const maxRank of [0, 0.5, Infinity]) for (const job of open) give(job, date, due(job) - (job.fte[date] ?? 0), maxRank)
        for (const job of open) hire(job, date, Math.max(job.min, share.get(job)!) - (job.fte[date] ?? 0))
        for (const job of open) give(job, date, roomOf(job, date), Infinity)
      }
    }
    // The planner's own blocks and orders count first, on every day they are on, before any day is planned: a build-up
    // planned backwards comes to them last.
    for (const job of jobs)
      for (const date of job.seq) {
        const ownHours = ownCover(kept, job, date, wd)
        const own = Math.min(left.get(job)!, Math.floor(((ownHours + orderCover(job, date, Math.max(0, left.get(job)! * perDay - ownHours))) / perDay) * 10 + 1e-6) / 10)
        if (own > NOISE) take(job, date, own)
      }
    // The build-ups first, each back from the day the exhibitors move in, so the days of the window are filled from its
    // end and a day before it is used only for what the window cannot hold; the tear-downs then, each on from the end of
    // the event, with the people the build-ups leave.
    for (const dir of [-1, 1] as const) {
      const pass = jobs.filter((job) => job.dir === dir)
      const dates = [...new Set(pass.flatMap((job) => job.days))].sort()
      for (const date of dir === 1 ? dates : dates.reverse()) planDay(pass, date)
    }

    // 3. What nobody could take stays in the plan, uncovered, spread over the days the job was open, or the half of
    // its days planned last where it never was, for Bemanning and Innleid to show.
    const uncovered = new Map<string, number>()
    for (const job of jobs) {
      const rest = left.get(job)!
      if (rest <= NOISE) continue
      const from = openFrom.get(job)
      const open = from ? job.days.filter((date) => !ahead(job, date, from)) : job.seq.slice(Math.floor(job.seq.length / 2))
      // In the window where it has days there, so no day outside it is asked of Venyou for work nobody does.
      const days = open.some((date) => job.window.has(date)) ? open.filter((date) => job.window.has(date)) : open
      shareOverDays(rest, days.length).forEach((part, i) => {
        if (!part) return
        job.fte[days[i]] = tenth((job.fte[days[i]] ?? 0) + part)
        cost(days[i], part * perDay * weights.uncovered)
      })
      uncovered.set(job.place, (uncovered.get(job.place) ?? 0) + rest * perDay)
    }
    // What each place costs: its uncovered hours and its hired ones.
    const byPlaceCost = new Map(hiredAt)
    for (const [place, hours] of uncovered) byPlaceCost.set(place, (byPlaceCost.get(place) ?? 0) + hours * weights.uncovered)
    return { jobs, byPlace, staff, hires, cost: byPlaceCost, costOn }
  }

  // Where the permanent staff cannot do it all, the window is widened onto all the free days next to it, and everything of
  // that project, hall and phase is planned again over the widened span; a day the plan does not use is not listed for
  // Venyou. A widening stays only where it pays: what the uncovered and hired hours of every project cost over its days,
  // against a day the hall is used outside its phases. The people a widened project takes may leave another project
  // short, so a widening is weighed by what all projects cost over its days, not by its own alone. Those days are a few
  // more each way than its span, as who was where the days before steers who is put where. The places are tried the
  // costliest first, in rounds of places whose days lie apart, so one plan weighs each of a round alone.
  const extra = new Map<string, ISODate[]>()
  const stopped = new Set<string>()
  let result = planWith(extra)
  const costOver = (plan: typeof result, from: ISODate, to: ISODate) => {
    let sum = 0
    for (const [date, value] of plan.costOn) if (date >= from && date <= to) sum += value
    return sum
  }
  for (let pass = 0; pass < 3; pass++) {
    const wanting = [...result.cost]
      .filter(([place, cost]) => cost >= weights.outsideWindow && !stopped.has(place))
      .sort(([pa, a], [pb, b]) => b - a || pa.localeCompare(pb))
      .flatMap(([place]) => {
        const group = result.byPlace.get(place)!
        const used = extra.get(place) ?? []
        const free = group[0].near.filter((date) => !used.includes(date))
        if (!free.length) return []
        const days = [...free, ...group.flatMap((job) => job.days)].sort()
        return [{ place, used, free, from: addDays(days[0], -MARGIN), to: addDays(days.at(-1)!, MARGIN) }]
      })
    if (!wanting.length) break
    while (wanting.length) {
      const round: typeof wanting = []
      for (const place of wanting) if (round.every((other) => place.to < other.from || other.to < place.from)) round.push(place)
      for (const place of round) wanting.splice(wanting.indexOf(place), 1)
      // All the free days at once: a stage short of people needs the days before it that the stages before it can then use.
      for (const { place, used, free } of round) extra.set(place, [...used, ...free])
      const next = planWith(extra)
      let undone = false
      for (const { place, used, free, from, to } of round) {
        if (costOver(result, from, to) - costOver(next, from, to) >= free.length * weights.outsideWindow) continue
        extra.set(place, used)
        stopped.add(place)
        undone = true
      }
      result = undone ? planWith(extra) : next
    }
  }
  const { jobs, staff, hires } = result

  // The rows as the engine leaves them, the FTE of their jobs added up and the days it wrote marked; a suggested row
  // with FTE becomes a stored row.
  const fteOf = new Map<string, { row: AllocationRow; fte: Record<ISODate, number> }>()
  for (const job of jobs) {
    const entry = fteOf.get(job.row.id) ?? { row: job.row, fte: {} }
    for (const [date, fte] of Object.entries(job.fte)) entry.fte[date] = tenth((entry.fte[date] ?? 0) + fte)
    fteOf.set(job.row.id, entry)
  }
  let order = Math.max(-1, ...ws.allocations.map((row) => row.order))
  const projects = new Set<string>()
  const allocations = ws.allocations.map((row) => {
    const planned = fteOf.get(row.id)?.fte
    if (!planned) return row
    projects.add(row.projectNo)
    const fixed = fixedOf(row)
    const engine = Object.keys(planned).filter((date) => !(date in fixed)).sort()
    const same = Object.keys(planned).length === Object.keys(row.fte).filter((date) => row.fte[date]).length && Object.entries(planned).every(([date, fte]) => row.fte[date] === fte)
    if (same && engine.join() === (row.engine ?? []).join()) return row
    return { ...row, fte: planned, ...(engine.length ? { engine } : { engine: undefined }) }
  })
  const became = new Map<string, AllocationRow>()
  for (const { row, fte } of fteOf.values()) {
    if (!isSuggestedRow(row) || !Object.keys(fte).length) continue
    projects.add(row.projectNo)
    const stored = { ...row, id: `row-${makeId()}`, order: ++order, fte, notes: {}, engine: Object.keys(fte).sort() }
    allocations.push(stored)
    became.set(row.id, stored)
  }
  const solvedRows = new Map(allocations.map((row) => [row.id, row]))
  const outside = new Map<string, OutsideDay>()
  for (const job of jobs) {
    for (const date of Object.keys(job.fte))
      if (!job.window.has(date) && job.near.includes(date)) {
        const hall = (job.row.hall ?? '').trim()
        outside.set(`${numberKey(job.row.projectNo)}|${hallKey(hall)}|${date}`, { projectNo: job.row.projectNo, projectName: job.row.projectName, hall, date })
      }
  }
  const blocks = [...staff.blocks.values()].flat().filter((a) => a.source === 'suggested')
  const painted = inStretches(consolidate(blocks.filter((a) => !isHired(a.personId)), wd, makeId), wd, makeId)
  const assignments = [...(ws.assignments ?? []).filter((a) => a.source !== 'suggested'), ...painted]
  const { drafts, hired } = hiredOrders(blocks.filter((a) => isHired(a.personId)), hires, dayShift, wd, makeId)
  return {
    workspace: { ...ws, allocations, assignments, hireOrders: [...(ws.hireOrders ?? []), ...drafts] },
    projects: [...projects],
    rows: rows.map((row) => became.get(row.id) ?? solvedRows.get(row.id) ?? row),
    outside: [...outside.values()].sort((a, b) => a.hall.localeCompare(b.hall, 'nb') || a.date.localeCompare(b.date)),
    hired,
  }
}

/**
 * The hired people's work as orders that wait for an answer: a person is paid for the day shift, which is shared on the
 * competences and projects the person worked for that day by their hours, so a day's orders of a person add up to one.
 * Orders of one supplier, competence, project and day are one. And each person as a run of days.
 */
const hiredOrders = (blocks: Assignment[], hires: Staffer[], shift: Interval, wd: Workspace['settings']['workday'], makeId: () => string): { drafts: HireOrder[]; hired: HiredRun[] } => {
  const supplierOf = new Map(hires.map((hire) => [hire.id, hire.supplierId!]))
  const byDay = new Map<string, Assignment[]>()
  for (const a of blocks) pushTo(byDay, dayKey(a.personId, a.date), a)
  const orders = new Map<string, HireOrder>()
  const runs = new Map<string, HiredRun>()
  for (const day of [...byDay.keys()].sort()) {
    const work = byDay.get(day)!
    const total = work.reduce((sum, a) => sum + paidHours(a, wd), 0)
    if (total <= 0) continue
    const { personId, date } = work[0]
    const supplierId = supplierOf.get(personId)!
    const run = runs.get(personId) ?? { supplierId, competences: [], dates: [], projectNos: [] }
    runs.set(personId, run)
    run.dates.push(date)
    for (const a of work) {
      if (!run.competences.includes(a.competence)) run.competences.push(a.competence)
      if (a.projectNo && !run.projectNos.some((p) => numberKey(p) === numberKey(a.projectNo!))) run.projectNos.push(a.projectNo)
      const key = `${supplierId}|${a.competence}|${numberKey(a.projectNo ?? '')}|${date}`
      const order = orders.get(key) ?? { id: makeId(), supplierId, competence: a.competence, date, fte: 0, start: shift.start, end: shift.end, conf: null, engine: true, ...(a.projectNo ? { projectNo: a.projectNo } : {}) }
      order.fte += paidHours(a, wd) / total
      orders.set(key, order)
    }
  }
  const drafts = [...orders.values()].map((order) => ({ ...order, fte: Math.round(order.fte * 100) / 100 }))
  return { drafts, hired: [...runs.values()].map((run) => ({ ...run, dates: [...new Set(run.dates)].sort() })) }
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
