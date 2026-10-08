import type { ISODate } from './dates'
import { VENUE_PHASES, type Workspace } from './types'

export interface CalendarRange {
  start: ISODate
  end: ISODate
}

const monthStart = (date: ISODate): ISODate => `${date.slice(0, 7)}-01`

const monthEnd = (date: ISODate): ISODate => {
  const year = Number(date.slice(0, 4))
  const month = Number(date.slice(5, 7))
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
}

/**
 * The period the Kalender shows. It follows the hall bookings (the Venyou `location_format` data):
 * from the month of the first booking to the month of the last. It is widened where needed so that
 * today and anything already planned is never outside it.
 */
export const calendarRange = (workspace: Pick<Workspace, 'venue' | 'allocations'>, today: ISODate): CalendarRange => {
  let min = today
  let max = today
  const include = (date: ISODate) => {
    if (date < min) min = date
    if (date > max) max = date
  }
  for (const booking of workspace.venue) {
    for (const phase of VENUE_PHASES) {
      const span = booking.phases[phase]
      if (span) {
        include(span.start)
        include(span.end)
      }
    }
  }
  for (const row of workspace.allocations) for (const date in row.fte) include(date)
  return { start: monthStart(min), end: monthEnd(max) }
}
