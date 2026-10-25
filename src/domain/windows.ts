import { addDays, dateRange, type ISODate } from './dates'
import { dayType } from './holidays'
import type { SharedPlace } from './locations'
import type { VenueBooking, WorkPhase } from './types'

/**
 * When the work of a planning row can take place: the build-up days (montering) or tear-down days
 * (demontering) the hall calendar gives its project in its hall. These are the venue's own phases;
 * moving in, the arrangement and moving out belong to the customer and are not work days for the crew.
 */
export type Windows = Map<string, Set<ISODate>>

const ALL_HALLS = '*'
const key = (project: string, hall: string, phase: WorkPhase) => `${project}|${hall.trim().toLowerCase()}|${phase}`

/**
 * The windows of every project, per hall and across its halls. `projectOf` gives the project a booking
 * belongs to, or null for bookings that are no project in the Kalender. A shared place (`places`), as «B» of
 * «B1» to «B4», has the days of its halls together.
 */
export const buildWindows = (bookings: VenueBooking[], projectOf: (booking: VenueBooking) => string | null, places: SharedPlace[] = []): Windows => {
  const windows: Windows = new Map()
  const add = (k: string, dates: ISODate[]) => {
    let set = windows.get(k)
    if (!set) windows.set(k, (set = new Set()))
    for (const date of dates) set.add(date)
  }
  for (const booking of bookings) {
    const project = projectOf(booking)
    if (project === null) continue
    const phases = [
      ['Montering', booking.phases.assembly],
      ['Demontering', booking.phases.dismantle],
    ] as const
    for (const [phase, span] of phases) {
      if (!span) continue
      const dates = dateRange(span.start, span.end)
      add(key(project, booking.hall, phase), dates)
      for (const place of places) if (place.halls.includes(booking.hall)) add(key(project, place.name, phase), dates)
      add(key(project, ALL_HALLS, phase), dates)
    }
  }
  return windows
}

/**
 * The window of one row. A row for a hall its project has booked gets that hall's days, and a row for a shared
 * place the days of the halls of it the project has booked; a row for all
 * halls, for an unresolved location or for a hall the project has not booked gets the days of all the
 * project's halls together. Undefined when the hall calendar gives the project no such phase.
 */
export const windowFor = (windows: Windows, project: string, hall: string | undefined, phase: WorkPhase | ''): Set<ISODate> | undefined => {
  if (!phase) return undefined
  return (hall !== undefined ? windows.get(key(project, hall, phase)) : undefined) ?? windows.get(key(project, ALL_HALLS, phase))
}

const lower = (text: string) => text.trim().toLowerCase()

/** How far from its window the free days of a row are looked for, in days of the calendar. */
const NEAR = 21

/**
 * The working days next to a row's window that its halls stand free in the hall calendar, nearest first: before the
 * build-up, after the tear-down (the planning engine's R6: the planner starts earlier where the hall is free before he
 * hires in). A day any booking has one of the halls for, in any phase, ends them; at most `max` are given. The halls are
 * those the project has booked of the row's hall or shared place, or all the project's halls for a row of all of them.
 */
export const freeDaysNear = (
  bookings: VenueBooking[],
  projectOf: (booking: VenueBooking) => string | null,
  places: SharedPlace[],
  project: string,
  hall: string | undefined,
  phase: WorkPhase | '',
  window: Set<ISODate> | undefined,
  max = 5,
): ISODate[] => {
  if (!phase || !window?.size) return []
  const own = bookings.filter((booking) => projectOf(booking) === project)
  const place = places.find((p) => hall !== undefined && lower(p.name) === lower(hall))
  const ofRow = own.filter((booking) => hall !== undefined && (lower(booking.hall) === lower(hall) || !!place?.halls.some((member) => lower(member) === lower(booking.hall))))
  const halls = new Set((ofRow.length ? ofRow : own).map((booking) => lower(booking.hall)))
  if (!halls.size) return []
  const booked = (date: ISODate) => bookings.some((booking) => halls.has(lower(booking.hall)) && Object.values(booking.phases).some((span) => span && span.start <= date && date <= span.end))
  const days = [...window].sort()
  const step = phase === 'Demontering' ? 1 : -1
  const found: ISODate[] = []
  let date = step < 0 ? days[0] : days.at(-1)!
  for (let i = 0; i < NEAR && found.length < max; i++) {
    date = addDays(date, step)
    if (booked(date)) break
    if (dayType(date) === 'arbeidsdag') found.push(date)
  }
  return found
}
