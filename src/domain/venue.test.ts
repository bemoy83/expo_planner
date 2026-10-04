import { describe, expect, it } from 'vitest'
import { buildHallCalendar, dominantEntry, hallNames } from './venue'
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

  it('orders halls alphabetically', () => {
    expect(hallNames([booking({ hall: 'STUDIO2' }), booking({ hall: 'A1' }), booking({ hall: 'C' })])).toEqual(['A1', 'C', 'STUDIO2'])
  })
})
