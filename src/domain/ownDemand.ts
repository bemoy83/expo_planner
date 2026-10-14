import { daysBetween, dateRange, type ISODate } from './dates'
import { dayType } from './holidays'
import { decimalText } from './numbers'
import { eventKey, venueEvents } from './projects'
import type { DateSpan, ProjectRef, VenueBooking, VismaRow } from './types'
import { anchorDate } from './venueImport'

/**
 * The planner's own demand lines (Egen registrering): work that is not sold through Visma but follows the build-up and
 * tear-down of an event. Hours typed in short, the days a project builds up and tears down in each of its halls, and
 * where a project stands in time.
 */

/** Hours as typed: the hours, and how they were read where it was more than a number («3 pers × 2 dager»). Hours are NaN for a text that cannot be read. */
export interface TypedHours {
  hours: number
  read?: string
}

const num = (text: string) => Number(text)
const shown = (n: number) => decimalText(Math.round(n * 100) / 100)

/**
 * Hours typed in short: «12» or «12,5» hours; «3p 2d» three people two days; «2p 6t» two people six hours; «3x7,5»
 * three times seven and a half; «4d» four days' work. A day is `hoursPerDay`. Null for an empty text.
 */
export const parseHours = (text: string, hoursPerDay: number): TypedHours | null => {
  const t = text.trim().toLowerCase().replace(/,/g, '.').replace(/\s+/g, ' ')
  if (!t) return null
  const n = '(\\d+(?:\\.\\d+)?)'
  let m = t.match(new RegExp(`^${n} ?(?:p|pers|personer|mann)\\.? ?[x×*]? ?${n} ?(d|dag|dager|t|timer|h)?$`))
  if (m) {
    const people = num(m[1])
    const count = num(m[2])
    const inHours = !!m[3] && /^[th]/.test(m[3])
    return { hours: inHours ? people * count : people * count * hoursPerDay, read: `${shown(people)} pers × ${shown(count)} ${inHours ? 't' : count === 1 ? 'dag' : 'dager'}` }
  }
  if ((m = t.match(new RegExp(`^${n} ?[x×*] ?${n}$`)))) return { hours: num(m[1]) * num(m[2]), read: `${shown(num(m[1]))} × ${shown(num(m[2]))}` }
  if ((m = t.match(new RegExp(`^${n} ?(?:d|dag|dager)$`)))) return { hours: num(m[1]) * hoursPerDay, read: `${shown(num(m[1]))} dagsverk` }
  if ((m = t.match(new RegExp(`^${n} ?(?:t|timer|h)?$`)))) return { hours: num(m[1]) }
  return { hours: NaN, read: 'forstår ikke' }
}

/** The build-up and tear-down days of a project in one hall, from the hall calendar. */
export interface HallSpans {
  assembly?: DateSpan
  dismantle?: DateSpan
}

const widen = (span: DateSpan | undefined, other: DateSpan): DateSpan =>
  span ? { start: other.start < span.start ? other.start : span.start, end: other.end > span.end ? other.end : span.end } : { ...other }

/** Per project number, the build-up and tear-down days of each hall it has booked, from the first day to the last. */
export const projectHallSpans = (bookings: VenueBooking[], projects: ProjectRef[]): Map<string, Map<string, HallSpans>> => {
  const projectOfEvent = new Map(venueEvents(bookings, projects).filter((event) => event.projectNo).map((event) => [event.key, event.projectNo]))
  const spans = new Map<string, Map<string, HallSpans>>()
  for (const booking of bookings) {
    const projectNo = projectOfEvent.get(eventKey(booking.eventName, anchorDate(booking)))
    if (!projectNo) continue
    const halls = spans.get(projectNo) ?? new Map<string, HallSpans>()
    const hall = halls.get(booking.hall) ?? {}
    if (booking.phases.assembly) hall.assembly = widen(hall.assembly, booking.phases.assembly)
    if (booking.phases.dismantle) hall.dismantle = widen(hall.dismantle, booking.phases.dismantle)
    halls.set(booking.hall, hall)
    spans.set(projectNo, halls)
  }
  return spans
}

/** The span of one phase over all the halls of a project. */
export const wholeSpan = (halls: Map<string, HallSpans> | undefined, phase: keyof HallSpans): DateSpan | undefined => {
  let whole: DateSpan | undefined
  for (const spans of halls?.values() ?? []) if (spans[phase]) whole = widen(whole, spans[phase]!)
  return whole
}

/** The working days of a span: neither weekends nor holidays. At least one, as the work is done on some day. */
export const workdays = (span: DateSpan): number => Math.max(1, dateRange(span.start, span.end).filter((date) => dayType(date) === 'arbeidsdag').length)

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des']
const dm = (date: ISODate) => ({ day: Number(date.slice(8, 10)), month: MONTHS[Number(date.slice(5, 7)) - 1] })

/** «19.–22. okt», «30. sep–2. okt», «4. nov». */
export const spanText = (span: DateSpan): string => {
  const a = dm(span.start)
  const b = dm(span.end)
  if (span.start === span.end) return `${a.day}. ${a.month}`
  return a.month === b.month ? `${a.day}.–${b.day}. ${b.month}` : `${a.day}. ${a.month}–${b.day}. ${b.month}`
}

/** Where a project stands from today: being built or soon, later, or done. */
export interface ProjectTiming {
  group: 'now' | 'later' | 'done'
  text: string
  /** Builds up within a week («soon»), within three («near»), or neither. */
  tone: 'now' | 'soon' | 'near' | ''
  /** The first day of its build-up, for the order of the list. */
  start: ISODate
}

/** How far a project is from today, by its build-up and tear-down over all its halls. Undefined for a project the hall calendar has no build-up for. */
export const projectTiming = (halls: Map<string, HallSpans> | undefined, today: ISODate): ProjectTiming | undefined => {
  const up = wholeSpan(halls, 'assembly')
  if (!up) return undefined
  const down = wholeSpan(halls, 'dismantle')
  const toStart = daysBetween(today, up.start)
  const toEnd = daysBetween(today, up.end)
  if (down && daysBetween(today, down.end) < 0) return { group: 'done', text: 'Ferdig', tone: '', start: up.start }
  if (!down && toEnd < 0) return { group: 'done', text: 'Ferdig', tone: '', start: up.start }
  if (toStart <= 0 && toEnd >= 0) return { group: 'now', text: 'Bygges nå', tone: 'now', start: up.start }
  if (toEnd < 0) return { group: 'now', text: `Riving ${spanText(down!)}`, tone: '', start: up.start }
  if (toStart <= 21) return { group: 'now', text: toStart === 1 ? 'Opp i morgen' : `Opp om ${toStart} d`, tone: toStart <= 7 ? 'soon' : 'near', start: up.start }
  return { group: 'later', text: `Opp ${spanText({ start: up.start, end: up.start })}`, tone: '', start: up.start }
}

/** The Avdeling most of a project's Visma rows have: what a new own line in the project starts with. */
export const usualAvdeling = (rows: Pick<VismaRow, 'avdeling'>[]): string => {
  const counts = new Map<string, number>()
  for (const row of rows) if (row.avdeling.trim()) counts.set(row.avdeling.trim(), (counts.get(row.avdeling.trim()) ?? 0) + 1)
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? ''
}
