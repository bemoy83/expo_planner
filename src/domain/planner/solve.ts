import { competenceStyles } from '../competences'
import { pushTo } from '../collections'
import { addDays, type ISODate } from '../dates'
import { hireHours, shiftTimes } from '../hire'
import { dayType, workdayBefore } from '../holidays'
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
 * 2. The days are gone through one at a time. On a day, a job is open once the stage before it in its hall has begun
 *    (R2), the day before where the window has a day for each stage; a running competence once the walls have; a
 *    tear-down the other way round (R9). The open jobs are given, first, what they must do that day to be done in time,
 *    the most pressed first, a competence done by at least so many in a hall that many (R4); and then whatever people
 *    are still free for, so nobody stands idle while work can be begun. Extra work comes last. Each time, those who were
 *    in the hall for the project the day before come back first, then those who were in the hall, then the others,
 *    the fewest competences first (R3, R5).
 *    Where the permanent staff cannot do what a job must do that day, people are hired in (the Claude Doc «Innleie i
 *    planleggingsmotoren»): a hired person is one more person, from the first supplier who offers the competence for the
 *    day shift, kept on from day to day as the permanent staff are, to the next hall or project or along the chain, and
 *    let go when there is no work for a day. Someone is hired only for half a day's work or more, but on a job's last day
 *    or where the job would otherwise have nobody on a day in the middle of its span.
 *    A job given more than its share keeps an even crew: once it has fewer people than the day before, it is given no more
 *    than it had, so no quiet day falls in the middle of its span (the planner, 2026-10-25).
 * 3. What nobody could take stays in the plan, uncovered, spread over its window, for Bemanning and Innleid to show.
 * 4. Where hours are left, the window of the project's hall and phase is widened onto the days before the build-up or
 *    after the tear-down that the hall stands free (`nearby`, R6), and all its work is planned again over the widened
 *    span. Those days are listed for Venyou (`outside`).
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
  /** The place of its stage among those of its project, hall and phase, earliest first; -1 for a competence with none in that order. */
  stage: number
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
  /** The last block of a person on the nearest day before, within a few days. */
  before: (personId: string, date: ISODate) => Assignment | undefined
}

const dayKey = (personId: string, date: ISODate) => `${personId}|${date}`

const staffOf = (ws: Workspace, kept: readonly Assignment[]): Staff => {
  const wd = ws.settings.workday
  const blocks = new Map<string, Assignment[]>()
  // The last block of each person's day, so the day before is found without going through the season.
  const last = new Map<string, Assignment>()
  const add = (a: Assignment) => {
    const key = dayKey(a.personId, a.date)
    pushTo(blocks, key, a)
    const was = last.get(key)
    if (!was || a.end > was.end) last.set(key, a)
  }
  kept.forEach(add)
  return {
    blocks,
    add,
    free: (personId, date) => freeIntervals(normalWindows(personId, date, ws.unavailability ?? [], wd), blocks.get(dayKey(personId, date)) ?? [], wd.snap),
    before: (personId, date) => {
      for (let gap = 1; gap <= 3; gap++) {
        const found = last.get(dayKey(personId, addDays(date, -gap)))
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
 * The people who can take a job on a day, best first: who did the same row the day before, who did the same competence
 * or the one before it in its chain, then who changes nothing else; and among those, who has the fewest competences.
 */
const candidates = (ws: Workspace, staff: Staff, job: Job, date: ISODate, nextOf: Map<CompetenceKey, CompetenceKey | undefined>, people: readonly Staffer[]) => {
  const wd = ws.settings.workday
  const rank = (personId: string): number => {
    const before = staff.before(personId, date)
    if (!before) return 2
    if (before.competence !== job.competence) return nextOf.get(before.competence) === job.competence ? 1.5 : 3
    const sameProject = numberKey(before.projectNo ?? '') === numberKey(job.row.projectNo)
    const sameHall = hallKey(before.hall) === hallKey(job.row.hall)
    return sameProject && sameHall ? 0 : sameHall ? 0.5 : 1
  }
  return people
    .filter((person) => person.competences.includes(job.competence))
    .map((person) => ({ person, free: staff.free(person.id, date), rank: rank(person.id) }))
    .filter((c) => paidTotal(c.free, wd) >= SMALLEST)
    .sort((a, b) => a.rank - b.rank || a.person.competences.length - b.person.competences.length || a.person.order - b.person.order)
}

/**
 * Paints people on a job's day until its hours are covered or nobody is left; returns the hours nobody could take. Of
 * those as good for continuity, one hired in that day comes first, as the day is paid for.
 */
const staffDay = (ws: Workspace, staff: Staff, job: Job, date: ISODate, hours: number, nextOf: Map<CompetenceKey, CompetenceKey | undefined>, makeId: () => string, people: readonly Staffer[], maxRank = Infinity): number => {
  const wd = ws.settings.workday
  let left = hours
  const done = new Set<string>()
  while (left >= SMALLEST) {
    // Among those as good for continuity, the one whose free time fits what is left best: who can take it all with the
    // least to spare, else who has the most, so the work goes to as few people as can be and leaves no scraps.
    const fit = (free: number) => (free >= left - EPS ? free - left : 1000 - free)
    const pick = candidates(ws, staff, job, date, nextOf, people)
      .filter((c) => !done.has(c.person.id) && c.rank <= maxRank)
      .sort((a, b) => a.rank - b.rank || Number(!!b.person.supplierId) - Number(!!a.person.supplierId) || fit(paidTotal(a.free, wd)) - fit(paidTotal(b.free, wd)) || a.person.competences.length - b.person.competences.length || a.person.order - b.person.order)[0]
    if (!pick) break
    const { person, free } = pick
    done.add(person.id)
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
    const order = [...pieces.values()].sort(
      (a, b) =>
        Number(workKey(b.sample) === workKey(first)) - Number(workKey(a.sample) === workKey(first)) ||
        Number(numberKey(b.sample.projectNo ?? '') === numberKey(first.projectNo ?? '')) - Number(numberKey(a.sample.projectNo ?? '') === numberKey(first.projectNo ?? '')) ||
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
      for (const [kind, hours] of byStage) {
        const job: Job = { row, competence, kind, window: new Set(own), days, near: nearby(row), place, stage: -1, need: tenth((need * hours) / total), min: style?.minPerHall ?? 0, rank: style?.index ?? styles.length, fte: kind === most ? { ...fixed } : {} }
        jobs.push(job)
        pushTo(byPlace, place, job)
      }
    }
    const stagesIn = new Map<string, number>()
    for (const [place, group] of byPlace) {
      const present = stagesOf(group[0].row.phase, stageOrderOf(ws.settings)).filter((stage) => group.some((job) => job.kind === stage))
      stagesIn.set(place, present.length)
      for (const job of group) {
        job.stage = job.kind ? present.indexOf(job.kind) : -1
      }
    }

    // 2. A day at a time, the days and the people together, so that work goes where someone is free (the planner,
    // 2026-10-25: no day piled over the crew while people stand idle the next). On a day, a job is open once the stage
    // before it in its hall has begun, the day before where the window has a day for each stage; a running competence
    // once the walls have. The open jobs are given, first, what they must do that day to be done in time, spread over the
    // days they have left, the most pressed first and the earlier stages before the later; and then what people are
    // still free for, so nobody stands idle while there is work that can be begun. Each time, those who were in the hall
    // for the project the day before come back first, then those who were in the hall, and only then the others.
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
    // The people hired in, and the work of each place they did, as what it costs, for the widening to weigh.
    const hires: Staffer[] = []
    const hiredAt = new Map<string, number>()
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
    // work changes least, else a new one. Returns the hours nobody could take, as no supplier offers the competence.
    const hireFor = (job: Job, date: ISODate, hours: number): number => {
      const before = workdayBefore(date)
      let rest = hours
      while (rest >= SMALLEST) {
        const going = [...(hiredOn.get(before) ?? [])].filter((hire) => !working(hire, date))
        let hire = candidates(ws, staff, job, date, nextOf, going)[0]?.person
        if (!hire) {
          const supplier = supplierFor(job.competence)
          if (!supplier) break
          hire = newHire(supplier, job.competence)
        }
        const was = rest
        rest = staffDay(ws, staff, job, date, rest, nextOf, makeId, [hire])
        if (rest > was - SMALLEST) break
        if (!hiredOn.has(date)) hiredOn.set(date, new Set())
        hiredOn.get(date)!.add(hire)
      }
      hiredAt.set(job.place, (hiredAt.get(job.place) ?? 0) + (hours - rest) * costOfHire(job.competence))
      return rest
    }
    const left = new Map(jobs.map((job) => [job, job.need]))
    const began = new Map<Job, ISODate>()
    for (const job of jobs) {
      const first = Object.keys(job.fte).sort()[0]
      if (first) began.set(job, first)
    }
    const hasWork = (job: Job) => job.need > NOISE || Object.keys(job.fte).length > 0
    const isOpen = (job: Job, date: ISODate): boolean => {
      const group = byPlace.get(job.place)!
      if (job.kind === 'lopende') {
        const walls = group.filter((other) => other.kind === 'standbygging' && hasWork(other))
        return !walls.length || walls.some((wall) => began.has(wall) && began.get(wall)! <= date)
      }
      if (job.stage <= 0) return true
      const before = group.filter((other) => other.stage >= 0 && other.stage < job.stage && hasWork(other))
      if (!before.length) return true
      const last = Math.max(...before.map((other) => other.stage))
      const firsts = before.filter((other) => other.stage === last && began.has(other)).map((other) => began.get(other)!)
      if (!firsts.length) return false
      const first = firsts.sort()[0]
      return job.days.length >= stagesIn.get(job.place)! ? first < date : first <= date
    }
    const daysLeft = (job: Job, date: ISODate) => job.days.filter((day) => day >= date).length
    const record = (job: Job, date: ISODate, hours: number) => {
      const took = tenth(hours / perDay)
      if (took <= NOISE) return
      job.fte[date] = tenth((job.fte[date] ?? 0) + took)
      left.set(job, tenth(left.get(job)! - took))
      if (!began.has(job) || began.get(job)! > date) began.set(job, date)
    }
    const give = (job: Job, date: ISODate, fte: number, maxRank: number) => {
      const wanted = Math.min(left.get(job)!, fte) * perDay
      if (wanted < SMALLEST) return
      record(job, date, wanted - staffDay(ws, staff, job, date, wanted, nextOf, makeId, poolOf(date), maxRank))
    }
    // People are hired for what the permanent staff could not do of a job's share of the day: half a day's work at the
    // least, as less waits for the days after, but on the last day of the job, and where the job has begun and would
    // otherwise have no one that day, a quiet day in the middle of its span.
    const hire = (job: Job, date: ISODate, fte: number) => {
      const wanted = Math.min(left.get(job)!, fte) * perDay
      const gap = !job.fte[date] && began.has(job) && began.get(job)! < date
      if (wanted < SMALLEST || (wanted < perDay / 2 && daysLeft(job, date) > 1 && !gap)) return
      record(job, date, wanted - hireFor(job, date, wanted))
    }
    // What a job may be given over its share: anything while its crew has not yet gone down, and once it has, no more
    // than it had the day before, so no day in the middle of its span is quieter than the days around it.
    const roomOf = (job: Job, date: ISODate): number => {
      const at = job.days.indexOf(date)
      let went = false
      for (let i = 1; i < at && !went; i++) went = (job.fte[job.days[i]] ?? 0) < (job.fte[job.days[i - 1]] ?? 0) - NOISE
      if (!went || at < 1) return left.get(job)!
      return Math.max(0, (job.fte[job.days[at - 1]] ?? 0) - (job.fte[date] ?? 0))
    }
    jobs.sort((a, b) => a.rank - b.rank || hallKey(a.row.hall).localeCompare(hallKey(b.row.hall), 'nb', { numeric: true }))
    const openFrom = new Map<Job, ISODate>()
    const extraWork = (job: Job) => job.kind === 'ekstra'
    for (const date of [...new Set(jobs.flatMap((job) => job.days))].sort()) {
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
          // The planner's own blocks and orders for the job that day count first.
          const ownHours = ownCover(kept, job, date, wd)
          const own = tenth(Math.min(left.get(job)!, (ownHours + orderCover(job, date, Math.max(0, left.get(job)! * perDay - ownHours))) / perDay))
          if (own > NOISE) {
            job.fte[date] = tenth((job.fte[date] ?? 0) + own)
            left.set(job, tenth(left.get(job)! - own))
            if (!began.has(job)) began.set(job, date)
          }
        }
        open.sort((a, b) => Number(extraWork(a)) - Number(extraWork(b)) || pressed(b) - pressed(a) || a.stage - b.stage || a.rank - b.rank)
        for (const maxRank of [0, 0.5, Infinity]) for (const job of open) give(job, date, due(job) - (job.fte[date] ?? 0), maxRank)
        for (const job of open) hire(job, date, Math.max(job.min, share.get(job)!) - (job.fte[date] ?? 0))
        for (const job of open) give(job, date, roomOf(job, date), Infinity)
      }
    }

    // 3. What nobody could take stays in the plan, uncovered, spread over the days the job was open, or the latter half of
    // its window where it never was, for Bemanning and Innleid to show.
    const uncovered = new Map<string, number>()
    for (const job of jobs) {
      const rest = left.get(job)!
      if (rest <= NOISE) continue
      const from = openFrom.get(job)
      const days = from ? job.days.filter((date) => date >= from) : job.days.slice(Math.floor(job.days.length / 2))
      shareOverDays(rest, days.length).forEach((part, i) => part && (job.fte[days[i]] = tenth((job.fte[days[i]] ?? 0) + part)))
      uncovered.set(job.place, (uncovered.get(job.place) ?? 0) + rest * perDay)
    }
    // What each place costs: its uncovered hours and its hired ones.
    const cost = new Map(hiredAt)
    for (const [place, hours] of uncovered) cost.set(place, (cost.get(place) ?? 0) + hours * weights.uncovered)
    return { jobs, byPlace, staff, hires, cost }
  }

  // Where the permanent staff cannot do it all, the window is widened onto all the free days next to it, and everything of
  // that project, hall and phase is planned again over the widened span; a day the plan does not use is not listed for
  // Venyou. A widening stays only where it pays: what the uncovered and hired hours cost against a day the hall is used
  // outside its phases.
  const extra = new Map<string, ISODate[]>()
  const stopped = new Set<string>()
  let result = planWith(extra)
  for (let pass = 0; pass < 3; pass++) {
    const grown = new Map<string, ISODate[]>()
    for (const [place, cost] of result.cost) {
      if (cost < weights.outsideWindow || stopped.has(place)) continue
      const group = result.byPlace.get(place)!
      const used = extra.get(place) ?? []
      const free = group[0].near.filter((date) => !used.includes(date))
      if (!free.length) continue
      grown.set(place, used)
      // All the free days at once: a stage short of people needs the days before it that the stages before it can then use.
      extra.set(place, [...used, ...free])
    }
    if (!grown.size) break
    const next = planWith(extra)
    let undone = false
    for (const [place, before] of grown) {
      const saved = (result.cost.get(place) ?? 0) - (next.cost.get(place) ?? 0)
      if (saved >= (extra.get(place)!.length - before.length) * weights.outsideWindow) continue
      extra.set(place, before)
      stopped.add(place)
      undone = true
    }
    result = undone ? planWith(extra) : next
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
