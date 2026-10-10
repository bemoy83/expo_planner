import { describe, expect, it } from 'vitest'
import { hallChoices, locateDemand, locateRows, placeNames, placeOf, readHall, resolveHall, sharedPlaces, suggestHall, UNRESOLVED_HALL, withAlias } from './locations'
import type { AllocationRow, DemandLine } from './types'
import { buildWindows, windowFor } from './windows'

const halls = ['A1', 'B1', 'B2', 'B3', 'C', 'D1', 'D2', 'E', 'MEZ']
/** The planner's rule for the letter D: it stands for D1. */
const rules = withAlias({}, 'D', 'D1')

describe('placing demand in the halls of the hall ledger', () => {
  it('matches a hall by name, with or without «Hall» in front, ignoring case', () => {
    expect(resolveHall('Hall C', halls)).toBe('C')
    expect(resolveHall(' hall c ', halls)).toBe('C')
    expect(resolveHall('mez', halls)).toBe('MEZ')
    expect(resolveHall('B2', halls)).toBe('B2')
    expect(readHall('Hall D2', halls, rules)).toEqual({ hall: 'D2', by: 'text' })
  })

  it('takes a hall letter for its numbered hall when there is one such hall', () => {
    expect(readHall('Hall A', halls)).toEqual({ hall: 'A1', by: 'text' })
  })

  it('takes a hall letter with several halls for their shared place, until a rule sends it to one of them', () => {
    expect(sharedPlaces(halls)).toEqual([{ name: 'B', halls: ['B1', 'B2', 'B3'] }, { name: 'D', halls: ['D1', 'D2'] }])
    expect(placeNames(halls)).toEqual(['A1', 'B', 'B1', 'B2', 'B3', 'C', 'D', 'D1', 'D2', 'E', 'MEZ'])
    expect(readHall('Hall B', halls, rules)).toEqual({ hall: 'B', by: 'shared' })
    expect(readHall('Hall D', halls)).toEqual({ hall: 'D', by: 'shared' })
    expect(readHall('Hall D', halls, rules)).toEqual({ hall: 'D1', by: 'rule' })
    expect(placeOf('Hall D', halls, rules, '26100')).toEqual({ hall: 'D1', by: 'rule', chosen: false, own: false })
    // The rule is told as a rule also for the letter by itself, and one for a hall that is gone does not count.
    expect(placeOf('D', halls, rules).by).toBe('rule')
    expect(readHall('Hall D', halls, withAlias({}, 'D', 'D9'))).toEqual({ hall: 'D', by: 'shared' })
  })

  it('leaves odd names, combinations and blanks unresolved', () => {
    for (const text of ['Hall F', 'Hall C og D', 'sceneomr hall C', 'Inng øst', 'Hal C', '']) expect(resolveHall(text, halls, rules)).toBeNull()
  })

  it('offers the one place a text names among other words, for every project', () => {
    expect(suggestHall('cafe hall D', halls, rules)).toEqual({ hall: 'D1', own: false })
    expect(suggestHall('cafe hall D', halls)).toEqual({ hall: 'D', own: false })
    expect(suggestHall('Sceneomr hall C', halls)?.hall).toBe('C')
    expect(suggestHall('Møterom hall E1', halls)?.hall).toBe('E')
    expect(suggestHall('Lager ved MEZ', halls)?.hall).toBe('MEZ')
  })

  it('offers nothing for a hall that is not in the ledger, a place the text is read as already, or a text without a hall where the bookings do not say', () => {
    for (const text of ['Inng øst', 'Gulvfolie', 'Hall F', 'Hall C', 'Hall B', 'en c-profil', '']) expect(suggestHall(text, halls, rules, ['C', 'D1'])).toBeNull()
    expect(suggestHall('Hall F', halls, rules, ['C'])).toBeNull()
  })

  it('offers a place the project has booked where the text names several, for that project alone', () => {
    expect(suggestHall('Hall C og D', halls, rules)).toBeNull()
    expect(suggestHall('Hall C og D', halls, rules, ['D1', 'C'])).toEqual({ hall: 'C', own: true })
    expect(suggestHall('Hall C og D', halls, rules, ['D1', 'E'])).toEqual({ hall: 'D1', own: true })
    // The shared place is booked where one of its halls is.
    expect(suggestHall('Hall E og B', halls, rules, ['B2'])).toEqual({ hall: 'B', own: true })
  })

  it('offers the hall of a project with one hall for a text that names none', () => {
    expect(suggestHall('Inng øst', halls, rules, ['C'])).toEqual({ hall: 'C', own: true })
  })

  it('gathers unmatched lines in one location and keeps their hours', () => {
    const line = (hall: string, assemblyHours: number) => ({ id: hall, hall, assemblyHours }) as DemandLine
    const located = locateDemand([line('Hall C', 1), line('cafe hall D', 2), line('Hall F', 4), line('', 8), line('Hall B', 16)], halls)
    expect(located.map((l) => l.hall)).toEqual(['C', UNRESOLVED_HALL, UNRESOLVED_HALL, UNRESOLVED_HALL, 'B'])
    expect(located.reduce((sum, l) => sum + l.assemblyHours, 0)).toBe(31)
  })

  it('lets the planner give a text a place, which places every line with that text', () => {
    const aliases = withAlias(withAlias(withAlias({}, ' Sceneomr hall C', 'C'), 'Hall C', UNRESOLVED_HALL), 'Bakrom', 'B')
    expect(placeOf('sceneomr hall c', halls, aliases)).toEqual({ hall: 'C', by: 'choice', chosen: true, own: false })
    expect(placeOf('Hall C', halls, aliases)).toEqual({ hall: UNRESOLVED_HALL, by: 'choice', chosen: true, own: false })
    expect(placeOf('Hall A', halls, aliases)).toEqual({ hall: 'A1', by: 'text', chosen: false, own: false })
    expect(placeOf('bakrom', halls, aliases).hall).toBe('B')
    const line = (id: string, hall: string) => ({ id, hall }) as DemandLine
    expect(locateDemand([line('a', 'sceneomr hall C'), line('b', 'Sceneomr hall C'), line('c', 'cafe hall D')], halls, aliases).map((l) => l.hall)).toEqual(['C', 'C', UNRESOLVED_HALL])
  })

  it('keeps a choice for one project apart from the choice for every project', () => {
    const aliases = withAlias(withAlias({}, 'Inng øst', 'E'), 'Inng øst', 'C', '26100')
    expect(placeOf('Inng øst', halls, aliases, '26100')).toEqual({ hall: 'C', by: 'own', chosen: true, own: true })
    expect(placeOf('Inng øst', halls, aliases, '26200')).toEqual({ hall: 'E', by: 'choice', chosen: true, own: false })
    expect(placeOf('Inng øst', halls, withAlias(aliases, 'Inng øst', undefined, '26100'), '26100').hall).toBe('E')
    const line = (projectNo: string) => ({ id: projectNo, hall: 'Inng øst', projectNo }) as DemandLine
    expect(locateDemand([line('26100'), line('26200')], halls, aliases).map((l) => l.hall)).toEqual(['C', 'E'])
  })

  it('lists the choices for texts apart from the rules for hall letters', () => {
    const aliases = withAlias(withAlias(withAlias(rules, 'Inng øst', 'E'), 'Inng øst', 'C', '26100'), 'cafe hall D', 'D1')
    expect(hallChoices(aliases, halls).map((c) => [c.text, c.projectNo, c.hall])).toEqual([['cafe hall d', undefined, 'D1'], ['inng øst', undefined, 'E'], ['inng øst', '26100', 'C']])
  })

  it('goes back to reading the text when the choice is removed or its hall is gone', () => {
    expect(withAlias({ 'hall c': 'E' }, 'Hall C', undefined)).toEqual({})
    expect(placeOf('Hall C', halls, { 'hall c': 'F' })).toEqual({ hall: 'C', by: 'text', chosen: false, own: false })
  })

  it('places planning rows the same way, and leaves rows for all halls alone', () => {
    const row = (hall?: string) => ({ id: 'r', hall }) as AllocationRow
    expect(locateRows([row('Hall D'), row('cafe hall D'), row('C'), row(undefined)], halls, rules).map((r) => r.hall)).toEqual(['D1', UNRESOLVED_HALL, 'C', undefined])
  })

  it('gives a shared place the days of its halls that the project has booked', () => {
    const booking = (hall: string, start: string, end: string) => ({ id: hall, hall, eventName: 'Hage', status: '', phases: { assembly: { start, end } } })
    const windows = buildWindows([booking('B1', '2026-04-01', '2026-04-02'), booking('B3', '2026-04-02', '2026-04-03'), booking('C', '2026-04-06', '2026-04-06')], () => 'hage')
    expect([...windowFor(windows, 'hage', 'B', 'Montering')!]).toEqual(['2026-04-01', '2026-04-02', '2026-04-03'])
    expect([...windowFor(windows, 'hage', 'B1', 'Montering')!]).toEqual(['2026-04-01', '2026-04-02'])
  })
})
