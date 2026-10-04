export const ROW_H = 22
export const HEADER_ROW_H = 18
export const LEFT_W = 520
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
