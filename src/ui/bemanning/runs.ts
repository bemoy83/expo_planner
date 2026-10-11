import { addDays, daysBetween, type ISODate } from '../../domain/dates'
import type { Assignment, WorkdaySettings } from '../../domain/types'

/** The blocks of one person on a day. */
export type BlocksOn = (date: ISODate) => Assignment[] | undefined

/**
 * A run: the days in a row a person has one competence, drawn as one piece. A block goes on into the next
 * day when it lasts to the end of the normal day and a block of its competence begins the next day
 * from its start. Another competence or time left empty ends a run, so a weekend does when it is not worked,
 * and a run goes on through one that is. What happens to the person (sickness, absence, overtime) does not
 * end it: the blocks are still there.
 */
const reachesEnd = (a: Assignment, wd: WorkdaySettings) => a.end >= wd.dayEnd && a.start < wd.dayEnd
const fromStart = (a: Assignment, wd: WorkdaySettings) => a.start <= wd.dayStart && a.end > wd.dayStart

/** The block the run of `block` goes on with the day after, if any. */
export const nextInRun = (blocks: BlocksOn, date: ISODate, block: Assignment, wd: WorkdaySettings): Assignment | undefined => {
  const next = addDays(date, 1)
  if (!reachesEnd(block, wd)) return undefined
  return blocks(next)?.find((a) => a.competence === block.competence && fromStart(a, wd))
}

/** The block the run of `block` comes from the day before, if any. */
export const prevInRun = (blocks: BlocksOn, date: ISODate, block: Assignment, wd: WorkdaySettings): Assignment | undefined => {
  const prev = addDays(date, -1)
  if (!fromStart(block, wd)) return undefined
  return blocks(prev)?.find((a) => a.competence === block.competence && reachesEnd(a, wd))
}

/** Which of its neighbours a block is joined to. */
export interface RunLink {
  prev: boolean
  next: boolean
}

export const runLink = (blocks: BlocksOn, date: ISODate, block: Assignment, wd: WorkdaySettings): RunLink => ({
  prev: prevInRun(blocks, date, block, wd) !== undefined,
  next: nextInRun(blocks, date, block, wd) !== undefined,
})

export interface Run {
  competence: string
  from: ISODate
  to: ISODate
  /** The days it has a block on. */
  days: number
  /** Where it begins on its first day and ends on its last, as shares of the normal day. */
  startShare: number
  endShare: number
}

/** A day of a run, with the block the run has on it. */
export interface RunDay {
  date: ISODate
  block: Assignment
}

/** The days of the run a block is a part of, in order. A block that is joined to nothing is a run of one day. */
export const runDays = (blocks: BlocksOn, date: ISODate, block: Assignment, wd: WorkdaySettings): RunDay[] => {
  const days: RunDay[] = [{ date, block }]
  for (let prev = prevInRun(blocks, days[0].date, days[0].block, wd); prev; prev = prevInRun(blocks, days[0].date, days[0].block, wd)) days.unshift({ date: addDays(days[0].date, -1), block: prev })
  for (let last = days[days.length - 1], next = nextInRun(blocks, last.date, last.block, wd); next; last = days[days.length - 1], next = nextInRun(blocks, last.date, last.block, wd)) days.push({ date: addDays(last.date, 1), block: next })
  return days
}

/** The whole run a block is a part of. */
export const runOf = (blocks: BlocksOn, date: ISODate, block: Assignment, wd: WorkdaySettings): Run => {
  const share = (t: number) => (Math.min(Math.max(t, wd.dayStart), wd.dayEnd) - wd.dayStart) / (wd.dayEnd - wd.dayStart)
  const days = runDays(blocks, date, block, wd)
  const first = days[0]
  const last = days[days.length - 1]
  return { competence: block.competence, from: first.date, to: last.date, days: days.length, startShare: share(first.block.start), endShare: share(last.block.end) }
}

/** What an end of a run that is pulled to a day does: the days the run is to go on over, or the days of it that are given up. */
export interface Stretch {
  add: ISODate[]
  remove: RunDay[]
  /** The day of the end itself, where the run has only a part of it and is to have the rest: it is among `add`, and is no day the run comes to anew. */
  whole?: ISODate
}

/**
 * An end of a run pulled along the days to `to`. Pulled outward, the run is to go on over the days up to it:
 * what they get is the brush's to decide, as if it were drawn over them. An end in the middle of a day is to
 * have the rest of that day too, or the days after it would not be of the run. Pulled inward, the days of the
 * run past it are given up. The day at the other end is always left: a run is not pulled away to nothing.
 */
export const stretchRun = (days: RunDay[], edge: 'start' | 'end', to: ISODate, wd: WorkdaySettings): Stretch => {
  const first = days[0]
  const last = days[days.length - 1]
  const between = (from: ISODate, until: ISODate) => Array.from({ length: Math.max(0, daysBetween(from, until) + 1) }, (_, i) => addDays(from, i))
  if (edge === 'end') {
    if (to <= last.date) return { add: [], remove: days.filter((day) => day.date > to && day.date > first.date) }
    const whole = reachesEnd(last.block, wd) ? undefined : last.date
    return { add: between(whole ?? addDays(last.date, 1), to), remove: [], ...(whole && { whole }) }
  }
  if (to >= first.date) return { add: [], remove: days.filter((day) => day.date < to && day.date < last.date) }
  const whole = fromStart(first.block, wd) ? undefined : first.date
  return { add: between(to, whole ?? addDays(first.date, -1)), remove: [], ...(whole && { whole }) }
}
