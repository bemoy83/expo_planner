import { describe, expect, it } from 'vitest'
import { locateDemand, locateRows, placeOf, resolveHall, UNRESOLVED_HALL } from './locations'
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

  it('gathers unmatched lines in one location and keeps their hours', () => {
    const line = (hall: string, assemblyHours: number) => ({ id: hall, hall, assemblyHours }) as DemandLine
    const located = locateDemand([line('Hall C', 1), line('cafe hall D', 2), line('Hall F', 4), line('', 8)], halls)
    expect(located.map((l) => l.hall)).toEqual(['C', UNRESOLVED_HALL, UNRESOLVED_HALL, UNRESOLVED_HALL])
    expect(located.reduce((sum, l) => sum + l.assemblyHours, 0)).toBe(15)
  })

  it('lets the planner place a line by hand, as long as that hall is in the ledger', () => {
    expect(placeOf({ hall: 'sceneomr hall C', location: 'C' }, halls)).toEqual({ hall: 'C', chosen: true })
    expect(placeOf({ hall: 'Hall C', location: 'd1' }, halls)).toEqual({ hall: 'D1', chosen: true })
    expect(placeOf({ hall: 'Hall C', location: UNRESOLVED_HALL }, halls)).toEqual({ hall: UNRESOLVED_HALL, chosen: true })
    expect(placeOf({ hall: 'Hall C', location: 'F' }, halls)).toEqual({ hall: 'C', chosen: false })
    expect(locateDemand([{ id: 'a', hall: 'cafe hall D', location: 'D1' } as DemandLine], halls)[0].hall).toBe('D1')
  })

  it('places planning rows the same way, and leaves rows for all halls alone', () => {
    const row = (hall?: string) => ({ id: 'r', hall }) as AllocationRow
    expect(locateRows([row('Hall D'), row('cafe hall D'), row('C'), row(undefined)], halls).map((r) => r.hall)).toEqual(['D1', UNRESOLVED_HALL, 'C', undefined])
  })
})
