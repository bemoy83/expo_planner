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

/** The whole run a block is a part of. A block that is joined to nothing is a run of one day. */
export const runOf = (blocks: BlocksOn, date: ISODate, block: Assignment, wd: WorkdaySettings): Run => {
  const share = (t: number) => (Math.min(Math.max(t, wd.dayStart), wd.dayEnd) - wd.dayStart) / (wd.dayEnd - wd.dayStart)
  let from = date
  let first = block
  for (let prev = prevInRun(blocks, from, first, wd); prev; prev = prevInRun(blocks, from, first, wd)) {
    from = addDays(from, -1)
    first = prev
  }
  let to = date
  let last = block
  for (let next = nextInRun(blocks, to, last, wd); next; next = nextInRun(blocks, to, last, wd)) {
    to = addDays(to, 1)
    last = next
  }
  return { competence: block.competence, from, to, days: daysBetween(from, to) + 1, startShare: share(first.start), endShare: share(last.end) }
}
