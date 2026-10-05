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
  /** Where the event's name belongs: the first day of the event itself (the arrangement phase), or the first day when the stretch has none. */
  anchor: ISODate
}

/**
 * The stretches of a hall's calendar, in date order, each with the day its event's name is anchored to.
 */
export const hallRuns = (days: Map<ISODate, HallDayEntry[]>): HallRun[] => {
  const runs: HallRun[] = []
  let previous: ISODate | null = null
  for (const date of [...days.keys()].sort()) {
    const entries = days.get(date)!
    if (!entries.length) continue
    const { eventName, phase } = dominantEntry(entries)
    const last = runs.at(-1)
    // The same event on the very next day continues the stretch; a gap or another event starts a new one.
    if (last && last.eventName === eventName && previous !== null && daysBetween(previous, date) === 1) last.end = date
    else runs.push({ eventName, start: date, end: date, anchor: '' })
    const run = runs.at(-1)!
    if (!run.anchor && phase === 'event') run.anchor = date
    previous = date
  }
  for (const run of runs) run.anchor ||= run.start
  return runs
}

/** Where a phase falls in the life of an event, for putting the one that is leaving before the one that is arriving. */
const SEQUENCE: Record<VenuePhase, number> = { dismantle: 0, movingOut: 1, event: 2, movingIn: 3, assembly: 4 }

/**
 * Build-up and tear-down are the venue's own phases; moving in, the arrangement and moving out are the
 * customer's. A day can be shared between two events only within one kind: tear-down with build-up, or
 * moving out with moving in. The arrangement itself is never shared.
 */
const SHARES: Partial<Record<VenuePhase, 'venue' | 'moving'>> = { assembly: 'venue', dismantle: 'venue', movingIn: 'moving', movingOut: 'moving' }

/**
 * The two events to show side by side on a day when a hall is shared: the one with the most central phase
 * and another whose phase may share a day with it, the one on its way out first (MO before MI, D before A).
 * Null when the day belongs to one event alone, as when a customer's phase meets the venue's.
 */
export const splitEntries = (entries: HallDayEntry[]): [HallDayEntry, HallDayEntry] | null => {
  if (entries.length < 2) return null
  const [a, ...rest] = [...entries].sort((x, y) => PRIORITY[y.phase] - PRIORITY[x.phase])
  const b = SHARES[a.phase] && rest.find((entry) => SHARES[entry.phase] === SHARES[a.phase])
  if (!b) return null
  return SEQUENCE[a.phase] <= SEQUENCE[b.phase] ? [a, b] : [b, a]
}

/**
 * The hall phase of each day of a project, across all its halls, for the strip on the project's line.
 * Where the halls differ on a day (one still being built while another has moved in), the earliest
 * phase in the life of the event shows. `projectOf` gives the project a booking belongs to, or null.
 */
export const projectPhases = (bookings: VenueBooking[], projectOf: (booking: VenueBooking) => string | null): Map<string, Map<ISODate, VenuePhase>> => {
  const projects = new Map<string, Map<ISODate, VenuePhase>>()
  for (const booking of bookings) {
    const project = projectOf(booking)
    if (project === null) continue
    let days = projects.get(project)
    if (!days) projects.set(project, (days = new Map()))
    for (const phase of VENUE_PHASES) {
      const span = booking.phases[phase]
      if (!span) continue
      for (const date of dateRange(span.start, span.end)) {
        const existing = days.get(date)
        if (!existing || VENUE_PHASES.indexOf(phase) < VENUE_PHASES.indexOf(existing)) days.set(date, phase)
      }
    }
  }
  return projects
}
