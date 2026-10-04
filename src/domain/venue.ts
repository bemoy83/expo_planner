import { dateRange, type ISODate } from './dates'
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
