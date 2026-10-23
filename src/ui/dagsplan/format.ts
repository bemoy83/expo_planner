import { capitalized, dayOfMonth, monthName, weekdayName, weekdayShort, type ISODate } from '../../domain/dates'
import type { Minute } from '../../domain/types'
import { clockText, spanText } from '../format'

/** How the work plans write dates and times. */

/** «Mandag 5. oktober 2026». */
export const longDate = (date: ISODate) => `${capitalized(weekdayName(date))} ${dayOfMonth(date)}. ${monthName(date)} ${date.slice(0, 4)}`
/** «man 5.». */
export const shortDate = (date: ISODate) => `${weekdayShort(date)} ${dayOfMonth(date)}.`
/** 07, 11:30: the hour alone where it is on the hour. */
export const hm = (minute: Minute) => clockText(minute, true)
export const span = (start: Minute, end: Minute) => spanText(start, end, true)
