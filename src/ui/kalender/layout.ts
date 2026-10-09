import { parseDecimal } from '../../domain/numbers'

/** The height of a line of the grid, as in the design mockup. */
export const ROW_H = 28
/** A project's line, the top level of the hierarchy, stands a little taller than the lines under it. */
export const TOP_ROW_H = 34
/** The lines of the hall calendar are lower: there are many halls, and they hold no numbers. */
export const HALL_ROW_H = 22
/** The Avvik line as a heat map: room for a tile with air around it. */
export const HEAT_ROW_H = 30
export const LEFT_W = 460
export const OVERSCAN_COLS = 6
export const OVERSCAN_ROWS = 8

/**
 * A length of `days` day columns and `px` pixels more, for a style. A day is as wide as the grid's
 * `--col-w` says, so a zoom changes that one variable and no line is drawn again for it. What a line
 * writes in a day, which depends on the room, is still worked out from the width the lines are drawn at.
 */
export const daysWide = (days: number, px = 0): string => `calc(var(--col-w) * ${days}${px ? ` ${px < 0 ? '-' : '+'} ${Math.abs(px)}px` : ''})`

export const ZOOM_WIDTHS = { compact: 26, normal: 36, wide: 52 } as const
export type Zoom = keyof typeof ZOOM_WIDTHS

/**
 * How to show a span of days in a grid `room` pixels wide: the column width to use, never wider than
 * the one in use, and the column at the left edge. The span is centred when it fits, with a day of air
 * before it otherwise.
 */
export const fitSpan = (firstCol: number, days: number, room: number, zoom: Zoom): { zoom: Zoom; leftCol: number } => {
  const order: Zoom[] = ['wide', 'normal', 'compact']
  const fitting = order.slice(order.indexOf(zoom)).find((z) => (days + 2) * ZOOM_WIDTHS[z] <= room)
  const picked = fitting ?? 'compact'
  const shown = room / ZOOM_WIDTHS[picked]
  return { zoom: picked, leftCol: Math.max(0, fitting ? firstCol - (shown - days) / 2 : firstCol - 1) }
}

/** Parses what a planner types into a cell: «1,5», «1.5», «» (clear). */
export const parseCellInput = parseDecimal
