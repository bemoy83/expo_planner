import { addDays, weekdayIndex, type ISODate } from '../../domain/dates'
import type { Minute } from '../../domain/types'

/** Hours nearer zero than this are shown as none. */
export const EPSILON = 0.05

/** Monday to Sunday of the ISO week the date is in. */
export const weekDates = (date: ISODate): ISODate[] => {
  const monday = addDays(date, -weekdayIndex(date))
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
}

/** «11:30» as minutes after midnight, or NaN: what `clock` writes, read back. */
export const clockMinutes = (text: string): Minute => {
  const [hours, mins] = text.split(':').map(Number)
  return Number.isInteger(hours) && Number.isInteger(mins) ? hours * 60 + mins : NaN
}
