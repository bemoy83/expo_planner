import { addDays, daysBetween, type ISODate } from '../../domain/dates'
import { ZOOM_WIDTHS, type Zoom } from './layout'

/** The two things the rows of the Kalender can be: the demand plan, or the people who do the work. */
export type PlanMode = 'plan' | 'bemanning'

export const cleanPlanMode = (stored: unknown): PlanMode => (stored === 'bemanning' ? 'bemanning' : 'plan')

/** A day in Bemanning is never narrower or wider than this. */
export const BEMANNING_MIN_W = 80
export const BEMANNING_MAX_W = 160
/** The days Bemanning opens on when nothing says which. */
export const BEMANNING_DAYS = 10
/** How long the switch between the modes zooms. */
export const ZOOM_MS = 460

export interface DaySpan {
  start: ISODate
  end: ISODate
}

/** The column width at which `days` fill a grid `room` pixels wide (R18). */
export const fitWidth = (days: number, room: number): number => Math.min(BEMANNING_MAX_W, Math.max(BEMANNING_MIN_W, Math.floor(room / Math.max(1, days))))

/** What the date header writes at a column width: letters for the weekdays in narrow columns, the hall calendar's split days in wide ones. */
export const zoomOf = (colW: number): Zoom => (colW < (ZOOM_WIDTHS.compact + ZOOM_WIDTHS.normal) / 2 ? 'compact' : colW < (ZOOM_WIDTHS.normal + ZOOM_WIDTHS.wide) / 2 ? 'normal' : 'wide')

const daysFrom = (start: ISODate): DaySpan => ({ start, end: addDays(start, BEMANNING_DAYS - 1) })

interface Opening {
  /** The period of the Kalender. */
  period: DaySpan
  /** The days last seen in Bemanning. */
  stored?: DaySpan | null
  /** The day to start on when no days are remembered. */
  leftEdge: ISODate
}

/**
 * The days a page that opens in Bemanning opens on: those last seen there, else ten days from `leftEdge`.
 * Days remembered for another period are forgotten. A switch from the plan does not ask: the two modes
 * share the timeline, so Bemanning starts on the day at the plan's left edge.
 */
export const enterSpan = ({ period, stored, leftEdge }: Opening): DaySpan => {
  const picked = stored && stored.start <= stored.end && stored.start >= period.start && stored.start <= period.end ? stored : daysFrom(leftEdge)
  const start = picked.start < period.start ? period.start : picked.start
  return { start, end: picked.end > period.end ? period.end : picked.end < start ? start : picked.end }
}

export const spanDays = (span: DaySpan): number => daysBetween(span.start, span.end) + 1

/** A column width, and the position among the days of the grid's left edge. */
export interface ZoomPoint {
  colW: number
  left: number
}

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

/**
 * One frame of the zoom between two column widths (R28), `progress` running from 0 to 1. The width moves
 * on a log scale, so the zoom looks even, and the day at the left edge moves steadily to where it ends.
 */
export const zoomFrame = (from: ZoomPoint, to: ZoomPoint, progress: number): ZoomPoint => {
  const e = easeInOutCubic(Math.min(1, Math.max(0, progress)))
  return { colW: Math.exp(Math.log(from.colW) + (Math.log(to.colW) - Math.log(from.colW)) * e), left: from.left + (to.left - from.left) * e }
}
