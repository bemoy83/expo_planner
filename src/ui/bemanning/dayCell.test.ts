import { describe, expect, it } from 'vitest'
import { DEFAULT_WORKDAY, type Assignment, type Unavailability } from '../../domain/types'

// The cases are written for lunch from 11:00 to 11:30.
const wd = { ...DEFAULT_WORKDAY, breakStart: 660, breakEnd: 690 }
import { blockLabel, dayCell, runLabel, spanOf } from './dayCell'

const TUE = '2026-10-13'
const SAT = '2026-10-17'
const block = (id: string, competence: string, start: number, end: number, date = TUE): Assignment => ({ id, personId: 'p', date, competence, start, end, source: 'manual' })
const yes = () => true

describe('folded day cell', () => {
  it('shows one block over the whole normal day', () => {
    const cell = dayCell(TUE, [block('a', 'foga', 420, 900)], [], yes, wd)
    expect(cell.blocks).toMatchObject([{ left: 0, width: 100, hours: 7.5 }])
    expect(cell).toMatchObject({ offDay: false, away: false, overtime: 0, unresolved: 0 })
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

  it('hatches the part of the day a person is away, and says when', () => {
    const leaves: Unavailability = { id: 'u', personId: 'p', date: TUE, start: 720, end: 900 }
    const cell = dayCell(TUE, [block('a', 'banner', 420, 720)], [leaves], yes, wd)
    expect(cell.hatches).toEqual([{ left: 62.5, width: 37.5 }])
    expect(cell.note).toBe('Går 12:00')
    const late: Unavailability = { ...leaves, start: 420, end: 600 }
    expect(dayCell(TUE, [], [late], yes, wd).note).toBe('Kommer 10:00')
  })

  it('hatches a whole day away where nothing is planned, and leaves what is planned to be hatched itself', () => {
    const holiday: Unavailability = { id: 'u', personId: 'p', date: TUE }
    expect(dayCell(TUE, [], [holiday], () => false, wd).hatches).toEqual([{ left: 0, width: 100 }])
    expect(dayCell(TUE, [block('a', 'foga', 420, 660)], [holiday], () => false, wd).hatches).toEqual([{ left: 50, width: 50 }])
    expect(dayCell(TUE, [block('a', 'foga', 420, 900)], [holiday], () => false, wd).hatches).toEqual([])
  })

  it('names a run with the days it lasts where they fit (R24)', () => {
    expect(runLabel(5 * 105 - 10, 'Vegger', 'VEG', 'full', 5)).toBe('Vegger · 5 d')
    expect(runLabel(2 * 40 - 10, 'Vegger', 'VEG', 'full', 2)).toBe('Vegger')
    expect(runLabel(2 * 40 - 10, 'Teppefliser', 'TEP', 'full', 2)).toBe('TEP · 2 d')
    expect(runLabel(5 * 105 - 10, 'Vegger', 'VEG', 'short', 5)).toBe('VEG · 5 d')
  })

  it('hatches only the stretch of a block the person is away for', () => {
    const morning: Unavailability = { id: 'u', personId: 'p', date: TUE, start: 420, end: 720 }
    const cell = dayCell(TUE, [block('a', 'foga', 420, 900)], [morning], yes, wd)
    expect(cell.blocks[0]).toMatchObject({ unresolved: false, away: [{ left: 0, width: 62.5 }], hours: 3, times: '12:00–15:00' })
    expect(cell).toMatchObject({ hatches: [], unresolved: 0, note: 'Kommer 12:00' })
  })

  it('marks a whole day away, and the blocks that are unresolved by it', () => {
    const away: Unavailability = { id: 'u', personId: 'p', date: TUE }
    const cell = dayCell(TUE, [block('a', 'foga', 420, 900)], [away], () => false, wd)
    expect(cell).toMatchObject({ away: true, unresolved: 1, overtime: 0 })
    expect(cell.blocks[0]).toMatchObject({ unresolved: true })
  })

  it('stops counting a block as unresolved once others cover the day', () => {
    const away: Unavailability = { id: 'u', personId: 'p', date: TUE }
    const cell = dayCell(TUE, [block('a', 'foga', 420, 900)], [away], () => false, wd, () => false)
    expect(cell.unresolved).toBe(0)
    expect(cell.blocks[0]).toMatchObject({ unresolved: true, replaced: true })
  })

  it('places the blocks of a Saturday as those of a working day, all of it overtime', () => {
    const cell = dayCell(SAT, [block('a', 'foga', 480, 720, SAT)], [], yes, wd)
    expect(cell).toMatchObject({ offDay: true, overtime: 3.5 })
    expect(cell.blocks).toMatchObject([{ left: 12.5, width: 50 }])
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

describe('a stretch of time as a share', () => {
  const day = { start: 420, end: 900 }

  it('lies where its time is in the whole', () => {
    expect(spanOf({ start: 420, end: 660 }, day)).toEqual({ left: 0, width: 50 })
    expect(spanOf({ start: 780, end: 900 }, day)).toEqual({ left: 75, width: 25 })
  })

  it('is cut to the whole it is a share of', () => {
    expect(spanOf({ start: 360, end: 540 }, day)).toEqual({ left: 0, width: 25 })
    expect(spanOf({ start: 780, end: 1020 }, day)).toEqual({ left: 75, width: 25 })
  })
})
