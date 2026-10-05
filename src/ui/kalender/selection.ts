import type { ISODate } from '../../domain/dates'

/** The grid has two blocks of cells that take numbers: the planning rows and the staffing lines. */
export type Section = 'alloc' | 'cap'
export interface Cell {
  lane: number
  col: number
}
export interface Selection {
  section: Section
  anchor: Cell
  focus: Cell
}
/** A drag of the fill handle: the block that was selected, how far it has been dragged, and whether it stretches. */
export interface Fill {
  section: Section
  lane0: number
  lane1: number
  col0: number
  col1: number
  toCol: number
  stretch: boolean
}
export interface FillCell {
  section: Section
  lane: number
  date: ISODate
  /** `null` clears the cell. */
  value: number | null
}
export const rangeOf = (sel: Selection) => ({
  lane0: Math.min(sel.anchor.lane, sel.focus.lane),
  lane1: Math.max(sel.anchor.lane, sel.focus.lane),
  col0: Math.min(sel.anchor.col, sel.focus.col),
  col1: Math.max(sel.anchor.col, sel.focus.col),
})
