import { describe, expect, it } from 'vitest'
import { buildHallCalendar, dominantEntry, hallNames, hallRuns } from './venue'
import type { VenueBooking } from './types'

const booking = (overrides: Partial<VenueBooking>): VenueBooking => ({
  id: 'b',
  hall: 'C',
  eventName: 'VVS DAGENE 2026',
  status: 'confirmed',
  phases: {},
  ...overrides,
})

describe('hall calendar', () => {
  const calendar = buildHallCalendar([
    booking({
      phases: {
        assembly: { start: '2026-09-28', end: '2026-10-07' },
        movingIn: { start: '2026-10-07', end: '2026-10-08' },
        event: { start: '2026-10-09', end: '2026-10-09' },
      },
    }),
    booking({ id: 'b2', eventName: 'OSLO MOTOR SHOW', phases: { assembly: { start: '2026-10-08', end: '2026-10-08' } } }),
    booking({ id: 'b3', hall: 'A1', eventName: 'Annet', phases: { event: { start: '2026-10-08', end: '2026-10-08' } } }),
  ])

  it('lists each event once per day with its most central phase', () => {
    expect(calendar.get('C')!.get('2026-09-28')).toEqual([{ eventName: 'VVS DAGENE 2026', phase: 'assembly' }])
    expect(calendar.get('C')!.get('2026-10-07')).toEqual([{ eventName: 'VVS DAGENE 2026', phase: 'movingIn' }])
    expect(calendar.get('C')!.get('2026-10-08')).toHaveLength(2)
    expect(dominantEntry(calendar.get('C')!.get('2026-10-08')!).eventName).toBe('VVS DAGENE 2026')
    expect(calendar.get('C')!.get('2026-10-10')).toBeUndefined()
  })

  it('gives one stretch per event, with the name anchored to the first day of the arrangement', () => {
    expect(hallRuns(calendar.get('C')!)).toEqual([{ eventName: 'VVS DAGENE 2026', start: '2026-09-28', end: '2026-10-09', anchor: '2026-10-09' }])
    expect(hallRuns(calendar.get('A1')!)).toEqual([{ eventName: 'Annet', start: '2026-10-08', end: '2026-10-08', anchor: '2026-10-08' }])
  })

  it('starts a new stretch after a gap or when another event takes over', () => {
    const days = buildHallCalendar([
      booking({ phases: { assembly: { start: '2026-03-02', end: '2026-03-03' }, dismantle: { start: '2026-03-06', end: '2026-03-06' } } }),
      booking({ id: 'b2', eventName: 'Hage 2026', phases: { event: { start: '2026-03-03', end: '2026-03-04' } } }),
    ]).get('C')!
    expect(hallRuns(days).map((r) => `${r.eventName} ${r.start.slice(8)}-${r.end.slice(8)}`)).toEqual(['VVS DAGENE 2026 02-02', 'Hage 2026 03-04', 'VVS DAGENE 2026 06-06'])
    // A stretch without arrangement days carries the name on its first day.
    expect(hallRuns(days).map((r) => r.anchor.slice(8))).toEqual(['02', '03', '06'])
  })

  it('orders halls alphabetically', () => {
    expect(hallNames([booking({ hall: 'STUDIO2' }), booking({ hall: 'A1' }), booking({ hall: 'C' })])).toEqual(['A1', 'C', 'STUDIO2'])
  })
})
