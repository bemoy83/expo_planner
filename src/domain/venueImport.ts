import type { ISODate } from './dates'
import { VENUE_PHASES, type VenueBooking } from './types'

/** Ids of bookings that came from a Venyou export read into the app. */
export const VENYOU_ID_PREFIX = 'venyou-'

export interface DateWindow {
  from: ISODate
  to: ISODate
}

const allDates = (booking: VenueBooking): ISODate[] => VENUE_PHASES.flatMap((phase) => (booking.phases[phase] ? [booking.phases[phase].start, booking.phases[phase].end] : []))

/** The date that decides which export a booking belongs to: the event start, or its earliest date. */
export const anchorDate = (booking: VenueBooking): ISODate | null => booking.phases.event?.start ?? allDates(booking).sort()[0] ?? null

/**
 * Identifies a booking across exports: hall, event name and anchor date.
 * The planner's choice to leave a booking out of the Kalender is stored under this key, so it survives a new export.
 */
export const venueKey = (booking: VenueBooking): string => [booking.hall, booking.eventName, anchorDate(booking) ?? ''].map((part) => part.trim().toLowerCase()).join('|')

export const visibleVenue = (bookings: VenueBooking[], hidden: Record<string, true> | undefined): VenueBooking[] =>
  hidden && Object.keys(hidden).length ? bookings.filter((booking) => !hidden[venueKey(booking)]) : bookings

/** Returns the hidden set with the given bookings shown or hidden. */
export const withHidden = (hidden: Record<string, true> | undefined, keys: string[], hide: boolean): Record<string, true> => {
  const next = { ...hidden }
  for (const key of keys) {
    if (hide) next[key] = true
    else delete next[key]
  }
  return next
}

const inWindow = (booking: VenueBooking, window: DateWindow): boolean => {
  const anchor = anchorDate(booking)
  return anchor !== null && anchor >= window.from && anchor <= window.to
}

/** A Venyou export names its period in the file name; otherwise the period is the span of its dates. */
export const exportWindow = (fileName: string, bookings: VenueBooking[]): DateWindow | null => {
  const named = /from-(\d{4}-\d{2}-\d{2})_to-(\d{4}-\d{2}-\d{2})/.exec(fileName)
  if (named) return { from: named[1], to: named[2] }
  const anchors = bookings.flatMap((b) => anchorDate(b) ?? []).sort()
  return anchors.length ? { from: anchors[0], to: anchors.at(-1)! } : null
}

/**
 * Venyou exports are taken out per status (confirmed events in one, maintenance in another),
 * so an export only speaks for the statuses it contains. Without any status it speaks for everything.
 */
const coveredBy = (incoming: VenueBooking[], window: DateWindow) => {
  const statuses = new Set(incoming.map((b) => b.status.trim().toLowerCase()).filter(Boolean))
  return (booking: VenueBooking) => inWindow(booking, window) && (statuses.size === 0 || statuses.has(booking.status.trim().toLowerCase()))
}

/** Bookings the export speaks for (its period and statuses) are replaced by it; all others are kept. */
export const mergeVenue = (existing: VenueBooking[], incoming: VenueBooking[], window: DateWindow): VenueBooking[] => {
  const covered = coveredBy(incoming, window)
  return [...existing.filter((booking) => !covered(booking)), ...incoming]
}

export interface VenueDiff {
  added: string[]
  removed: string[]
  changed: string[]
  unchanged: number
}

const signature = (bookings: VenueBooking[]): string =>
  bookings
    .map((b) => `${b.hall}:${VENUE_PHASES.map((phase) => (b.phases[phase] ? `${b.phases[phase].start}/${b.phases[phase].end}` : '-')).join(',')}`)
    .sort()
    .join(';')

const byEvent = (bookings: VenueBooking[]): Map<string, VenueBooking[]> => {
  const map = new Map<string, VenueBooking[]>()
  for (const booking of bookings) map.set(booking.eventName, [...(map.get(booking.eventName) ?? []), booking])
  return map
}

/** What a new export changes for the events in its period: new, gone, or with different halls or dates. */
export const diffVenue = (existing: VenueBooking[], incoming: VenueBooking[], window: DateWindow): VenueDiff => {
  const before = byEvent(existing.filter(coveredBy(incoming, window)))
  const after = byEvent(incoming)
  const diff: VenueDiff = { added: [], removed: [], changed: [], unchanged: 0 }
  for (const [name, bookings] of after) {
    const old = before.get(name)
    if (!old) diff.added.push(name)
    else if (signature(old) !== signature(bookings)) diff.changed.push(name)
    else diff.unchanged += 1
  }
  for (const name of before.keys()) if (!after.has(name)) diff.removed.push(name)
  for (const list of [diff.added, diff.removed, diff.changed]) list.sort((a, b) => a.localeCompare(b, 'nb'))
  return diff
}
