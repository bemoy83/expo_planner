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
  if (sel.section !== 'alloc') return sel
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
