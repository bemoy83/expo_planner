import { addDays, daysBetween, weekdayIndex, type ISODate } from '../../domain/dates'
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

const contains = (span: DaySpan, date: ISODate) => date >= span.start && date <= span.end
const daysFrom = (start: ISODate): DaySpan => ({ start, end: addDays(start, BEMANNING_DAYS - 1) })

interface Entering {
  /** The period of the Kalender. */
  period: DaySpan
  /** The days of the project chosen in the filter, from its first phase to its last. */
  project?: DaySpan
  /** The days last seen in Bemanning. */
  stored?: DaySpan | null
  /** The day in focus, when it is among the days seen in the plan. */
  focus?: ISODate
  /** The day at the left edge of the plan. */
  leftEdge: ISODate
}

/**
 * The days Bemanning opens on (R18, R29): the chosen project's, else those last seen there, else ten days
 * from the left edge of the plan. A day in focus that is in view stays in view: a span without it is
 * passed over, and with none left the ten days start on the Monday of its week.
 */
export const enterSpan = ({ period, project, stored, focus, leftEdge }: Entering): DaySpan => {
  const inPeriod = (span: DaySpan | null | undefined) => (span && span.start <= span.end && span.start >= period.start && span.start <= period.end ? span : undefined)
  const spans = [inPeriod(project), inPeriod(stored)].filter((span) => span !== undefined)
  const picked = focus ? (spans.find((span) => contains(span, focus)) ?? daysFrom(addDays(focus, -weekdayIndex(focus)))) : (spans[0] ?? daysFrom(leftEdge))
  const start = picked.start < period.start ? period.start : picked.start
  return { start, end: picked.end > period.end ? period.end : picked.end < start ? start : picked.end }
}

export const spanDays = (span: DaySpan): number => daysBetween(span.start, span.end) + 1

interface Leaving {
  /** The middle of what is seen in Bemanning, as a position among the days: 3,5 is the middle of the fourth day. */
  middle: number
  /** The column of the day in focus. */
  focusCol?: number
  /** How many days of the plan fit in the grid. */
  shown: number
}

/**
 * Where the plan's left edge goes when Bemanning is left, as a position among the days: the same day in
 * the middle, unless that leaves the day in focus out of view, which is then put in the middle (R29).
 */
export const leaveLeft = ({ middle, focusCol, shown }: Leaving): number => {
  const left = middle - shown / 2
  const centre = focusCol !== undefined && (focusCol < left || focusCol + 1 > left + shown) ? focusCol + 0.5 : middle
  return Math.max(0, centre - shown / 2)
}

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
