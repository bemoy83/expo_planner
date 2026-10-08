import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { VenueBooking } from '../domain/types'
import { diffVenue, exportWindow, mergeVenue } from '../domain/venueImport'
import { readVenyouExport } from './venyouExport'

/** Runs against the real export, which is kept out of the repository; skipped where it is missing. */
const EXPORT = 'location_format_from-2026-01-01_to-2026-12-31.xlsx'
const available = existsSync(`example_data/${EXPORT}`)

describe.skipIf(!available)('Venyou export (local data)', () => {
  const bookings = available ? readVenyouExport(new Uint8Array(readFileSync(`example_data/${EXPORT}`))) : []

  it('reads every hall booking with its phase dates', () => {
    expect(bookings).toHaveLength(493)
    expect(new Set(bookings.map((b) => b.hall)).size).toBe(18)
    const vvs = bookings.find((b) => b.eventName === 'VVS DAGENE 2026' && b.hall === 'C')!
    expect(vvs.phases).toMatchObject({ assembly: { start: '2026-09-28', end: '2026-10-07' }, event: { start: '2026-10-14', end: '2026-10-16' } })
  })

  it('replaces the 2026 bookings and keeps other years', () => {
    const window = exportWindow(EXPORT, bookings)!
    // An export speaks for the statuses it holds, so the bookings held from before carry one of them.
    const held = (id: string, year: number): VenueBooking => ({ id, hall: 'C', eventName: `Testmesse ${year}`, status: bookings[0].status, phases: { event: { start: `${year}-04-10`, end: `${year}-04-12` } } })
    const before = [held('old-2025', 2025), held('old-2026', 2026), held('old-2027', 2027)]
    const merged = mergeVenue(before, bookings, window)
    expect(diffVenue(before, bookings, window).removed).toContain('Testmesse 2026')
    expect(merged.filter((b) => b.id.startsWith('venyou-'))).toHaveLength(493)
    expect(merged.filter((b) => !b.id.startsWith('venyou-')).map((b) => b.id)).toEqual(['old-2025', 'old-2027'])
  })
})
