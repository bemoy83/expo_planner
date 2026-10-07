import { formatFte } from '../../domain/calc'
import { addDays, isoWeek, MONTHS_NB, weekdayIndex, type ISODate } from '../../domain/dates'
import type { Minute } from '../../domain/types'

export const todayIso = (): ISODate => new Date().toISOString().slice(0, 10)

/** Monday to Sunday of the ISO week the date is in. */
export const weekDates = (date: ISODate): ISODate[] => {
  const monday = addDays(date, -weekdayIndex(date))
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
}

const month = (date: ISODate) => MONTHS_NB[Number(date.slice(5, 7)) - 1].toLowerCase()
const day = (date: ISODate) => String(Number(date.slice(8, 10)))

/** «12.–18. okt», or «28. sep–4. okt» for a week across two months. */
export const weekRange = (dates: ISODate[]): string => {
  const first = dates[0]
  const last = dates[dates.length - 1]
  return month(first) === month(last) ? `${day(first)}.–${day(last)}. ${month(last)}` : `${day(first)}. ${month(first)}–${day(last)}. ${month(last)}`
}

export const weekLabel = (dates: ISODate[]): string => `U${isoWeek(dates[0])}`

export const WEEKDAYS_LONG = ['mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag', 'søndag']

/** Hours with at most one decimal and a decimal comma; nothing for 0 is left to the caller. */
export const hoursText = (hours: number): string => formatFte(Math.round(hours * 10) / 10, 1) || '0'

export const clock = (minute: Minute): string => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
