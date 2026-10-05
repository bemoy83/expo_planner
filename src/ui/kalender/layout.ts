/** The height of a line of the grid, as in the design mockup. */
export const ROW_H = 28
/** A project's line, the top level of the hierarchy, stands a little taller than the lines under it. */
export const TOP_ROW_H = 34
/** The lines of the hall calendar are lower: there are many halls, and they hold no numbers. */
export const HALL_ROW_H = 22
export const LEFT_W = 580
export const OVERSCAN_COLS = 6
export const OVERSCAN_ROWS = 8

export const ZOOM_WIDTHS = { compact: 26, normal: 36, wide: 52 } as const
export type Zoom = keyof typeof ZOOM_WIDTHS

/** Parses what a planner types into a cell: «1,5», «1.5», «» (clear). */
export const parseCellInput = (input: string): number | null | undefined => {
  const trimmed = input.trim().replace(',', '.')
  if (trimmed === '') return null
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : undefined
}
