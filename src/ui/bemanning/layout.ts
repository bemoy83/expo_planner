import type { WorkdaySettings } from '../../domain/types'
import type { Span } from './dayCell'
import type { EndShape } from './runs'

/** The heights of Bemanning's lines in the Kalender's grid. */
export const PERSON_H = 40
/** A lane of a shift line in Innleid with more than one, a block's height and the air under it. */
const LANE_H = 16
/**
 * A supplier's shift line in Innleid, as high as a person's (the v9 design, 2026-10-26). A run alone on its days fills
 * the line as a person's block does; runs of `bands` lanes that share days divide it (`band` of `orderRuns`), two the
 * line of a person, and from three the line grows by a lane's height for each the most crowded days have (`depth`), as
 * narrower lanes lose their text (2026-10-28).
 */
export const shiftLine = (depth: number): { height: number; lane: (band: number, bands: number) => { top: number; height: number } } => {
  const height = Math.max(PERSON_H, 8 + LANE_H * depth)
  return {
    height,
    lane: (band, bands) => {
      if (bands <= 1) return { top: 7, height: height - 14 }
      const each = (height - 8) / bands
      return { top: 5 + band * each, height: each - 2 }
    },
  }
}
/** The line between the people who have the competence in focus and those who do not. */
export const DIVIDER_H = 24
/** The air beside a folded day's blocks, see `.bm-timeline` (`--day-inset`). A block that goes on into the next day reaches over it, and over the rule between the days. */
export const DAY_INSET = 5
/** Where a block of a folded day, or time a stroke would put there, lies in the day's timeline: one that goes on into the day beside it reaches over the air there, and over the rule after the day. */
export const joinedPlace = (span: Span, shape: EndShape | undefined): { left: string; width: string } => {
  const before = shape?.prev ? DAY_INSET : 0
  const after = shape?.next ? DAY_INSET + 1 : 0
  return { left: `calc(${span.left}% - ${before}px)`, width: `calc(${span.width}% + ${before + after}px)` }
}
/** The classes of its ends, which are square where it is joined to the day beside it or meets what lies beside it in its own day, see `.join-prev`. */
export const joinedClass = (shape: EndShape | undefined): string => `${shape?.prev ? 'join-prev' : ''} ${shape?.next ? 'join-next' : ''} ${shape?.meetsBefore ? 'meet-prev' : ''} ${shape?.meetsAfter ? 'meet-next' : ''}`
/** The width of the part at an end of a run that the end is pulled by, see `.bm-edge`. */
export const EDGE_W = 10
export const DEMAND_H = 32
export const DEMAND_COMPACT_H = 14
export const PROJECT_H = 22
export const PROJECT_COMPACT_H = 12
/** The most projects the list shows at once; the rest are counted beside the heading. */
export const PROJECT_MAX_LINES = 6
/** A phase's bar has room for the phase's name from this width; narrower, it shows the letter. */
export const PHASE_NAME_MIN_W = 84
/** How long a project that leaves the list of project lines takes to fade out, see `.bm-project-line`. */
export const LEAVE_MS = 260
/** The pixels per hour of a day's track in a person's open hours, and the air above and below the track. */
export const HOUR_PX = 20
const TRACK_MARGIN = 12
/** The height of a person's open hours: an hour of the day for every hour overtime can be drawn in. */
export const unfoldedHeight = (wd: WorkdaySettings): number => ((wd.overtimeLatest - wd.overtimeEarliest) / 60) * HOUR_PX + 2 * TRACK_MARGIN
