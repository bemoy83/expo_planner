import { competenceStyles } from '../competences'
import { pushTo } from '../collections'
import { addDays, type ISODate } from '../dates'
import { dayType } from '../holidays'
import { isSuggestedRow } from '../plannedRows'
import { numberKey } from '../projects'
import { shareOverDays } from '../spread'
import { freeIntervals, paidHours, paidTotal } from '../staffing/intervals'
import { normalWindows, okAssignments } from '../staffing/time'
import { hallKey, stagePlace, stagesOf, WEIGHTS } from './score'
import { competenceKey, type AllocationRow, type Assignment, type CompetenceKey, type CompetenceStyle, type Interval, type Workspace } from '../types'

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
 * 3. What nobody could take on a day is moved to a day of the window where someone can, as far as the order of the
 *    stages allows: a stage starts no earlier than the day after the stage before it has started, and ends no later than
 *    the stage after it; a running competence (banner) keeps to the days the walls stand.
 * 4. Where that leaves hours over, the window of the project's hall and phase is widened onto the days before the
 *    build-up or after the tear-down that the hall stands free (`nearby`, R6), and all its work is planned again over
 *    the widened span by the same rules (the planner, 2026-10-25: the point of a longer span is that everything is
 *    shared out over it, not that what was left over is moved). Those days are listed for Venyou (`outside`). Those days are listed for Venyou (`outside`). What is left stays in the plan, uncovered, for Bemanning
 *    and Innleid to show.
 *
 * 5. Each day's blocks of a competence are shared out again on the same people, so each has as few pieces as can be
 *    (`consolidate`): whole people on the biggest pieces of work, and the one who had a piece the day before keeps it.
 *    A person's day is then laid out in one stretch per project and hall, yesterday's work first (`inStretches`).
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
  /** The days its stage puts it on, a part of `days`. */
  run: ISODate[]
  /** The days next to the window its halls stand free, nearest first. */
  near: ISODate[]
  /** Its project, hall and phase, whose stages keep their order. */
  place: string
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

/**
 * The part of the window the stage of a job puts it in: the `count` stages present in its hall and phase each take an
 * overlapping part, the `index`th starting where the one before is half done.
 */
const stagePart = (days: ISODate[], index: number, count: number): ISODate[] => {
  if (count <= 1) return days
  // Each stage starts at least a day after the one before it, as far as the window has days.
  const from = Math.min(days.length - 1, Math.max(index, Math.floor((index * days.length) / (count + 1))))
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
    const sameHall = hallKey(before.hall) === hallKey(job.row.hall)
    return sameProject && sameHall ? 0 : sameHall ? 0.5 : 1
  }
  return (ws.persons ?? [])
    .filter((person) => person.competences.includes(job.competence))
    .map((person) => ({ person, free: staff.free(person.id, date), rank: rank(person.id) }))
    .filter((c) => paidTotal(c.free, wd) >= SMALLEST)
    .sort((a, b) => a.rank - b.rank || a.person.competences.length - b.person.competences.length || a.person.order - b.person.order)
}

/** Paints people on a job's day until its hours are covered or nobody is left; returns the hours nobody could take. */
const staffDay = (ws: Workspace, staff: Staff, job: Job, date: ISODate, hours: number, nextOf: Map<CompetenceKey, CompetenceKey | undefined>, makeId: () => string, maxRank = Infinity): number => {
  const wd = ws.settings.workday
  let left = hours
  const done = new Set<string>()
  while (left >= SMALLEST) {
    // Among those as good for continuity, the one whose free time fits what is left best: who can take it all with the
    // least to spare, else who has the most, so the work goes to as few people as can be and leaves no scraps.
    const fit = (free: number) => (free >= left - EPS ? free - left : 1000 - free)
    const pick = candidates(ws, staff, job, date, nextOf)
      .filter((c) => !done.has(c.person.id) && c.rank <= maxRank)
      .sort((a, b) => a.rank - b.rank || fit(paidTotal(a.free, wd)) - fit(paidTotal(b.free, wd)) || a.person.competences.length - b.person.competences.length || a.person.order - b.person.order)[0]
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

  /**
   * One plan of every job: steps 1 to 3 with each project, hall and phase given the free days `extra` next to its window
   * as days of the window, so that its stages share the whole of the widened span. Hands back the jobs, the people and
   * the hours nobody took, by project, hall and phase.
   */
  const planWith = (extra: Map<string, ISODate[]>) => {
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
      const place = stagePlace(row)
      const own = workdaysOf(window)
      const days = [...new Set([...own, ...(extra.get(place) ?? [])])].sort()
      const job: Job = { row, competence, window: new Set(own), days, run: [], near: nearby(row), place, stage: -1, need, min: style?.minPerHall ?? 0, rank: style?.index ?? styles.length, fte: { ...fixed } }
      jobs.push(job)
      pushTo(byPlace, place, job)
    }
    for (const group of byPlace.values()) {
      const tearDown = group[0].row.phase === 'Demontering'
      const present = stagesOf(group[0].row.phase).filter((stage) => group.some((job) => styleOf.get(job.competence)?.stage === stage))
      for (const job of group) {
        const stage = styleOf.get(job.competence)?.stage
        job.stage = stage ? present.indexOf(stage) : -1
        job.run = job.stage < 0 ? job.days : stagePart(job.days, job.stage, present.length)
      }
      // A running competence (banner) runs while the walls stand: from the day they start, in a tear-down until they come down.
      const walls = group.filter((job) => styleOf.get(job.competence)?.stage === 'standbygging').flatMap((job) => job.run).sort()
      for (const job of group) {
        if (styleOf.get(job.competence)?.stage === 'lopende' && walls.length) {
          const run = job.days.filter((date) => (tearDown ? date <= walls.at(-1)! : date >= walls[0]))
          if (run.length) job.run = run
        }
        if (job.need > NOISE) placeOnRun(job, styleOf.get(job.competence)?.stage === 'ekstra')
      }
    }

    // 2. The people, a day at a time, so that who was where the day before is known for every job. On each day, every job
    // first takes back those who were in its hall for its project the day before, then those who were in its hall, and
    // only then the others, hardest competence first, then the tightest window: nobody leaves a hall that still has their
    // work for another (the planner, 2026-10-25).
    const staff = staffOf(ws, kept)
    jobs.sort((a, b) => a.rank - b.rank || a.days.length - b.days.length || (a.days[0] ?? '').localeCompare(b.days[0] ?? ''))
    const onDay = new Map<ISODate, Job[]>()
    for (const job of jobs) for (const date of Object.keys(job.fte)) pushTo(onDay, date, job)
    const short = new Map<Job, Map<ISODate, number>>()
    for (const date of [...onDay.keys()].sort()) {
      const todo = onDay.get(date)!
      const left = new Map(todo.map((job) => [job, job.fte[date] * perDay - ownCover(kept, job, date, wd)]))
      for (const maxRank of [0, 0.5, Infinity])
        for (const job of todo) {
          const hours = left.get(job)!
          if (hours >= SMALLEST) left.set(job, staffDay(ws, staff, job, date, hours, nextOf, makeId, maxRank))
        }
      for (const [job, rest] of left) {
        if (rest < SMALLEST) continue
        if (!short.has(job)) short.set(job, new Map())
        short.get(job)!.set(date, rest)
      }
    }

    // 3. What nobody could take is moved to another day of the window where someone can, the days of its run first, as
    // far as the stages before and after it allow. The stages are moved in the order they come.
    const daysOf = (job: Job) => Object.keys(job.fte).filter((date) => job.fte[date] > NOISE)
    const allows = (job: Job): ((date: ISODate) => boolean) => {
      const group = byPlace.get(job.place) ?? []
      if (styleOf.get(job.competence)?.stage === 'lopende') {
        const walls = group.filter((other) => styleOf.get(other.competence)?.stage === 'standbygging').flatMap(daysOf).sort()
        if (!walls.length) return () => true
        return job.row.phase === 'Demontering' ? (date) => date <= walls.at(-1)! : (date) => date >= walls[0]
      }
      if (job.stage < 0) return () => true
      const staged = group.filter((other) => other.stage >= 0 && daysOf(other).length)
      const before = staged.filter((other) => other.stage < job.stage)
      const after = staged.filter((other) => other.stage > job.stage)
      const last = Math.max(-1, ...before.map((other) => other.stage))
      const next = Math.min(Infinity, ...after.map((other) => other.stage))
      // A stage starts the day after the stage before it has started, where the window has such a day: on a stand the
      // floor is laid before the walls go up, though in the hall the stages run side by side.
      const started = before.filter((other) => other.stage === last).flatMap(daysOf).sort()[0]
      const from = started === undefined ? undefined : (job.days.find((date) => date > started) ?? started)
      const to = after.filter((other) => other.stage === next).flatMap(daysOf).sort().at(-1)
      return (date) => (from === undefined || date >= from) && (to === undefined || date <= to)
    }
    const tearDown = (job: Job) => job.row.phase === 'Demontering'
    const moveOrder = (job: Job) => (job.stage < 0 ? Infinity : tearDown(job) ? -job.stage : job.stage)
    const uncovered = new Map<string, number>()
    for (const [job, left] of [...short].sort(([a], [b]) => moveOrder(a) - moveOrder(b))) {
      for (const [date, hours] of left) {
        let rest = hours
        // A stage's first day stays where it is when a later stage has work: emptied, the stage would start after it.
        const holds = job.stage >= 0 && date === daysOf(job).sort()[0] && (byPlace.get(job.place) ?? []).some((other) => other.stage > job.stage && daysOf(other).length)
        if (!fixedOf(job.row)[date] && !holds) {
          const allowed = allows(job)
          const others = [...job.run, ...job.days.filter((d) => !job.run.includes(d))].filter((d) => d !== date && allowed(d))
          for (const other of others) {
            if (rest < SMALLEST) break
            const free = candidates(ws, staff, job, other, nextOf).reduce((sum, c) => sum + paidTotal(c.free, wd), 0)
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
        if (rest >= SMALLEST) uncovered.set(job.place, (uncovered.get(job.place) ?? 0) + rest)
      }
    }
    return { jobs, byPlace, staff, uncovered }
  }

  // Where the permanent staff cannot do it all, the window is widened onto the free days next to it, as many as the
  // hours left over take, and everything of that project, hall and phase is planned again over the widened span. A
  // widening stays only where it pays: 10 an uncovered hour against 3 a day the hall is used outside its phases.
  const extra = new Map<string, ISODate[]>()
  const stopped = new Set<string>()
  let result = planWith(extra)
  for (let pass = 0; pass < 3; pass++) {
    const grown = new Map<string, ISODate[]>()
    for (const [place, hours] of result.uncovered) {
      if (hours < 1 || stopped.has(place)) continue
      const group = result.byPlace.get(place)!
      const used = extra.get(place) ?? []
      const free = group[0].near.filter((date) => !used.includes(date))
      if (!free.length) continue
      const daily = Math.max(perDay, (group.reduce((sum, job) => sum + job.need, 0) * perDay) / group[0].days.length)
      grown.set(place, used)
      extra.set(place, [...used, ...free.slice(0, Math.max(1, Math.min(free.length, Math.ceil(hours / daily))))])
    }
    if (!grown.size) break
    const next = planWith(extra)
    let undone = false
    for (const [place, before] of grown) {
      const saved = (result.uncovered.get(place) ?? 0) - (next.uncovered.get(place) ?? 0)
      if (saved * WEIGHTS.uncovered >= (extra.get(place)!.length - before.length) * WEIGHTS.outsideWindow) continue
      extra.set(place, before)
      stopped.add(place)
      undone = true
    }
    result = undone ? planWith(extra) : next
  }
  const { jobs, staff } = result

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
  const became = new Map<string, AllocationRow>()
  for (const job of jobs) {
    if (!isSuggestedRow(job.row) || !Object.keys(job.fte).length) continue
    projects.add(job.row.projectNo)
    const stored = { ...job.row, id: `row-${makeId()}`, order: ++order, fte: job.fte, notes: {}, engine: Object.keys(job.fte).sort() }
    allocations.push(stored)
    became.set(job.row.id, stored)
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
  const painted = inStretches(consolidate([...staff.blocks.values()].flat().filter((a) => a.source === 'suggested'), wd, makeId), wd, makeId)
  const assignments = [...(ws.assignments ?? []).filter((a) => a.source !== 'suggested'), ...painted]
  return { workspace: { ...ws, allocations, assignments }, projects: [...projects], rows: rows.map((row) => became.get(row.id) ?? solvedRows.get(row.id) ?? row), outside: [...outside.values()].sort((a, b) => a.hall.localeCompare(b.hall, 'nb') || a.date.localeCompare(b.date)) }
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
