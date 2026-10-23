import { type DayType } from '../holidays'
import { type Interval, type Minute, type WorkdaySettings } from '../types'

/**
 * Time within a day: intervals in minutes, the paid hours of an interval with the lunch break left out, overtime, and free time.
 * See design_docs/bemanning/RULES.md.
 */

export const length = (iv: Interval): Minute => iv.end - iv.start

export const overlap = (a: Interval, b: Interval): Minute => Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start))

export const intersect = (a: Interval, b: Interval): Interval | null => {
  const start = Math.max(a.start, b.start)
  const end = Math.min(a.end, b.end)
  return end > start ? { start, end } : null
}

/** The intervals with the given stretches cut out, sorted. */
export const subtract = (intervals: Interval[], cuts: Interval[]): Interval[] => {
  let left = intervals
  for (const cut of cuts) {
    left = left.flatMap((iv) => {
      if (cut.end <= iv.start || cut.start >= iv.end) return [iv]
      return [
        ...(cut.start > iv.start ? [{ start: iv.start, end: cut.start }] : []),
        ...(cut.end < iv.end ? [{ start: cut.end, end: iv.end }] : []),
      ]
    })
  }
  return [...left].sort((a, b) => a.start - b.start)
}

export const normalDay = (wd: WorkdaySettings): Interval => ({ start: wd.dayStart, end: wd.dayEnd })

/** R1: the hours of an interval that are paid, which is all of it but the lunch break. */
export const paidHours = (iv: Interval, wd: WorkdaySettings): number => (length(iv) - overlap(iv, { start: wd.breakStart, end: wd.breakEnd })) / 60

/**
 * The paid hours of the normal day: what one of the permanent staff can work on a workday they are not away. The
 * capacity of the staff on Faste, Resultat's day averages (through `staffHours`) and the work plans count by it.
 */
export const normalDayHours = (wd: WorkdaySettings): number => paidHours(normalDay(wd), wd)

/** The paid hours of several stretches of time together. */
export const paidTotal = (intervals: Interval[], wd: WorkdaySettings): number => intervals.reduce((sum, iv) => sum + paidHours(iv, wd), 0)

/** R2: the paid hours outside the normal day; on a weekend or a holiday that is all of them. */
export const overtimeHours = (iv: Interval, dayKind: DayType, wd: WorkdaySettings): number => {
  if (dayKind !== 'arbeidsdag') return paidHours(iv, wd)
  const normal = intersect(iv, normalDay(wd))
  return paidHours(iv, wd) - (normal ? paidHours(normal, wd) : 0)
}

/** R5: the windows less the assignments in them. Gaps shorter than `snap` are left out. */
export const freeIntervals = (windows: Interval[], assignments: Interval[], snap: Minute): Interval[] =>
  subtract(windows, assignments).filter((iv) => length(iv) >= snap)

export const freeHours = (windows: Interval[], assignments: Interval[], wd: WorkdaySettings): number =>
  paidTotal(freeIntervals(windows, assignments, wd.snap), wd)
