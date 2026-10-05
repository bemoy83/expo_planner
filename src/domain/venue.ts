import { dateRange, daysBetween, type ISODate } from './dates'
import { VENUE_PHASES, type VenueBooking, type VenuePhase } from './types'

export interface HallDayEntry {
  eventName: string
  phase: VenuePhase
}

export const PHASE_CODES: Record<VenuePhase, string> = {
  assembly: 'A',
  movingIn: 'MI',
  event: 'E',
  movingOut: 'MO',
  dismantle: 'D',
}

export const PHASE_LABELS: Record<VenuePhase, string> = {
  assembly: 'Montering',
  movingIn: 'Innflytting',
  event: 'Arrangement',
  movingOut: 'Utflytting',
  dismantle: 'Demontering',
}

/** When phases overlap on one day, the more central one wins (event over moving over build). */
const PRIORITY: Record<VenuePhase, number> = { event: 5, movingIn: 4, movingOut: 4, assembly: 3, dismantle: 3 }

/** hall → date → events present that day, one entry per event (its dominant phase). */
export type HallCalendar = Map<string, Map<ISODate, HallDayEntry[]>>

export const buildHallCalendar = (bookings: VenueBooking[]): HallCalendar => {
  const calendar: HallCalendar = new Map()
  for (const booking of bookings) {
    let days = calendar.get(booking.hall)
    if (!days) calendar.set(booking.hall, (days = new Map()))
    for (const phase of VENUE_PHASES) {
      const span = booking.phases[phase]
      if (!span) continue
      for (const date of dateRange(span.start, span.end)) {
        const entries = days.get(date) ?? []
        const existing = entries.find((e) => e.eventName === booking.eventName)
        if (!existing) entries.push({ eventName: booking.eventName, phase })
        else if (PRIORITY[phase] > PRIORITY[existing.phase]) existing.phase = phase
        days.set(date, entries)
      }
    }
  }
  return calendar
}

/** Halls in the workbook's order: alphabetical, as SORT(UNIQUE(Locations)) gives. */
export const hallNames = (bookings: VenueBooking[]): string[] =>
  [...new Set(bookings.map((b) => b.hall))].sort((a, b) => a.localeCompare(b, 'nb'))

export const dominantEntry = (entries: HallDayEntry[]): HallDayEntry =>
  entries.reduce((best, e) => (PRIORITY[e.phase] > PRIORITY[best.phase] ? e : best))

/** One stretch of days in a hall where the same event is the main one. */
export interface HallRun {
  eventName: string
  start: ISODate
  end: ISODate
}

/**
 * The stretches of a hall's calendar, in date order: each is where one event's name belongs,
 * anchored to the first day of the stretch.
 */
export const hallRuns = (days: Map<ISODate, HallDayEntry[]>): HallRun[] => {
  const runs: HallRun[] = []
  let previous: ISODate | null = null
  for (const date of [...days.keys()].sort()) {
    const entries = days.get(date)!
    if (!entries.length) continue
    const { eventName } = dominantEntry(entries)
    const last = runs.at(-1)
    // The same event on the very next day continues the stretch; a gap or another event starts a new one.
    if (last && last.eventName === eventName && previous !== null && daysBetween(previous, date) === 1) last.end = date
    else runs.push({ eventName, start: date, end: date })
    previous = date
  }
  return runs
}
