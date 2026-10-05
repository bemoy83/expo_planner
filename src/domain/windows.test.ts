import { describe, expect, it } from 'vitest'
import type { VenueBooking } from './types'
import { buildWindows, windowFor } from './windows'

const booking = (id: string, hall: string, eventName: string, phases: VenueBooking['phases']): VenueBooking => ({ id, hall, eventName, status: '', phases })

const bookings = [
  booking('1', 'C', 'VVS 2026', { assembly: { start: '2026-10-05', end: '2026-10-07' }, event: { start: '2026-10-08', end: '2026-10-09' }, dismantle: { start: '2026-10-10', end: '2026-10-10' } }),
  booking('2', 'D1', 'VVS 2026', { assembly: { start: '2026-10-06', end: '2026-10-08' }, movingIn: { start: '2026-10-08', end: '2026-10-08' } }),
  booking('3', 'C', 'Hage 2026', { assembly: { start: '2026-03-02', end: '2026-03-02' } }),
  booking('4', 'E', 'Internt møte', { event: { start: '2026-03-02', end: '2026-03-02' } }),
]
const windows = buildWindows(bookings, (b) => (b.eventName === 'Internt møte' ? null : b.eventName === 'VVS 2026' ? '26970' : '26100'))
const days = (set: Set<string> | undefined) => (set ? [...set].sort().map((d) => d.slice(8)).join(' ') : undefined)

describe('the days a row can be worked on', () => {
  it('gives build-up days to montering and tear-down days to demontering, per hall', () => {
    expect(days(windowFor(windows, '26970', 'C', 'Montering'))).toBe('05 06 07')
    expect(days(windowFor(windows, '26970', 'c', 'Demontering'))).toBe('10')
    expect(days(windowFor(windows, '26970', 'D1', 'Montering'))).toBe('06 07 08')
  })

  it('keeps the projects apart in a shared hall', () => {
    expect(days(windowFor(windows, '26100', 'C', 'Montering'))).toBe('02')
  })

  it('uses all the halls of the project for a row without a hall of its own', () => {
    expect(days(windowFor(windows, '26970', undefined, 'Montering'))).toBe('05 06 07 08')
    expect(days(windowFor(windows, '26970', 'Uavklart', 'Montering'))).toBe('05 06 07 08')
    expect(days(windowFor(windows, '26970', 'E', 'Montering'))).toBe('05 06 07 08')
  })

  it('has no window where the hall calendar gives the project no such phase', () => {
    expect(windowFor(windows, '26970', 'D1', 'Demontering')).toEqual(windowFor(windows, '26970', undefined, 'Demontering'))
    expect(windowFor(windows, '26100', 'C', 'Demontering')).toBeUndefined()
    expect(windowFor(windows, 'ukjent', 'C', 'Montering')).toBeUndefined()
    expect(windowFor(windows, '26970', 'C', '')).toBeUndefined()
  })
})
