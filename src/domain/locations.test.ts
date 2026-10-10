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

  it('offers the one hall a text names among other words', () => {
    expect(suggestHall('cafe hall D', halls)).toBe('D1')
    expect(suggestHall('Sceneomr hall C', halls)).toBe('C')
    expect(suggestHall('Pergola hall C', halls)).toBe('C')
    expect(suggestHall('Møterom hall E1', halls)).toBe('E')
    expect(suggestHall('Lager ved MEZ', halls)).toBe('MEZ')
  })

  it('offers nothing for a text that names no hall, one that is not in the ledger, or a hall it is read as already', () => {
    for (const text of ['Inng øst', 'Gulvfolie', 'Hall F', 'Hall C', 'en c-profil', '']) expect(suggestHall(text, halls)).toBeNull()
  })

  it('picks among several halls only the one the project has booked', () => {
    expect(suggestHall('Hall C og D', halls)).toBeNull()
    expect(suggestHall('Hall C og D', halls, ['C', 'D1'])).toBeNull()
    expect(suggestHall('Hall C og D', halls, ['D1', 'E'])).toBe('D1')
  })

  it('gathers unmatched lines in one location and keeps their hours', () => {
    const line = (hall: string, assemblyHours: number) => ({ id: hall, hall, assemblyHours }) as DemandLine
    const located = locateDemand([line('Hall C', 1), line('cafe hall D', 2), line('Hall F', 4), line('', 8)], halls)
    expect(located.map((l) => l.hall)).toEqual(['C', UNRESOLVED_HALL, UNRESOLVED_HALL, UNRESOLVED_HALL])
    expect(located.reduce((sum, l) => sum + l.assemblyHours, 0)).toBe(15)
  })

  it('lets the planner give a text a hall, which places every line with that text', () => {
    const aliases = withAlias(withAlias({}, ' Sceneomr hall C', 'C'), 'Hall C', UNRESOLVED_HALL)
    expect(placeOf('sceneomr hall c', halls, aliases)).toEqual({ hall: 'C', chosen: true })
    expect(placeOf('Hall C', halls, aliases)).toEqual({ hall: UNRESOLVED_HALL, chosen: true })
    expect(placeOf('Hall D', halls, aliases)).toEqual({ hall: 'D1', chosen: false })
    const line = (id: string, hall: string) => ({ id, hall }) as DemandLine
    expect(locateDemand([line('a', 'sceneomr hall C'), line('b', 'Sceneomr hall C'), line('c', 'cafe hall D')], halls, aliases).map((l) => l.hall)).toEqual(['C', 'C', UNRESOLVED_HALL])
  })

  it('goes back to reading the text when the choice is removed or its hall is gone', () => {
    expect(withAlias({ 'hall c': 'E' }, 'Hall C', undefined)).toEqual({})
    expect(placeOf('Hall C', halls, { 'hall c': 'F' })).toEqual({ hall: 'C', chosen: false })
  })

  it('places planning rows the same way, and leaves rows for all halls alone', () => {
    const row = (hall?: string) => ({ id: 'r', hall }) as AllocationRow
    expect(locateRows([row('Hall D'), row('cafe hall D'), row('C'), row(undefined)], halls).map((r) => r.hall)).toEqual(['D1', UNRESOLVED_HALL, 'C', undefined])
  })
})
