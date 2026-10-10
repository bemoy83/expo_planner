import { describe, expect, it } from 'vitest'
import { locateDemand, locateRows, placeOf, resolveHall, suggestHall, UNRESOLVED_HALL, withAlias } from './locations'
import type { AllocationRow, DemandLine } from './types'

const halls = ['A1', 'B1', 'B2', 'C', 'D1', 'E', 'MEZ']

describe('placing demand in the halls of the hall ledger', () => {
  it('matches a hall by name, with or without «Hall» in front, ignoring case', () => {
    expect(resolveHall('Hall C', halls)).toBe('C')
    expect(resolveHall(' hall c ', halls)).toBe('C')
    expect(resolveHall('mez', halls)).toBe('MEZ')
    expect(resolveHall('B2', halls)).toBe('B2')
  })

  it('takes a hall letter for a numbered hall only when there is one such hall', () => {
    expect(resolveHall('Hall D', halls)).toBe('D1')
    expect(resolveHall('Hall B', halls)).toBeNull()
  })

  it('leaves odd names, combinations and blanks unresolved', () => {
    for (const text of ['Hall F', 'Hall C og D', 'sceneomr hall C', 'Inng øst', 'Hal C', '']) expect(resolveHall(text, halls)).toBeNull()
  })

  it('lets the halls the project has booked say which hall a letter names', () => {
    expect(resolveHall('Hall B', halls, ['B2', 'C'])).toBe('B2')
    expect(resolveHall('Hall B', halls, ['B1', 'B2'])).toBeNull()
    expect(resolveHall('Hall B', halls, ['C'])).toBeNull()
    const booked = new Map([['26100', ['B2']], ['26200', ['B1']]])
    expect(placeOf('Hall B', halls, {}, '26100', booked)).toEqual({ hall: 'B2', chosen: false, own: false })
    expect(placeOf('Hall B', halls, {}, '26200', booked).hall).toBe('B1')
    expect(placeOf('Hall B', halls, {}, '26300', booked).hall).toBe(UNRESOLVED_HALL)
    const line = (projectNo: string) => ({ id: projectNo, hall: 'Hall B', projectNo }) as DemandLine
    expect(locateDemand([line('26100'), line('26200'), line('26300')], halls, {}, booked).map((l) => l.hall)).toEqual(['B2', 'B1', UNRESOLVED_HALL])
  })

  it('offers the one hall a text names among other words, for every project', () => {
    expect(suggestHall('cafe hall D', halls)).toEqual({ hall: 'D1', own: false })
    expect(suggestHall('Sceneomr hall C', halls)?.hall).toBe('C')
    expect(suggestHall('Møterom hall E1', halls)?.hall).toBe('E')
    expect(suggestHall('Lager ved MEZ', halls)?.hall).toBe('MEZ')
  })

  it('offers nothing for a hall that is not in the ledger, a hall the text is read as already, or a text without a hall where the bookings do not say', () => {
    for (const text of ['Inng øst', 'Gulvfolie', 'Hall F', 'Hall C', 'en c-profil', '']) expect(suggestHall(text, halls, ['C', 'D1'])).toBeNull()
    expect(suggestHall('Hall F', halls, ['C'])).toBeNull()
  })

  it('offers a hall the project has booked where the text names several, for that project alone', () => {
    expect(suggestHall('Hall C og D', halls)).toBeNull()
    expect(suggestHall('Hall C og D', halls, ['D1', 'C'])).toEqual({ hall: 'C', own: true })
    expect(suggestHall('Hall C og D', halls, ['D1', 'E'])).toEqual({ hall: 'D1', own: true })
    expect(suggestHall('Hall B', halls, ['B2', 'B1'])).toEqual({ hall: 'B1', own: true })
    expect(suggestHall('Hall B', halls, ['C'])).toBeNull()
  })

  it('offers the hall of a project with one hall for a text that names none', () => {
    expect(suggestHall('Inng øst', halls, ['C'])).toEqual({ hall: 'C', own: true })
  })

  it('keeps a choice for one project apart from the choice for every project', () => {
    const aliases = withAlias(withAlias({}, 'Inng øst', 'E'), 'Inng øst', 'C', '26100')
    expect(placeOf('Inng øst', halls, aliases, '26100')).toEqual({ hall: 'C', chosen: true, own: true })
    expect(placeOf('Inng øst', halls, aliases, '26200')).toEqual({ hall: 'E', chosen: true, own: false })
    expect(placeOf('Inng øst', halls, withAlias(aliases, 'Inng øst', undefined, '26100'), '26100').hall).toBe('E')
  })

  it('gathers unmatched lines in one location and keeps their hours', () => {
    const line = (hall: string, assemblyHours: number) => ({ id: hall, hall, assemblyHours }) as DemandLine
    const located = locateDemand([line('Hall C', 1), line('cafe hall D', 2), line('Hall F', 4), line('', 8)], halls)
    expect(located.map((l) => l.hall)).toEqual(['C', UNRESOLVED_HALL, UNRESOLVED_HALL, UNRESOLVED_HALL])
    expect(located.reduce((sum, l) => sum + l.assemblyHours, 0)).toBe(15)
  })

  it('lets the planner give a text a hall, which places every line with that text', () => {
    const aliases = withAlias(withAlias({}, ' Sceneomr hall C', 'C'), 'Hall C', UNRESOLVED_HALL)
    expect(placeOf('sceneomr hall c', halls, aliases)).toEqual({ hall: 'C', chosen: true, own: false })
    expect(placeOf('Hall C', halls, aliases)).toEqual({ hall: UNRESOLVED_HALL, chosen: true, own: false })
    expect(placeOf('Hall D', halls, aliases)).toEqual({ hall: 'D1', chosen: false, own: false })
    const line = (id: string, hall: string) => ({ id, hall }) as DemandLine
    expect(locateDemand([line('a', 'sceneomr hall C'), line('b', 'Sceneomr hall C'), line('c', 'cafe hall D')], halls, aliases).map((l) => l.hall)).toEqual(['C', 'C', UNRESOLVED_HALL])
  })

  it('goes back to reading the text when the choice is removed or its hall is gone', () => {
    expect(withAlias({ 'hall c': 'E' }, 'Hall C', undefined)).toEqual({})
    expect(placeOf('Hall C', halls, { 'hall c': 'F' })).toEqual({ hall: 'C', chosen: false, own: false })
  })

  it('places planning rows the same way, and leaves rows for all halls alone', () => {
    const row = (hall?: string) => ({ id: 'r', hall }) as AllocationRow
    expect(locateRows([row('Hall D'), row('cafe hall D'), row('C'), row(undefined)], halls).map((r) => r.hall)).toEqual(['D1', UNRESOLVED_HALL, 'C', undefined])
  })
})
