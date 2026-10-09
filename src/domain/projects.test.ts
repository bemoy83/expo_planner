import { describe, expect, it } from 'vitest'
import { eventKey, mergeProjectList, venueEvents } from './projects'
import type { VenueBooking } from './types'

const booking = (eventName: string, hall: string, phases: VenueBooking['phases']): VenueBooking => ({ id: `${eventName}-${hall}`, hall, eventName, status: 'confirmed', phases })

const bookings = [
  booking('VVS DAGENE 2026', 'C', { assembly: { start: '2026-09-28', end: '2026-10-07' }, event: { start: '2026-10-14', end: '2026-10-16' }, dismantle: { start: '2026-10-20', end: '2026-10-21' } }),
  booking('VVS DAGENE 2026', 'D1', { event: { start: '2026-10-14', end: '2026-10-16' } }),
  booking('Oslo  Motor Show 2026', 'E', { event: { start: '2026-10-23', end: '2026-10-25' } }),
  booking('HAGE 2026', 'B1', { event: { start: '2026-04-10', end: '2026-04-12' } }),
]
const list = [
  { name: 'VVS DAGENE 2026', projectNo: '26970' },
  { name: 'VVS 2026', projectNo: '26970' },
  { name: 'oslo motor show 2026', projectNo: '26400' },
  { name: 'Hage 2026', projectNo: '26100' },
  { name: 'HAGE 2026', projectNo: '26101' },
]

describe('projects from Venyou events', () => {
  it('makes one project per event with its period and halls', () => {
    const events = venueEvents(bookings, {}, [])
    expect(events.map((e) => e.name)).toEqual(['HAGE 2026', 'VVS DAGENE 2026', 'Oslo  Motor Show 2026'])
    expect(events[1]).toMatchObject({ start: '2026-09-28', end: '2026-10-21', halls: ['C', 'D1'], projectNo: '', linkSource: 'none' })
  })

  it('takes the project number from the list when the name matches exactly one number', () => {
    const events = venueEvents(bookings, {}, list)
    expect(events.find((e) => e.name === 'VVS DAGENE 2026')).toMatchObject({ projectNo: '26970', linkSource: 'list' })
    expect(events.find((e) => e.name.startsWith('Oslo'))).toMatchObject({ projectNo: '26400', linkSource: 'list' })
    expect(events.find((e) => e.name === 'HAGE 2026')).toMatchObject({ projectNo: '', linkSource: 'none', ambiguous: true, candidates: ['26100', '26101'] })
  })

  it('lets a number set by hand win', () => {
    const key = eventKey('HAGE 2026', '2026-04-10')
    expect(venueEvents(bookings, { [key]: '26100' }, list).find((e) => e.key === key)).toMatchObject({ projectNo: '26100', linkSource: 'manual', ambiguous: false, candidates: ['26100', '26101'] })
  })

  it('merges a project list file into the list, without duplicates', () => {
    const merged = mergeProjectList(list, [{ name: 'vvs dagene 2026', projectNo: '26970' }, { name: 'Ny messe', projectNo: '27ELE' }, { name: '', projectNo: '1' }])
    expect(merged).toHaveLength(6)
    expect(merged[1]).toEqual({ name: 'Ny messe', projectNo: '27ELE' })
  })
})
