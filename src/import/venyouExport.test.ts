import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { diffVenue, exportWindow, mergeVenue } from '../domain/venueImport'
import { readPlannerWorkbook } from './plannerWorkbook'
import { readVenyouExport } from './venyouExport'

/** Runs against the real export, which is kept out of the repository; skipped where it is missing. */
const EXPORT = 'location_format_from-2026-01-01_to-2026-12-31.xlsx'
const PLANNER = 'example_data/Bemanning_Behov_24 måneder.xlsx'
const available = existsSync(`example_data/${EXPORT}`) && existsSync(PLANNER)

describe.skipIf(!available)('Venyou export (local data)', () => {
  const bookings = available ? readVenyouExport(new Uint8Array(readFileSync(`example_data/${EXPORT}`))) : []
  const workbook = available ? readPlannerWorkbook(new Uint8Array(readFileSync(PLANNER)), 'x').venue : []

  it('reads every hall booking with its phase dates', () => {
    expect(bookings).toHaveLength(493)
    expect(new Set(bookings.map((b) => b.hall)).size).toBe(18)
    const vvs = bookings.find((b) => b.eventName === 'VVS DAGENE 2026' && b.hall === 'C')!
    expect(vvs.phases).toMatchObject({ assembly: { start: '2026-09-28', end: '2026-10-07' }, event: { start: '2026-10-14', end: '2026-10-16' } })
  })

  it('replaces the 2026 bookings and keeps other years', () => {
    const window = exportWindow(EXPORT, bookings)!
    const merged = mergeVenue(workbook, bookings, window)
    const diff = diffVenue(workbook, bookings, window)
    expect(diff.unchanged).toBeGreaterThan(100)
    expect(merged.filter((b) => b.id.startsWith('venyou-'))).toHaveLength(493)
    expect(merged.length).toBeGreaterThan(493)
  })
})
