import { weekdayIndex, type ISODate } from '../../domain/dates'
import { parseDecimal } from '../../domain/numbers'
import type { DayWeek } from './gridTypes'

/** The height of a line of the grid, as in the design mockup. */
export const ROW_H = 28
/** A project's line, the top level of the hierarchy, stands a little taller than the lines under it. */
export const TOP_ROW_H = 34
/** The lines of the hall calendar are lower: there are many halls, and they hold no numbers. */
export const HALL_ROW_H = 22
/** A hall's line in the compact hall calendar: a thin bar per phase, without the names. */
export const HALL_COMPACT_H = 12
/** The Avvik line as a heat map: room for a tile with air around it. */
export const HEAT_ROW_H = 30
export const LEFT_W = 460
/** The days drawn out of sight to each side: as many as the widest of the plan's columns need to cover this far, never fewer than two. */
const OVERSCAN_PX = 312
const OVERSCAN_MAX_COLS = 6
/**
 * How many days are drawn out of sight to each side at a column width. Bemanning's days are up to three
 * times as wide as the plan's, and as many of them would be more cells out of sight than in it.
 */
export const overscanCols = (colW: number): number => Math.min(OVERSCAN_MAX_COLS, Math.max(2, Math.ceil(OVERSCAN_PX / colW)))
export const OVERSCAN_ROWS = 8

/** The period's days in weeks, Monday to Sunday, the first and last cut at the period's ends. */
export const periodWeeks = (dates: ISODate[]): DayWeek[] => {
  const weeks: DayWeek[] = []
  dates.forEach((date, col) => {
    if (col === 0 || weekdayIndex(date) === 0) weeks.push({ from: col, dates: [] })
    weeks[weeks.length - 1].dates.push(date)
  })
  return weeks
}

/** The week a column is in: the last that starts at or before it. */
export const weekAt = (weeks: DayWeek[], col: number): number => {
  let lo = 0
  let hi = weeks.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (weeks[mid].from <= col) lo = mid
    else hi = mid - 1
  }
  return lo
}

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
