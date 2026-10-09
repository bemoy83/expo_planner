import { describe, expect, it } from 'vitest'
import { nextSort, sortRows } from './columnSort'

describe('column sorting', () => {
  it('goes from ascending to descending and back to the table\'s own order', () => {
    const asc = nextSort(null, 'name')
    expect(asc).toEqual({ key: 'name', direction: 'asc' })
    const desc = nextSort(asc, 'name')
    expect(desc).toEqual({ key: 'name', direction: 'desc' })
    expect(nextSort(desc, 'name')).toBeNull()
    // Another column starts over.
    expect(nextSort(desc, 'unit')).toEqual({ key: 'unit', direction: 'asc' })
  })

  it('sorts text as Norwegian, with the numbers in it as numbers', () => {
    const text = (row: string) => row
    expect(sortRows(['Østfold', 'hall 10', 'Hall 2', 'Åse', 'Arne'], text, 'asc')).toEqual(['Arne', 'Hall 2', 'hall 10', 'Østfold', 'Åse'])
    expect(sortRows(['Arne', 'Åse', 'Hall 2'], text, 'desc')).toEqual(['Åse', 'Hall 2', 'Arne'])
  })

  it('sorts numbers by size', () => {
    const n = (row: number) => row
    expect(sortRows([10, 9, 100, 0.5], n, 'asc')).toEqual([0.5, 9, 10, 100])
    expect(sortRows([10, 9, 100, 0.5], n, 'desc')).toEqual([100, 10, 9, 0.5])
  })

  it('keeps empty cells last in both directions, and equal rows in the order they had', () => {
    const rows = [
      { id: 1, unit: 'stk' },
      { id: 2, unit: '' },
      { id: 3, unit: 'lm' },
      { id: 4, unit: 'stk' },
    ]
    const unit = (row: (typeof rows)[number]) => row.unit
    expect(sortRows(rows, unit, 'asc').map((row) => row.id)).toEqual([3, 1, 4, 2])
    expect(sortRows(rows, unit, 'desc').map((row) => row.id)).toEqual([1, 4, 3, 2])
    expect(rows.map((row) => row.id)).toEqual([1, 2, 3, 4])
  })
})
