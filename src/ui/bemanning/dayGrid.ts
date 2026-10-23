import type { ISODate } from '../../domain/dates'
import type { Clipboard, DayCell as Day } from '../../domain/staffing/edit'
import type { Assignment } from '../../domain/types'
import { DIVIDER_H, PERSON_H } from './layout'
import { strokeRange, type Stroke } from './tools'
import type { PersonLine } from './usePeopleLines'

/**
 * The line under a point `top` pixels down the people: the lines of those who have the competence in focus come first, then a
 * divider of `gap` pixels, then the rest. A point on the divider is the last line above it; one past the end is the last line.
 */
export const personRowAt = (top: number, able: number, count: number, gap: number): number => {
  const row = top < able * PERSON_H ? Math.floor(top / PERSON_H) : top < able * PERSON_H + gap ? able - 1 : able + Math.floor((top - able * PERSON_H - gap) / PERSON_H)
  return Math.min(count - 1, Math.max(0, row))
}

/** The divider between those who have the competence in focus and the rest, where both are listed. */
export const dividerHeight = (able: number, count: number, divided: boolean): number => (divided && able < count ? DIVIDER_H : 0)

/**
 * The days of the people as the grid has them: lines (`row`) of the people listed and columns (`col`) of the period, and the person and
 * day of each. What a stroke, the selection, a move or a paste works on is read from here.
 */
export const dayGrid = (listed: PersonLine[], dates: ISODate[], lineOf: Map<string, PersonLine>) => {
  const dayAt = (row: number, col: number): Day => ({ personId: listed[row].person.id, date: dates[col] })
  /** The days of the lines and columns a stroke covers. */
  const strokeCells = (s: Stroke): Day[] => {
    const { rowFrom, rowTo, colFrom, colTo } = strokeRange(s)
    const cells: Day[] = []
    for (let row = rowFrom; row <= rowTo && row < listed.length; row++) for (let col = colFrom; col <= colTo; col++) cells.push(dayAt(row, col))
    return cells
  }
  const blocksOn = (cell: Day): Assignment[] => lineOf.get(cell.personId)?.assignments?.get(cell.date) ?? []
  /** The first and the last of the columns the days are in. */
  const colsOf = (days: ISODate[]) => {
    const at = days.map((date) => dates.indexOf(date))
    return { colFrom: Math.min(...at), colTo: Math.max(...at) }
  }
  /** The people a paste lands on: the line under the pointer for the first person copied, and the lines under it for the next. */
  const pasteOnto = (copied: Clipboard, row: number) => copied.people.map((_, i) => listed[row + i]?.person.id)
  return { dayAt, strokeCells, blocksOn, colsOf, pasteOnto }
}

export type DayGrid = ReturnType<typeof dayGrid>
