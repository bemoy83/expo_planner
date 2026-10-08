import type { WorkdaySettings } from '../../domain/types'

/** The heights of Bemanning's lines in the Kalender's grid. */
export const PERSON_H = 40
/** The line between the people who have the competence in focus and those who do not. */
export const DIVIDER_H = 24
export const DEMAND_H = 32
export const DEMAND_COMPACT_H = 14
export const PROJECT_H = 22
export const PROJECT_COMPACT_H = 12
/** A phase's bar has room for the phase's name from this width; narrower, it shows the letter. */
export const PHASE_NAME_MIN_W = 84
/** The width of the panel that slides in over the grid, see `.inspector`. */
export const PANEL_W = 340
/** The pixels per hour of a day's track in a person's open hours, and the air above and below the track. */
export const HOUR_PX = 20
export const TRACK_MARGIN = 12
/** The height of a person's open hours: an hour of the day for every hour overtime can be drawn in. */
export const unfoldedHeight = (wd: WorkdaySettings): number => ((wd.overtimeLatest - wd.overtimeEarliest) / 60) * HOUR_PX + 2 * TRACK_MARGIN
