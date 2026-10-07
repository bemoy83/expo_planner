import { describe, expect, it } from 'vitest'
import { DEFAULT_WORKDAY as wd, type Assignment, type Unavailability } from '../../domain/types'
import { dayCell } from './dayCell'

const TUE = '2026-10-13'
const SAT = '2026-10-17'
const block = (id: string, competence: string, start: number, end: number, date = TUE): Assignment => ({ id, personId: 'p', date, competence, start, end, source: 'manual' })
const yes = () => true

describe('folded day cell', () => {
  it('shows one block over the whole normal day as a full day', () => {
    const cell = dayCell(TUE, [block('a', 'foga', 420, 900)], [], yes, wd)
    expect(cell.blocks).toMatchObject([{ label: 'full', left: 0, width: 100, hours: 7.5 }])
    expect(cell).toMatchObject({ offDay: false, away: null, overtime: 0, unresolved: 0 })
  })

  it('places several blocks by their time, and names them as far as they are wide', () => {
    const cell = dayCell(TUE, [block('b', 'foga', 690, 900), block('a', 'teppefliser', 420, 660), block('c', 'banner', 660, 690)], [], yes, wd)
    expect(cell.blocks.map((b) => [b.id, b.left, b.width, b.label])).toEqual([
      ['a', 0, 50, 'name'],
      ['c', 50, 6.25, 'none'],
      ['b', 56.25, 43.75, 'short'],
    ])
  })

  it('cuts a block to the normal day and counts the rest as overtime', () => {
    const cell = dayCell(TUE, [block('a', 'foga', 420, 1020)], [], yes, wd)
    expect(cell.blocks[0]).toMatchObject({ left: 0, width: 100, label: 'full', hours: 9.5 })
    expect(cell.overtime).toBe(2)
  })

  it('hatches the part of the day a person is away, with a note', () => {
    const leaves: Unavailability = { id: 'u', personId: 'p', date: TUE, kind: 'annet', start: 720, end: 900 }
    const cell = dayCell(TUE, [block('a', 'banner', 420, 720)], [leaves], yes, wd)
    expect(cell.hatches).toEqual([{ left: 62.5, width: 37.5 }])
    expect(cell.note).toBe('Går 12:00')
    expect(cell.blocks[0].label).toBe('full')
    const late: Unavailability = { ...leaves, start: 420, end: 600, note: 'Tannlege' }
    expect(dayCell(TUE, [], [{ ...late, note: undefined }], yes, wd).note).toBe('Fra 10:00')
    expect(dayCell(TUE, [], [late], yes, wd).note).toBe('Tannlege')
  })

  it('marks a whole day away, and the blocks that are unresolved by it', () => {
    const sick: Unavailability = { id: 'u', personId: 'p', date: TUE, kind: 'syk' }
    const cell = dayCell(TUE, [block('a', 'foga', 420, 900)], [sick], () => false, wd)
    expect(cell).toMatchObject({ away: 'syk', unresolved: 1, overtime: 0 })
    expect(cell.blocks[0]).toMatchObject({ unresolved: true, label: 'name' })
  })

  it('keeps the blocks of a Saturday whole, all of it overtime', () => {
    const cell = dayCell(SAT, [block('a', 'foga', 480, 720, SAT)], [], yes, wd)
    expect(cell).toMatchObject({ offDay: true, overtime: 3.5 })
    expect(cell.blocks).toHaveLength(1)
  })
})
