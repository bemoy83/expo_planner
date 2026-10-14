import { describe, expect, it } from 'vitest'
import { fromLastYear, parseHours, previousProjectNo, projectHallSpans, projectTiming, spanText, usualAvdeling, workdays } from './ownDemand'
import type { DemandLine, VenueBooking } from './types'

describe('parseHours', () => {
  it('reads plain hours with a comma or a point', () => {
    expect(parseHours('12', 7.5)).toEqual({ hours: 12 })
    expect(parseHours('12,5', 7.5)).toEqual({ hours: 12.5 })
    expect(parseHours('8 t', 7.5)).toEqual({ hours: 8 })
    expect(parseHours('  ', 7.5)).toBeNull()
  })

  it('reads people by days or by hours', () => {
    expect(parseHours('3p 2d', 7.5)).toEqual({ hours: 45, read: '3 pers × 2 dager' })
    expect(parseHours('2p 6t', 7.5)).toEqual({ hours: 12, read: '2 pers × 6 t' })
    expect(parseHours('2 pers x 1 dag', 8)).toEqual({ hours: 16, read: '2 pers × 1 dag' })
  })

  it('reads a product and days of work', () => {
    expect(parseHours('3x7,5', 7.5)).toEqual({ hours: 22.5, read: '3 × 7,5' })
    expect(parseHours('4d', 7.5)).toEqual({ hours: 30, read: '4 dagsverk' })
  })

  it('says it cannot read anything else', () => {
    expect(parseHours('mange', 7.5)!.hours).toBeNaN()
  })
})

const booking = (hall: string, assembly: [string, string], dismantle?: [string, string]): VenueBooking => ({
  id: hall,
  hall,
  eventName: 'VVS 2026',
  status: 'Bekreftet',
  phases: { assembly: { start: assembly[0], end: assembly[1] }, event: { start: '2026-10-23', end: '2026-10-25' }, ...(dismantle ? { dismantle: { start: dismantle[0], end: dismantle[1] } } : {}) },
})

describe('projectHallSpans', () => {
  it('gives each booked hall of a project its build-up and tear-down days', () => {
    const spans = projectHallSpans([booking('D1', ['2026-10-19', '2026-10-22'], ['2026-10-27', '2026-10-28']), booking('C', ['2026-10-20', '2026-10-22'])], [{ name: 'VVS 2026', projectNo: '26970' }])
    expect(spans.get('26970')!.get('D1')).toEqual({ assembly: { start: '2026-10-19', end: '2026-10-22' }, dismantle: { start: '2026-10-27', end: '2026-10-28' } })
    expect(spans.get('26970')!.get('C')).toEqual({ assembly: { start: '2026-10-20', end: '2026-10-22' } })
  })
})

describe('projectTiming', () => {
  const halls = projectHallSpans([booking('D1', ['2026-10-19', '2026-10-22'], ['2026-10-27', '2026-10-28'])], [{ name: 'VVS 2026', projectNo: '26970' }]).get('26970')

  it('says how far off the build-up is', () => {
    expect(projectTiming(halls, '2026-10-14')).toMatchObject({ group: 'now', text: 'Opp om 5 d', tone: 'soon' })
    expect(projectTiming(halls, '2026-10-01')).toMatchObject({ group: 'now', text: 'Opp om 18 d', tone: 'near' })
    expect(projectTiming(halls, '2026-09-01')).toMatchObject({ group: 'later', text: 'Opp 19. okt' })
  })

  it('says it is being built, torn down or done', () => {
    expect(projectTiming(halls, '2026-10-20')).toMatchObject({ group: 'now', text: 'Bygges nå' })
    expect(projectTiming(halls, '2026-10-25')).toMatchObject({ group: 'now', text: 'Riving 27.–28. okt' })
    expect(projectTiming(halls, '2026-11-02')).toMatchObject({ group: 'done', text: 'Ferdig' })
  })
})

describe('the days of a span', () => {
  it('counts working days only, and writes the span short', () => {
    expect(workdays({ start: '2026-10-16', end: '2026-10-19' })).toBe(2)
    expect(spanText({ start: '2026-09-30', end: '2026-10-02' })).toBe('30. sep–2. okt')
  })
})

describe('usualAvdeling', () => {
  it('is the department most rows have', () => {
    expect(usualAvdeling([{ avdeling: '65' }, { avdeling: '64' }, { avdeling: '65' }, { avdeling: '' }])).toBe('65')
    expect(usualAvdeling([])).toBe('')
  })
})

describe('fromLastYear', () => {
  const line = (id: string, projectNo: string, workType: string, hall: string, notIn?: string[]): DemandLine => ({
    id, projectNo, projectName: '', source: 'Egen registrering', workType, quantity: null, unit: '', stand: '', hall, competence: 'Rigg', basis: 'Planlagt', assemblyHours: 8, dismantleHours: 4, comment: '', origin: 'manual', notIn,
  })

  it('finds the year before by the series of the number', () => {
    expect(previousProjectNo('26231')).toBe('25231')
    expect(previousProjectNo('26VAM')).toBe('')
  })

  it('offers last year\'s lines that are not registered this year, by work and hall', () => {
    const own = [line('a', '25231', 'Rigg', 'D1'), line('b', '25231', 'Scene', 'C'), line('c', '25231', 'Lys', 'C', ['26231']), line('d', '26231', 'rigg', 'D1')]
    const found = fromLastYear(own, '26231')
    expect(found.previous).toBe('25231')
    expect(found.missing.map((l) => l.id)).toEqual(['b'])
    expect(found.present).toBe(1)
  })
})
