import { describe, expect, it } from 'vitest'
import { DEFAULT_WORKDAY as wd, type Assignment, type Unavailability } from '../../domain/types'
import { blockLabel, dayCell } from './dayCell'

const TUE = '2026-10-13'
const SAT = '2026-10-17'
const block = (id: string, competence: string, start: number, end: number, date = TUE): Assignment => ({ id, personId: 'p', date, competence, start, end, source: 'manual' })
const yes = () => true

describe('folded day cell', () => {
  it('shows one block over the whole normal day', () => {
    const cell = dayCell(TUE, [block('a', 'foga', 420, 900)], [], yes, wd)
    expect(cell.blocks).toMatchObject([{ left: 0, width: 100, hours: 7.5 }])
    expect(cell).toMatchObject({ offDay: false, away: null, overtime: 0, unresolved: 0 })
  })

  it('places several blocks by their time', () => {
    const cell = dayCell(TUE, [block('b', 'foga', 690, 900), block('a', 'teppefliser', 420, 660), block('c', 'banner', 660, 690)], [], yes, wd)
    expect(cell.blocks.map((b) => [b.id, b.left, b.width])).toEqual([
      ['a', 0, 50],
      ['c', 50, 6.25],
      ['b', 56.25, 43.75],
    ])
  })

  it('cuts a block to the normal day and counts the rest as overtime', () => {
    const cell = dayCell(TUE, [block('a', 'foga', 420, 1020)], [], yes, wd)
    expect(cell.blocks[0]).toMatchObject({ left: 0, width: 100, hours: 9.5 })
    expect(cell.overtime).toBe(2)
  })

  it('hatches the part of the day a person is away, with a note', () => {
    const leaves: Unavailability = { id: 'u', personId: 'p', date: TUE, kind: 'annet', start: 720, end: 900 }
    const cell = dayCell(TUE, [block('a', 'banner', 420, 720)], [leaves], yes, wd)
    expect(cell.hatches).toEqual([{ left: 62.5, width: 37.5 }])
    expect(cell.note).toBe('Går 12:00')
    const late: Unavailability = { ...leaves, start: 420, end: 600, note: 'Tannlege' }
    expect(dayCell(TUE, [], [{ ...late, note: undefined }], yes, wd).note).toBe('Fra 10:00')
    expect(dayCell(TUE, [], [late], yes, wd).note).toBe('Tannlege')
  })

  it('marks a whole day away, and the blocks that are unresolved by it', () => {
    const sick: Unavailability = { id: 'u', personId: 'p', date: TUE, kind: 'syk' }
    const cell = dayCell(TUE, [block('a', 'foga', 420, 900)], [sick], () => false, wd)
    expect(cell).toMatchObject({ away: 'syk', unresolved: 1, overtime: 0 })
    expect(cell.blocks[0]).toMatchObject({ unresolved: true })
  })

  it('stops counting a block as unresolved once others cover the day', () => {
    const sick: Unavailability = { id: 'u', personId: 'p', date: TUE, kind: 'syk' }
    const cell = dayCell(TUE, [block('a', 'foga', 420, 900)], [sick], () => false, wd, () => false)
    expect(cell.unresolved).toBe(0)
    expect(cell.blocks[0]).toMatchObject({ unresolved: true, replaced: true })
  })

  it('keeps the blocks of a Saturday whole, all of it overtime', () => {
    const cell = dayCell(SAT, [block('a', 'foga', 480, 720, SAT)], [], yes, wd)
    expect(cell).toMatchObject({ offDay: true, overtime: 3.5 })
    expect(cell.blocks).toHaveLength(1)
  })

  it('B16 names a block in full where it fits, else with the short name, and never with its hours (R24)', () => {
    expect(blockLabel(105 - 10, 'Vegger', 'VEG')).toBe('name')
    expect(blockLabel(50, 'Vegger', 'VEG')).toBe('short')
    expect(blockLabel(95, 'Teppefliser', 'TEP')).toBe('name')
    expect(blockLabel(80, 'Teppefliser', 'TEP')).toBe('short')
    expect(blockLabel(30, 'Vegger', 'VEG')).toBe('none')
  })

  it('adds the hours only when asked to and they fit, and keeps to the short name when asked to (R24)', () => {
    expect(blockLabel(95, 'Vegger', 'VEG', 'auto', '7,5')).toBe('hours')
    expect(blockLabel(70, 'Vegger', 'VEG', 'auto', '7,5')).toBe('name')
    expect(blockLabel(95, 'Vegger', 'VEG', 'full', '7,5')).toBe('name')
    expect(blockLabel(95, 'Vegger', 'VEG', 'short', '7,5')).toBe('short')
  })
})
