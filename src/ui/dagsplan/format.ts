import { dayOfMonth, weekdayIndex, type ISODate } from '../../domain/dates'
import type { CompetenceKey, CompetenceStyle, Minute } from '../../domain/types'

/** How the work plans write dates, times and colours. */

export const WEEKDAYS = ['Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag', 'Søndag']
export const MONTHS = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember']

export const longDate = (date: ISODate) => `${WEEKDAYS[weekdayIndex(date)]} ${dayOfMonth(date)}. ${MONTHS[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`
export const shortDate = (date: ISODate) => `${WEEKDAYS[weekdayIndex(date)].slice(0, 3).toLowerCase()} ${dayOfMonth(date)}.`
/** 07, 11:30: the hour alone where it is on the hour. */
export const hm = (minute: Minute) => (minute % 60 ? `${Math.floor(minute / 60)}:${String(minute % 60).padStart(2, '0')}` : String(Math.floor(minute / 60)).padStart(2, '0'))
export const span = (start: Minute, end: Minute) => `${hm(start)}–${hm(end)}`


/** The colour a competence has, as the Kalender draws it. */
export const colorOf = (styles: Map<CompetenceKey, CompetenceStyle>, key: CompetenceKey) => `var(--${styles.get(key)?.color ?? 'line-slate'})`

