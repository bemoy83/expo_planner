import { describe, expect, it } from 'vitest'
import { columnValues, filterRows, toggleValue, withValues, type ColumnValues } from './columnFilter'

interface Line {
  competence: string
  hall: string
}
const rows: Line[] = [
  { competence: 'FOGA', hall: 'C' },
  { competence: 'FOGA', hall: 'D' },
  { competence: 'Print', hall: 'C' },
  { competence: 'Print', hall: '' },
]
const columns: ColumnValues<Line> = { competence: (row) => row.competence, hall: (row) => row.hall }

describe('column filters', () => {
  it('keeps the rows every filtered column lets through', () => {
    expect(filterRows(rows, columns, {})).toBe(rows)
    expect(filterRows(rows, columns, { competence: ['FOGA'] })).toEqual([rows[0], rows[1]])
    expect(filterRows(rows, columns, { competence: ['FOGA', 'Print'], hall: ['C'] })).toEqual([rows[0], rows[2]])
    expect(filterRows(rows, columns, { hall: [] })).toEqual([])
    expect(filterRows(rows, columns, { gone: ['x'] })).toBe(rows)
  })

  it('offers a column the values the other filters leave, with their counts, an empty value among them', () => {
    expect(columnValues(rows, columns, {}, 'hall')).toEqual([{ value: '', count: 1 }, { value: 'C', count: 2 }, { value: 'D', count: 1 }])
    // The column's own filter does not narrow what it offers; the other column's does.
    expect(columnValues(rows, columns, { hall: ['D'], competence: ['Print'] }, 'hall')).toEqual([{ value: '', count: 1 }, { value: 'C', count: 1 }])
  })

  it('ticks and unticks a value, and lets go of the filter when everything is ticked again', () => {
    const offered = ['', 'C', 'D']
    const withoutC = toggleValue({}, 'hall', 'C', offered)
    expect(withoutC).toEqual({ hall: ['', 'D'] })
    expect(toggleValue(withoutC, 'hall', 'C', offered)).toEqual({})
    expect(withValues({ competence: ['FOGA'] }, 'hall', [], offered)).toEqual({ competence: ['FOGA'], hall: [] })
    expect(withValues({ hall: ['C'] }, 'hall', offered, offered)).toEqual({})
  })
})
