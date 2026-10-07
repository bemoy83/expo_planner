export type Tool = 'select' | 'paint' | 'erase'
/** The keys that pick a tool, anywhere on the page. */
export const TOOL_KEYS: Record<string, Tool> = { v: 'select', b: 'paint', t: 'erase' }

/** A stroke over the folded days: from the cell it started in to the one the pointer is over. */
export interface Stroke {
  mode: 'paint' | 'erase'
  /** Shift was held when a paint stroke started: half days. */
  half: boolean
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
