import { describe, expect, it } from 'vitest'
import type { VenueBooking } from './types'
import { diffVenue, exportWindow, mergeVenue } from './venueImport'

const booking = (id: string, eventName: string, hall: string, eventStart: string, extra: VenueBooking['phases'] = {}): VenueBooking => ({
  id,
  hall,
  eventName,
  status: 'confirmed',
  phases: { event: { start: eventStart, end: eventStart }, ...extra },
})

const existing = [
  booking('a', 'VVS DAGENE 2026', 'C', '2026-10-14'),
  booking('b', 'VVS DAGENE 2026', 'D1', '2026-10-14'),
  booking('c', 'HAGE 2026', 'B1', '2026-04-10'),
  booking('d', 'BYGG 2027', 'A1', '2027-03-02'),
  booking('e', 'MØTE', 'MEET5', '2026-05-05'),
]
const incoming = [
  booking('n1', 'VVS DAGENE 2026', 'C', '2026-10-14'),
  booking('n2', 'VVS DAGENE 2026', 'E', '2026-10-14'),
  booking('n3', 'HAGE 2026', 'B1', '2026-04-10'),
  booking('n4', 'NY MESSE 2026', 'B2', '2026-11-01'),
]
const window = { from: '2026-01-01', to: '2026-12-31' }

describe('Venyou export', () => {
  it('takes its period from the file name, or from its dates', () => {
    expect(exportWindow('location_format_from-2026-01-01_to-2026-12-31.xlsx', incoming)).toEqual(window)
    expect(exportWindow('haller.xlsx', incoming)).toEqual({ from: '2026-04-10', to: '2026-11-01' })
    expect(exportWindow('haller.xlsx', [])).toBeNull()
  })

  it('replaces bookings inside the period and keeps those outside it', () => {
    const merged = mergeVenue(existing, incoming, window)
    expect(merged.map((b) => b.id).sort()).toEqual(['d', 'n1', 'n2', 'n3', 'n4'])
  })

  it('uses the earliest date when a booking has no event period', () => {
    const buildOnly: VenueBooking = { id: 'x', hall: 'C', eventName: 'Rigg', status: '', phases: { assembly: { start: '2026-12-30', end: '2027-01-02' } } }
    expect(mergeVenue([buildOnly], [], window)).toEqual([])
    expect(mergeVenue([buildOnly], [], { from: '2027-01-01', to: '2027-12-31' })).toEqual([buildOnly])
  })

  it('leaves bookings with a status the export does not contain', () => {
    const maintenance: VenueBooking = { ...booking('m', 'SERVICE SKILLEVEGGER', 'A1', '2026-08-03'), status: 'maintenance' }
    expect(mergeVenue([...existing, maintenance], incoming, window).map((b) => b.id)).toContain('m')
    expect(diffVenue([...existing, maintenance], incoming, window).removed).toEqual(['MØTE'])
    const unlabelled = incoming.map((b) => ({ ...b, status: '' }))
    expect(mergeVenue([...existing, maintenance], unlabelled, window).map((b) => b.id)).not.toContain('m')
  })

  it('reports new, changed and removed events', () => {
    expect(diffVenue(existing, incoming, window)).toEqual({
      added: ['NY MESSE 2026'],
      changed: ['VVS DAGENE 2026'],
      removed: ['MØTE'],
      unchanged: 1,
    })
  })
})
