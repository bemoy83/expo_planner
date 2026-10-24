import type { ToolKind } from '../toolKeys'

export type Tool = ToolKind

/** A stroke over the folded days: from the cell it started in to the one the pointer is over. */
export interface Stroke {
  /** With «Velg», a drag from an empty day selects days and a drag from a block moves the day's blocks. With any tool, a drag from an end of a run stretches it. */
  mode: 'paint' | 'erase' | 'select' | 'move' | 'stretch'
  /** With `stretch`: the end of a run that is pulled, and the block it was taken hold of by. The stroke keeps to that person's line. */
  stretch?: { edge: 'start' | 'end'; blockId: string; /** The time of the day under the pointer the end is pulled to, at a stop; unset until the pointer moves. */ at?: number }
  /** Shift is held while a brush stroke is drawn or an end of a run pulled, or at a click: it goes no further than where the demand is met, see `cellsToDemand`. */
  toDemand?: boolean
  /** With `paint`: the time of the day under the pointer the brush is drawn to, at a stop; unset for a click, which fills the day. */
  at?: number
  row0: number
  col0: number
  row1: number
  col1: number
}

export const strokeRange = (stroke: Stroke) => ({
  rowFrom: Math.min(stroke.row0, stroke.row1),
  rowTo: Math.max(stroke.row0, stroke.row1),
  colFrom: Math.min(stroke.col0, stroke.col1),
  colTo: Math.max(stroke.col0, stroke.col1),
})

/** Days of the people's lines, as a block: from the cell a selection started in to the one it ended in. */
export type Rect = Pick<Stroke, 'row0' | 'col0' | 'row1' | 'col1'>
