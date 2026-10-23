import { describe, expect, it } from 'vitest'
import type { PersonWeek } from '../../domain/staffing/time'
import { dayGrid, dividerHeight, personRowAt } from './dayGrid'
import { DIVIDER_H, PERSON_H } from './layout'
import type { PersonLine } from './usePeopleLines'

const line = (id: string, dates: string[] = []): PersonLine => ({
  person: { id, name: id, order: 0, competences: [] },
  assignments: new Map(dates.map((date) => [date, [{ id: `${id}-${date}`, personId: id, date, competence: 'foga', start: 420, end: 900, source: 'manual' }]])),
  absence: undefined,
  week: {} as PersonWeek,
  dim: false,
})

describe('personRowAt', () => {
  it('finds the line under a point, with a divider after those who have the competence', () => {
    expect(personRowAt(0, 2, 4, DIVIDER_H)).toBe(0)
    expect(personRowAt(PERSON_H + 1, 2, 4, DIVIDER_H)).toBe(1)
    // On the divider: the last line above it.
    expect(personRowAt(2 * PERSON_H + 1, 2, 4, DIVIDER_H)).toBe(1)
    expect(personRowAt(2 * PERSON_H + DIVIDER_H + 1, 2, 4, DIVIDER_H)).toBe(2)
    expect(personRowAt(3 * PERSON_H + DIVIDER_H + 1, 2, 4, DIVIDER_H)).toBe(3)
  })

  it('keeps to the lines there are', () => {
    expect(personRowAt(-10, 2, 4, 0)).toBe(0)
    expect(personRowAt(100 * PERSON_H, 2, 4, 0)).toBe(3)
  })

  it('has a divider only where some lack the competence', () => {
    expect(dividerHeight(2, 4, true)).toBe(DIVIDER_H)
    expect(dividerHeight(4, 4, false)).toBe(0)
  })
})

describe('dayGrid', () => {
  const dates = ['2026-10-05', '2026-10-06', '2026-10-07']
  const listed = [line('kari', ['2026-10-06']), line('ola')]
  const grid = dayGrid(listed, dates, new Map(listed.map((l) => [l.person.id, l])))

  it('gives the person and day of a line and a column', () => {
    expect(grid.dayAt(1, 2)).toEqual({ personId: 'ola', date: '2026-10-07' })
  })

  it('gives the days a stroke covers, either way it is drawn, and only on lines that are there', () => {
    const cells = grid.strokeCells({ mode: 'select', half: false, row0: 1, col0: 1, row1: 0, col1: 0 })
    expect(cells).toEqual([
      { personId: 'kari', date: '2026-10-05' },
      { personId: 'kari', date: '2026-10-06' },
      { personId: 'ola', date: '2026-10-05' },
      { personId: 'ola', date: '2026-10-06' },
    ])
    expect(grid.strokeCells({ mode: 'select', half: false, row0: 1, col0: 0, row1: 5, col1: 0 })).toHaveLength(1)
  })

  it('gives the blocks of a day, the columns of days, and the people a paste lands on', () => {
    expect(grid.blocksOn({ personId: 'kari', date: '2026-10-06' }).map((a) => a.id)).toEqual(['kari-2026-10-06'])
    expect(grid.blocksOn({ personId: 'ola', date: '2026-10-06' })).toEqual([])
    expect(grid.colsOf(['2026-10-07', '2026-10-05'])).toEqual({ colFrom: 0, colTo: 2 })
    expect(grid.pasteOnto({ from: '2026-10-05', people: ['a', 'b', 'c'], items: [] }, 1)).toEqual(['ola', undefined, undefined])
  })
})
