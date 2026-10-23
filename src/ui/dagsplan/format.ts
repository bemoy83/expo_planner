import { dayOfMonth, weekdayIndex, type ISODate } from '../../domain/dates'
import type { Minute } from '../../domain/types'
import { clockText, spanText } from '../bemanning/week'

/** How the work plans write dates and times. */

export const WEEKDAYS = ['Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag', 'Søndag']
export const MONTHS = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember']

export const longDate = (date: ISODate) => `${WEEKDAYS[weekdayIndex(date)]} ${dayOfMonth(date)}. ${MONTHS[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`
export const shortDate = (date: ISODate) => `${WEEKDAYS[weekdayIndex(date)].slice(0, 3).toLowerCase()} ${dayOfMonth(date)}.`
/** 07, 11:30: the hour alone where it is on the hour. */
export const hm = (minute: Minute) => clockText(minute, true)
export const span = (start: Minute, end: Minute) => spanText(start, end, true)
