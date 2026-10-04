import { describe, expect, it } from 'vitest'
import { calendarRange } from './calendarRange'
import type { AllocationRow, CapacityLine, VenueBooking } from './types'

const booking = (phases: VenueBooking['phases']): VenueBooking => ({ id: 'b', hall: 'C', eventName: 'VVS', status: 'confirmed', phases })
const empty = { venue: [], allocations: [], capacity: [] }

describe('calendar period', () => {
  it('spans whole months from the first to the last hall booking', () => {
    const venue = [
      booking({ assembly: { start: '2026-09-28', end: '2026-10-07' }, event: { start: '2026-10-14', end: '2026-10-16' } }),
      booking({ event: { start: '2027-02-03', end: '2027-02-05' }, dismantle: { start: '2027-02-06', end: '2027-02-08' } }),
    ]
    expect(calendarRange({ ...empty, venue }, '2026-10-04')).toEqual({ start: '2026-09-01', end: '2027-02-28' })
  })

  it('always includes today', () => {
    const venue = [booking({ event: { start: '2027-02-03', end: '2027-02-05' } })]
    expect(calendarRange({ ...empty, venue }, '2026-10-04')).toEqual({ start: '2026-10-01', end: '2027-02-28' })
    expect(calendarRange(empty, '2028-02-10')).toEqual({ start: '2028-02-01', end: '2028-02-29' })
  })

  it('never cuts off days that are planned or staffed', () => {
    const allocations = [{ fte: { '2026-06-30': 2 } } as unknown as AllocationRow]
    const capacity = [{ values: { '2027-05-02': 3 }, hours: { '2027-06-01': 4 } } as unknown as CapacityLine]
    const venue = [booking({ event: { start: '2026-10-14', end: '2026-10-16' } })]
    expect(calendarRange({ venue, allocations, capacity }, '2026-10-04')).toEqual({ start: '2026-06-01', end: '2027-06-30' })
  })
})
