import { dateRange, type ISODate } from './dates'
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
 * belongs to, or null for bookings that are no project in the Kalender.
 */
export const buildWindows = (bookings: VenueBooking[], projectOf: (booking: VenueBooking) => string | null): Windows => {
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
      add(key(project, ALL_HALLS, phase), dates)
    }
  }
  return windows
}

/**
 * The window of one row. A row for a hall its project has booked gets that hall's days; a row for all
 * halls, for an unresolved location or for a hall the project has not booked gets the days of all the
 * project's halls together. Undefined when the hall calendar gives the project no such phase.
 */
export const windowFor = (windows: Windows, project: string, hall: string | undefined, phase: WorkPhase | ''): Set<ISODate> | undefined => {
  if (!phase) return undefined
  return (hall !== undefined ? windows.get(key(project, hall, phase)) : undefined) ?? windows.get(key(project, ALL_HALLS, phase))
}
