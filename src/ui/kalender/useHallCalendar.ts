import { useMemo } from 'react'
import { addDays, daysBetween, type ISODate } from '../../domain/dates'
import { eventKey, venueEvents } from '../../domain/projects'
import type { VenueBooking, Workspace } from '../../domain/types'
import { buildHallCalendar, hallNames, hallProjects, hallRuns, hallSegments, projectsOfHalls } from '../../domain/venue'
import { anchorDate, visibleVenue } from '../../domain/venueImport'
import type { HallLabelRun } from './GridRows'
import { projectKey } from './rows'
import { projectList } from './useProjectHover'

/**
 * What the Kalender draws of the hall bookings: the halls shown, each hall's bookings as bars with the
 * events' names over them, and the project behind each booking. `origin` is the first day of the period;
 * `splitShared` shows both events on a day a hall is shared, which wide columns have room for.
 */
export function useHallCalendar(ws: Pick<Workspace, 'venue' | 'hiddenVenue' | 'eventLinks' | 'projects'>, origin: ISODate, splitShared: boolean, allHalls: boolean) {
  const { venue, hiddenVenue, eventLinks, projects } = ws
  const shownVenue = useMemo(() => visibleVenue(venue, hiddenVenue), [venue, hiddenVenue])
  const hallCalendar = useMemo(() => buildHallCalendar(shownVenue), [shownVenue])
  // Projects are the events in the Venyou calendar that have at least one hall booking shown.
  const events = useMemo(() => venueEvents(shownVenue, eventLinks, projects), [shownVenue, eventLinks, projects])
  /** The project a hall booking belongs to. */
  const projectOf = useMemo(() => {
    const projectOfEvent = new Map(events.map((event) => [event.key, projectKey({ projectNo: event.projectNo, projectName: event.name })]))
    return (booking: VenueBooking) => projectOfEvent.get(eventKey(booking.eventName, anchorDate(booking))) ?? null
  }, [events])
  // The project behind each bar and name of the hall calendar, so that pointing at a project can light them.
  const hallProject = useMemo(() => hallProjects(shownVenue, projectOf), [shownVenue, projectOf])
  const hallProjectLists = useMemo(() => new Map([...projectsOfHalls(shownVenue, projectOf)].map(([hall, list]) => [hall, projectList(list)])), [shownVenue, projectOf])
  // Each event's name sits on the first day of the arrangement itself in the hall and scrolls with it.
  const hallLabels = useMemo(() => {
    const labels = new Map<string, HallLabelRun[]>()
    for (const [hall, days] of hallCalendar) {
      const all = hallRuns(days)
      // A name may run on past its own days, but not into the next event in the hall.
      const runs = all.map((run, i) => ({
        eventName: run.eventName,
        col: daysBetween(origin, run.anchor),
        span: daysBetween(run.anchor, run.end) + 1,
        room: all[i + 1] ? daysBetween(run.anchor, all[i + 1].start) : Infinity,
        project: hallProject(hall, run.eventName, run.anchor),
      }))
      labels.set(hall, runs)
    }
    return labels
  }, [hallCalendar, origin, hallProject])
  const hallBars = useMemo(
    () => new Map([...hallCalendar].map(([hall, days]) => [hall, hallSegments(days, origin, splitShared).map((bar) => ({ ...bar, project: hallProject(hall, bar.eventName, addDays(origin, Math.floor(bar.col))) }))])),
    [hallCalendar, origin, splitShared, hallProject],
  )
  const allHallNames = useMemo(() => hallNames(venue), [venue])
  const halls = useMemo(() => {
    if (allHalls) return allHallNames
    // Exhibition halls: most of their bookings have build-up or tear-down periods.
    return allHallNames.filter((hall) => {
      const bookings = shownVenue.filter((b) => b.hall === hall)
      if (!bookings.length) return false
      return bookings.filter((b) => b.phases.assembly || b.phases.dismantle).length / bookings.length >= 0.5
    })
  }, [allHallNames, shownVenue, allHalls])
  return { shownVenue, events, projectOf, hallProjectLists, hallLabels, hallBars, halls, hallCount: allHallNames.length }
}
