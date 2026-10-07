import { formatFte } from '../../domain/calc'
import { addDays, dayOfMonth, isoWeek, monthShort, weekdayIndex, type ISODate } from '../../domain/dates'
import { dayType } from '../../domain/holidays'
import type { Minute } from '../../domain/types'

/** Hours nearer zero than this are shown as none. */
export const EPSILON = 0.05

/** Monday to Sunday of the ISO week the date is in. */
export const weekDates = (date: ISODate): ISODate[] => {
  const monday = addDays(date, -weekdayIndex(date))
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
}

/** «12.–18. okt», or «28. sep–4. okt» for a week across two months. */
export const weekRange = (dates: ISODate[]): string => {
  const first = dates[0]
  const last = dates[dates.length - 1]
  return monthShort(first) === monthShort(last) ? `${dayOfMonth(first)}.–${dayOfMonth(last)}. ${monthShort(last)}` : `${dayOfMonth(first)}. ${monthShort(first)}–${dayOfMonth(last)}. ${monthShort(last)}`
}

export const weekLabel = (dates: ISODate[]): string => `U${isoWeek(dates[0])}`

/** What a day's column is in every row of the grid: narrow in the weekend, a day off, the day in focus. */
export const dayClass = (date: ISODate, index: number, focusDate: ISODate): string => `${index >= 5 ? 'narrow' : ''} ${dayType(date) !== 'arbeidsdag' ? 'off-day' : ''} ${date === focusDate ? 'focus-day' : ''}`

export const WEEKDAYS_LONG = ['mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag', 'søndag']

/** Hours with a decimal comma. Quarter hours keep both decimals: 2,75. */
export const hoursText = (hours: number): string => formatFte(Math.round(hours * 100) / 100, 2) || '0'

export const clock = (minute: Minute): string => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
