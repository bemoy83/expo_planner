import { describe, expect, it } from 'vitest'
import { buildHallCalendar, dominantEntry, hallNames, hallRuns, projectPhases, splitEntries, type HallDayEntry } from './venue'
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

  it('splits a shared day only within the venue\'s phases or within moving, the one leaving first', () => {
    const entry = (eventName: string, phase: HallDayEntry['phase']): HallDayEntry => ({ eventName, phase })
    const codes = (entries: HallDayEntry[]) => splitEntries(entries)?.map((e) => `${e.eventName}:${e.phase}`)
    expect(codes([entry('Ny', 'movingIn'), entry('Gammel', 'movingOut')])).toEqual(['Gammel:movingOut', 'Ny:movingIn'])
    expect(codes([entry('Ny', 'assembly'), entry('Gammel', 'dismantle')])).toEqual(['Gammel:dismantle', 'Ny:assembly'])
    expect(codes([entry('Ny', 'assembly'), entry('Annen', 'assembly')])).toEqual(['Ny:assembly', 'Annen:assembly'])
    // A customer's phase is not split with the venue's, and the arrangement is not split at all.
    expect(codes([entry('Ny', 'assembly'), entry('Gammel', 'movingOut')])).toBeUndefined()
    expect(codes([entry('Ny', 'movingIn'), entry('Midt', 'event')])).toBeUndefined()
    expect(codes([entry('Ny', 'assembly'), entry('Midt', 'event'), entry('Gammel', 'movingOut')])).toBeUndefined()
    // The winning phase picks its partner among the others, past one it cannot share with.
    expect(codes([entry('Bygg', 'assembly'), entry('Ny', 'movingIn'), entry('Gammel', 'movingOut')])).toEqual(['Gammel:movingOut', 'Ny:movingIn'])
    expect(codes([entry('Alene', 'event')])).toBeUndefined()
  })

  it('orders halls alphabetically', () => {
    expect(hallNames([booking({ hall: 'STUDIO2' }), booking({ hall: 'A1' }), booking({ hall: 'C' })])).toEqual(['A1', 'C', 'STUDIO2'])
  })
})

describe('project phases', () => {
  const bookings = [
    booking({ id: 'c', hall: 'C', phases: { assembly: { start: '2026-10-05', end: '2026-10-06' }, movingIn: { start: '2026-10-07', end: '2026-10-07' }, event: { start: '2026-10-08', end: '2026-10-09' } } }),
    booking({ id: 'd', hall: 'D1', phases: { assembly: { start: '2026-10-06', end: '2026-10-07' }, event: { start: '2026-10-08', end: '2026-10-08' }, dismantle: { start: '2026-10-09', end: '2026-10-10' } } }),
    booking({ id: 'x', eventName: 'Annet', phases: { event: { start: '2026-10-05', end: '2026-10-05' } } }),
  ]
  const phases = projectPhases(bookings, (b) => (b.eventName === 'Annet' ? null : '26970'))

  it('gives each day of a project the phase of its halls', () => {
    const days = phases.get('26970')!
    expect(days.get('2026-10-05')).toBe('assembly')
    expect(days.get('2026-10-08')).toBe('event')
    expect(days.get('2026-10-10')).toBe('dismantle')
    expect(days.has('2026-10-11')).toBe(false)
  })

  it('shows the earliest phase where the halls differ', () => {
    const days = phases.get('26970')!
    // Hall C has moved in while D1 is still being built.
    expect(days.get('2026-10-07')).toBe('assembly')
    // Hall C still has the arrangement while D1 is being taken down.
    expect(days.get('2026-10-09')).toBe('event')
  })

  it('leaves out bookings that are no project', () => {
    expect([...phases.keys()]).toEqual(['26970'])
  })
})
