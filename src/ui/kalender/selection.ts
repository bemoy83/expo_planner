import type { ISODate } from '../../domain/dates'

export interface Cell {
  lane: number
  col: number
}
export interface Selection {
  anchor: Cell
  focus: Cell
}
/** A cell as a stroke or a pull would leave it. */
export interface DrawnCell {
  lane: number
  date: ISODate
  /** `null` clears the cell. */
  value: number | null
}
/** A pull of one end of a span, the days in a row a planning row has FTE: the span as it was, and how far its end has been pulled. */
export interface Pull {
  lane: number
  /** The first and the last day of the span. */
  from: number
  to: number
  /** The end that was gripped. A span of one day has both in its one cell, and the way it is pulled says which. */
  end: 'start' | 'end'
  toCol: number
  /** Shift stops the end where the demand is met; Alt keeps the sum of the span. */
  mode: 'carry' | 'demand' | 'sum'
}
/**
 * A press on a cell that selects nothing yet. Let go, it is a click on the cell; dragged on to another cell it is a range or a stroke
 * from it. On an end of a span it is also the grip of that end: dragged sideways it becomes a pull, and only up or down a drag as from any cell.
 */
export interface Press extends Cell {
  x: number
  y: number
  /** The tool of the stroke the press starts, where it is on an end of a span and turns out to be no pull. */
  stroke: Exclude<Tool, 'select'> | null
  /** The span the cell is an end of. */
  span?: Pick<Pull, 'from' | 'to' | 'end'>
}
export const rangeOf = (sel: Selection) => ({
  lane0: Math.min(sel.anchor.lane, sel.focus.lane),
  lane1: Math.max(sel.anchor.lane, sel.focus.lane),
  col0: Math.min(sel.anchor.col, sel.focus.col),
  col1: Math.max(sel.anchor.col, sel.focus.col),
})

/** What a line of the planning grid is, apart from where it stands: a row's id, and the line of work it plans. */
export interface LaneKey {
  id: string
  /** Set on rows: a suggested row gets a new id when FTE is first typed into it, but stays the same line of work. */
  scope?: string
}

/**
 * Lanes are positions in the list, and the list changes under a selection: a project moves when it gets
 * its first planned day, and a filter takes rows away. The selection follows the lines it stood on to
 * where they are now. It is let go of when the line in focus is gone, and gathered on that line when
 * the line it started on is gone.
 */
export const followLanes = (sel: Selection, before: LaneKey[], after: LaneKey[]): Selection | null => {
  const laneNow = (lane: number): number | undefined => {
    const key = before[lane]
    if (!key) return undefined
    if (after[lane]?.id === key.id) return lane
    const byId = after.findIndex((k) => k.id === key.id)
    if (byId >= 0) return byId
    const byScope = key.scope === undefined ? -1 : after.findIndex((k) => k.scope === key.scope)
    return byScope >= 0 ? byScope : undefined
  }
  const focus = laneNow(sel.focus.lane)
  if (focus === undefined) return null
  const anchor = laneNow(sel.anchor.lane) ?? focus
  return focus === sel.focus.lane && anchor === sel.anchor.lane ? sel : { ...sel, anchor: { ...sel.anchor, lane: anchor }, focus: { ...sel.focus, lane: focus } }
}

export type Tool = 'select' | 'pencil' | 'eraser'
/** The keys that pick a tool, anywhere on the page. */
export const TOOL_KEYS: Record<string, Tool> = { v: 'select', f: 'pencil', t: 'eraser' }
