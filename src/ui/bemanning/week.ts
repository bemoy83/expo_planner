import { formatFte } from '../../domain/calc'
import { addDays, weekdayIndex, type ISODate } from '../../domain/dates'
import type { Minute } from '../../domain/types'

/** Hours nearer zero than this are shown as none. */
export const EPSILON = 0.05

/** Monday to Sunday of the ISO week the date is in. */
export const weekDates = (date: ISODate): ISODate[] => {
  const monday = addDays(date, -weekdayIndex(date))
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
}

export const WEEKDAYS_LONG = ['mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag', 'søndag']

/** Hours with a decimal comma. Quarter hours keep both decimals: 2,75. */
export const hoursText = (hours: number): string => formatFte(Math.round(hours * 100) / 100, 2) || '0'

export const clock = (minute: Minute): string => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`

/** A stretch of time, «07:00–15:00». Short, whole hours lose their minutes: «07–15», «11:30–15». */
export const spanText = (start: Minute, end: Minute, short: boolean): string => {
  const part = (minute: Minute) => (short && minute % 60 === 0 ? String(Math.floor(minute / 60)).padStart(2, '0') : clock(minute))
  return `${part(start)}–${part(end)}`
}
