import { daysBetween, type ISODate } from '../../domain/dates'
import type { VenuePhase } from '../../domain/types'

/** A project as Bemanning lists it: its days as columns of the period, from its first phase to its last. */
export interface ProjectSpan {
  key: string
  name: string
  halls: string[]
  start: number
  end: number
  /** What the list is sorted by: the first day of the event itself, or of the first phase when there is none. */
  eventStart: number
}

/** A listed project stays listed until it is this many days out of view, so one at the edge does not flicker (R37). */
export const LEAVE_AFTER_DAYS = 2

const meets = (project: ProjectSpan, from: number, to: number) => project.start <= to && project.end >= from

/**
 * R37: the projects in view. A project comes in when one of its days is among the visible columns
 * `from`–`to`, and one that is listed already stays until it is two days past them.
 */
export const projectsInView = (projects: ProjectSpan[], from: number, to: number, listed: ReadonlySet<string>): ProjectSpan[] =>
  projects
    .filter((project) => meets(project, from, to) || (listed.has(project.key) && meets(project, from - LEAVE_AFTER_DAYS, to + LEAVE_AFTER_DAYS)))
    .sort((a, b) => a.eventStart - b.eventStart || a.start - b.start || a.name.localeCompare(b.name, 'nb'))

/**
 * R37: how many lines the list needs so its height never changes while scrolling: the most projects any
 * stretch of `visible` days can list, the days a project lingers counted in.
 */
export const projectSlots = (projects: ProjectSpan[], visible: number, days: number): number => {
  let most = 0
  for (let from = -LEAVE_AFTER_DAYS; from < days; from++) {
    const to = from + visible - 1 + 2 * LEAVE_AFTER_DAYS
    let count = 0
    for (const project of projects) if (meets(project, from, to)) count += 1
    if (count > most) most = count
  }
  return most
}

export interface PhaseBar {
  phase: VenuePhase
  col: number
  span: number
}

/** A project's phases as bars: each stretch of days in the same phase, see `projectPhases`. */
export const phaseBars = (days: Map<ISODate, VenuePhase>, origin: ISODate): PhaseBar[] => {
  const bars: PhaseBar[] = []
  for (const [date, phase] of [...days].sort((a, b) => a[0].localeCompare(b[0]))) {
    const col = daysBetween(origin, date)
    const last = bars[bars.length - 1]
    if (last && last.phase === phase && last.col + last.span === col) last.span += 1
    else bars.push({ phase, col, span: 1 })
  }
  return bars
}
