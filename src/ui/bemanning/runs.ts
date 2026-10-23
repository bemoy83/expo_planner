import { addDays, daysBetween, type ISODate } from '../../domain/dates'
import { sameTag, workTag, type Assignment, type Interval, type Minute, type WorkdaySettings } from '../../domain/types'
import { clamp } from '../../domain/numbers'

/** The blocks of one person on a day. */
export type BlocksOn = (date: ISODate) => Assignment[] | undefined

/**
 * A run: the days in a row a person has one competence for one project, drawn as one piece. A block goes on into the next
 * day when it lasts to the end of the normal day and a block of its competence begins the next day
 * from its start. Another competence, another project or time left empty ends a run, so a weekend does when it is not worked,
 * and a run goes on through one that is. What happens to the person (sickness, absence, overtime) does not
 * end it: the blocks are still there.
 */
const reachesEnd = (iv: Interval, wd: WorkdaySettings) => iv.end >= wd.dayEnd && iv.start < wd.dayEnd
const fromStart = (iv: Interval, wd: WorkdaySettings) => iv.start <= wd.dayStart && iv.end > wd.dayStart
const sameWork = (a: Piece, b: Piece) => a.competence === b.competence && sameTag(a, b)

/** The block the run of `block` goes on with the day after, if any. */
export const nextInRun = (blocks: BlocksOn, date: ISODate, block: Assignment, wd: WorkdaySettings): Assignment | undefined => {
  const next = addDays(date, 1)
  if (!reachesEnd(block, wd)) return undefined
  return blocks(next)?.find((a) => sameWork(a, block) && fromStart(a, wd))
}

/** The block the run of `block` comes from the day before, if any. */
export const prevInRun = (blocks: BlocksOn, date: ISODate, block: Assignment, wd: WorkdaySettings): Assignment | undefined => {
  const prev = addDays(date, -1)
  if (!fromStart(block, wd)) return undefined
  return blocks(prev)?.find((a) => sameWork(a, block) && reachesEnd(a, wd))
}

/** Which of its neighbours a block is joined to. */
export interface RunLink {
  prev: boolean
  next: boolean
}

/** How a block, or time a stroke would put down, is drawn at its ends: joined over the days, and meeting what lies right before or after it in its own day. */
export interface EndShape extends RunLink {
  meetsBefore: boolean
  meetsAfter: boolean
}

/** Time of one competence, for a project or none, in a day: a block, or what a stroke would put down. */
export type Piece = Interval & { competence: string; projectNo?: string; hall?: string }
export type PiecesOn = (date: ISODate) => Piece[] | undefined

/**
 * The shape of a piece of the day `date`, with what a stroke would put down counted as there: joined to the
 * day before or after where a run would go on, through time that is only previewed as through blocks, and
 * one piece with what lies right `beside` it in its own day: the previews for a block, the blocks for a preview.
 */
export const endShape = (piece: Piece, date: ISODate, beside: Piece[], blocks: PiecesOn, previews: PiecesOn, wd: WorkdaySettings): EndShape => {
  const same = (other: Piece) => sameWork(other, piece)
  const on = (day: ISODate, joins: (iv: Interval, wd: WorkdaySettings) => boolean) => [blocks, previews].some((pieces) => pieces(day)?.some((other) => same(other) && joins(other, wd)) === true)
  return {
    prev: fromStart(piece, wd) && on(addDays(date, -1), reachesEnd),
    next: reachesEnd(piece, wd) && on(addDays(date, 1), fromStart),
    meetsBefore: beside.some((other) => same(other) && other.end === piece.start),
    meetsAfter: beside.some((other) => same(other) && other.start === piece.end),
  }
}

export const runLink = (blocks: BlocksOn, date: ISODate, block: Assignment, wd: WorkdaySettings): RunLink => ({
  prev: prevInRun(blocks, date, block, wd) !== undefined,
  next: nextInRun(blocks, date, block, wd) !== undefined,
})

export interface Run {
  competence: string
  projectNo?: string
  hall?: string
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
  const step = (from: RunDay, by: 1 | -1): RunDay | undefined => {
    const beside = (by > 0 ? nextInRun : prevInRun)(blocks, from.date, from.block, wd)
    return beside && { date: addDays(from.date, by), block: beside }
  }
  const days: RunDay[] = [{ date, block }]
  for (let day = step(days[0], -1); day; day = step(day, -1)) days.unshift(day)
  for (let day = step(days[days.length - 1], 1); day; day = step(day, 1)) days.push(day)
  return days
}

/** The whole run a block is a part of. */
export const runOf = (blocks: BlocksOn, date: ISODate, block: Assignment, wd: WorkdaySettings): Run => {
  const share = (t: number) => (clamp(t, wd.dayStart, wd.dayEnd) - wd.dayStart) / (wd.dayEnd - wd.dayStart)
  const days = runDays(blocks, date, block, wd)
  const first = days[0]
  const last = days[days.length - 1]
  return { competence: block.competence, ...workTag(block), from: first.date, to: last.date, days: days.length, startShare: share(first.block.start), endShare: share(last.block.end) }
}

/** A day a pulled end of a run is to give time. */
export interface StretchDay {
  date: ISODate
  /** Where the end stops within the day: the part of it that is to be filled. Without it, the whole day. */
  within?: { start: Minute; end: Minute }
  /** The day of the end itself, which the run has a part of already: no day the run comes to anew. */
  own?: boolean
}

/** What an end of a run that is pulled to a time of a day does: the days the run is to go on over, or what of it is given up. */
export interface Stretch {
  add: StretchDay[]
  /** The days of the run that are given up whole. */
  remove: RunDay[]
  /** The block the end is pulled back into, and the time it is cut to. */
  trim?: { block: Assignment; start: Minute; end: Minute }
}

/** Two hours of work between one stop and the next. */
const STOP = 120

/**
 * The stops an end can be pulled to within a day: where two, four and six hours of the normal day are
 * worked, and so on, and its end. They are counted in paid hours, so they hold wherever the lunch break is
 * laid: 09:00, 11:00, 13:30 and 15:00 with lunch from 11:30. A stop at the start of the break is the break's
 * end for the start of a run, which does not begin with a lunch.
 */
export const stretchStops = (edge: 'start' | 'end', wd: WorkdaySettings): Minute[] => {
  const lunch = wd.breakEnd - wd.breakStart
  const stops = [wd.dayStart]
  for (let worked = STOP; ; worked += STOP) {
    const clock = wd.dayStart + worked > wd.breakStart ? wd.dayStart + worked + lunch : wd.dayStart + worked
    if (clock >= wd.dayEnd) break
    stops.push(edge === 'start' && clock === wd.breakStart ? wd.breakEnd : clock)
  }
  return [...stops, wd.dayEnd]
}

/** The stop nearest to where in the day the pointer is, `share` being 0 at the start of the normal day and 1 at its end. */
export const stretchStop = (share: number, edge: 'start' | 'end', wd: WorkdaySettings): Minute => {
  const time = wd.dayStart + share * (wd.dayEnd - wd.dayStart)
  return stretchStops(edge, wd).reduce((nearest, stop) => (Math.abs(stop - time) < Math.abs(nearest - time) ? stop : nearest))
}

/**
 * R46: an end of a run pulled to the time `at` of the day `to`. Pulled outward, the run is to go on up to
 * there: what the days get is the brush's to decide, as if it were drawn over them, and the last of them is
 * filled no further than the time. A day the run has only a part of is to have the rest. Pulled inward, the
 * days past the time are given up and the block it lands in is cut to it. The day at the other end is
 * always left, with something of its block: a run is not pulled away to nothing.
 */
export const stretchRun = (days: RunDay[], edge: 'start' | 'end', to: ISODate, at: Minute, wd: WorkdaySettings): Stretch => {
  const first = days[0]
  const last = days[days.length - 1]
  const between = (from: ISODate, until: ISODate) => Array.from({ length: Math.max(0, daysBetween(from, until) + 1) }, (_, i) => addDays(from, i))
  const time = clamp(at, wd.dayStart, wd.dayEnd)
  if (edge === 'end') {
    // The start of a day is the end of the day before it.
    const [date, t] = time <= wd.dayStart ? [addDays(to, -1), wd.dayEnd] : [to, time]
    const end = Math.min(last.block.end, wd.dayEnd)
    if (date > last.date || (date === last.date && t > end)) {
      const own = end < wd.dayEnd
      return { add: between(own ? last.date : addDays(last.date, 1), date).map((d) => ({ date: d, ...(d === date && t < wd.dayEnd && { within: { start: wd.dayStart, end: t } }), ...(own && d === last.date && { own }) })), remove: [] }
    }
    if (date < first.date) return { add: [], remove: days.slice(1) }
    const kept = days.find((day) => day.date === date)!
    const cut = t < Math.min(kept.block.end, wd.dayEnd) && t > kept.block.start
    return { add: [], remove: days.filter((day) => day.date > date), ...(cut && { trim: { block: kept.block, start: kept.block.start, end: t } }) }
  }
  // The end of a day is the start of the day after it.
  const [date, t] = time >= wd.dayEnd ? [addDays(to, 1), wd.dayStart] : [to, time]
  const start = Math.max(first.block.start, wd.dayStart)
  if (date < first.date || (date === first.date && t < start)) {
    const own = start > wd.dayStart
    return { add: between(date, own ? first.date : addDays(first.date, -1)).map((d) => ({ date: d, ...(d === date && t > wd.dayStart && { within: { start: t, end: wd.dayEnd } }), ...(own && d === first.date && { own }) })), remove: [] }
  }
  if (date > last.date) return { add: [], remove: days.slice(0, -1) }
  const kept = days.find((day) => day.date === date)!
  const cut = t > Math.max(kept.block.start, wd.dayStart) && t < kept.block.end
  return { add: [], remove: days.filter((day) => day.date < date), ...(cut && { trim: { block: kept.block, start: t, end: kept.block.end } }) }
}
