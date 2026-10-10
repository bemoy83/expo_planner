import { useMemo } from 'react'
import { areaTree, ofShownStatus, shownHalls, venueStatuses, type HallFilter } from '../../domain/areas'
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
 * `splitShared` shows both events on a day a hall is shared, which wide columns have room for. The halls shown are
 * those the planner has ticked under «Steder» (`hallFilter`), by area, and the bookings those of the statuses ticked there.
 */
export function useHallCalendar(ws: Pick<Workspace, 'venue' | 'hiddenVenue' | 'projects' | 'hallRules'>, origin: ISODate, splitShared: boolean, hallFilter: HallFilter) {
  const { venue, hiddenVenue, projects, hallRules } = ws
  const visible = useMemo(() => visibleVenue(venue, hiddenVenue), [venue, hiddenVenue])
  const statuses = useMemo(() => venueStatuses(visible), [visible])
  const shownVenue = useMemo(() => ofShownStatus(visible, hallFilter), [visible, hallFilter])
  // Every project with a booking, whatever its status: one whose bookings are all left out is left out with them.
  const bookedProjects = useMemo(() => (shownVenue === visible ? null : venueEvents(visible, projects).map((event) => projectKey({ projectNo: event.projectNo, projectName: event.name }))), [shownVenue, visible, projects])
  const hallCalendar = useMemo(() => buildHallCalendar(shownVenue), [shownVenue])
  // Projects are the events in the Venyou calendar that have at least one hall booking shown.
  const events = useMemo(() => venueEvents(shownVenue, projects), [shownVenue, projects])
  /** The project a hall booking belongs to. */
  const projectOf = useMemo(() => {
    const projectOfEvent = new Map(events.map((event) => [event.key, projectKey({ projectNo: event.projectNo, projectName: event.name })]))
    return (booking: VenueBooking) => projectOfEvent.get(eventKey(booking.eventName, anchorDate(booking))) ?? null
  }, [events])
  // The project behind each bar and name of the hall calendar, so that pointing at a project can light them.
  const hallProject = useMemo(() => hallProjects(shownVenue, projectOf), [shownVenue, projectOf])
  const hallProjectLists = useMemo(() => new Map([...projectsOfHalls(shownVenue, projectOf)].map(([hall, list]) => [hall, projectList(list)])), [shownVenue, projectOf])
  // Each event's name starts on the first day of its stretch in the hall, build-up included, and stays in view for as long as the stretch does, see `HallRow`.
  const hallLabels = useMemo(() => {
    const labels = new Map<string, HallLabelRun[]>()
    for (const [hall, days] of hallCalendar) {
      const all = hallRuns(days)
      // A name may run on past its own days, but not into the next event in the hall.
      const runs = all.map((run, i) => ({
        eventName: run.eventName,
        col: daysBetween(origin, run.start),
        span: daysBetween(run.start, run.end) + 1,
        room: all[i + 1] ? daysBetween(run.start, all[i + 1].start) : Infinity,
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
  const hallTree = useMemo(() => areaTree(allHallNames, hallRules), [allHallNames, hallRules])
  const halls = useMemo(() => shownHalls(hallTree, hallFilter), [hallTree, hallFilter])
  return { shownVenue, events, projectOf, hallProjectLists, hallLabels, hallBars, halls, hallTree, hallCount: allHallNames.length, statuses, bookedProjects }
}
