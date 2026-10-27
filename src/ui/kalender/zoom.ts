import { addDays, daysBetween, type ISODate } from '../../domain/dates'
import { ZOOM_WIDTHS, type Zoom } from './layout'

/** The two things the rows of the Kalender can be: the demand plan, or the people who do the work. */
export type PlanMode = 'plan' | 'bemanning'

export const cleanPlanMode = (stored: unknown): PlanMode => (stored === 'bemanning' ? 'bemanning' : 'plan')

/** The two parts of Bemanning: the permanent staff, and the people hired for what they leave. */
export type CrewPart = 'faste' | 'innleid'

export const cleanCrewPart = (stored: unknown): CrewPart => (stored === 'innleid' ? 'innleid' : 'faste')

/** A day in Bemanning is never narrower or wider than this. */
const BEMANNING_MIN_W = 80
const BEMANNING_MAX_W = 160
/** The days Bemanning opens on when nothing says which. */
export const BEMANNING_DAYS = 10
/** How long the switch between the modes zooms. */
export const ZOOM_MS = 460

export interface DaySpan {
  start: ISODate
  end: ISODate
}

/**
 * Innleid draws a day this much wider than Faste, for the marks and the names on a supplier's day, so the switch
 * between the parts zooms (2026-10-27). The width kept is Faste's; Innleid's follows from it.
 */
const HIRE_SCALE = 1.5

/** The width of a day in a part of Bemanning, from Faste's. */
export const partWidth = (width: number, part: CrewPart): number => (part === 'innleid' ? Math.round(width * HIRE_SCALE) : width)

/**
 * Faste's column width at which `days` fill a grid `room` pixels wide in `part` (R18): in Innleid the days
 * are fitted at its own width, and Faste's is what that is drawn from.
 */
export const fitWidth = (days: number, room: number, part: CrewPart = 'faste'): number => {
  const scale = part === 'innleid' ? HIRE_SCALE : 1
  const fitted = Math.min(BEMANNING_MAX_W * scale, Math.max(BEMANNING_MIN_W * scale, Math.floor(room / Math.max(1, days))))
  return Math.round(fitted / scale)
}

/**
 * Where the left edge goes, among the days, when the width of a day changes from `from` to `colW` and the
 * day `anchor` (a position among the days) keeps its place on screen: the day in focus, or the middle of the
 * view. Never before the first day, nor so far that the last leaves the right edge.
 */
export const anchoredLeft = (from: ZoomPoint & { room: number }, colW: number, anchor: number, days: number): number => {
  const left = anchor - ((anchor - from.left) * from.colW) / colW
  return Math.max(0, Math.min(left, days - from.room / colW))
}

/** The day that keeps its place when the width changes: the day in focus where it is in view, else the middle of the view. */
export const zoomAnchor = (from: ZoomPoint & { room: number }, focus: number): number => {
  const shown = from.room / from.colW
  return focus >= 0 && focus >= from.left - 0.5 && focus + 1 <= from.left + shown + 0.5 ? focus + 0.5 : from.left + shown / 2
}

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
 * share the timeline, so Bemanning opens on the days around the plan's day in focus (`zoomAnchor`).
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

/** The days that are drawn while a zoom is on its way: from the first to the last it passes, and the day the left edge ends on. */
export interface HeldColumns {
  from: number
  to: number
  left: number
}

/** A zoom draws at most this many times the days of its wider end. */
const HELD_VIEWS = 3

/**
 * The days a zoom between two points passes, in a grid with `room` pixels for the days: they are drawn
 * once, before it starts, so that no frame of it draws a line again. Nothing when the way is too long
 * for that, as from one end of the year to the other; the grid then goes there in one step.
 */
export const heldColumns = (from: ZoomPoint, to: ZoomPoint, room: number): HeldColumns | null => {
  const first = Math.floor(Math.min(from.left, to.left) + 0.01)
  const last = Math.ceil(Math.max(from.left + room / from.colW, to.left + room / to.colW))
  const widest = Math.ceil(room / Math.min(from.colW, to.colW))
  return last - first > HELD_VIEWS * widest ? null : { from: first, to: last, left: Math.floor(to.left + 0.01) }
}
