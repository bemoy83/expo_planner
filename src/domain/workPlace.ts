import type { ISODate } from './dates'
import { collectedIn } from './locations'
import { eventKey, numberKey, venueEvents } from './projects'
import { NO_PROJECT, PROJECT_PLACE, placeKey, type ProjectBalance } from './staffing'
import type { Assignment, Workspace } from './types'
import { hallNames } from './venue'
import { anchorDate, visibleVenue } from './venueImport'

/**
 * Where a block's work is: the place of the project it is for, as the Kalender's rows name it («B», not B1), for the
 * work plans. A block painted on a place's line has its place; the place of any other is worked out from the project
 * balance, as its project is: its hours go to the places of its project by what each lacks, and the hours of a block
 * without a project go first to the projects. Nothing of this is stored.
 */

/** A part of a block's hours: for a project, in a place, as a share of the block. `PROJECT_PLACE` is the project's halls that day. */
export interface WorkPlace {
  projectNo: string
  hall: string
  share: number
}

/** The shares given, scaled to one; nothing where they sum to none. */
const scaled = <T extends { share: number }>(parts: T[]): T[] => {
  const total = parts.reduce((sum, part) => sum + part.share, 0)
  return total > 0 ? parts.filter((part) => part.share > 0).map((part) => ({ ...part, share: part.share / total })) : []
}

/** The places of a project's part of a day: by what each was given of the project's hours for no place, else by their demand. */
const projectPlaces = (balance: ProjectBalance, a: Pick<Assignment, 'competence' | 'date'>, projectNo: string): WorkPlace[] => {
  const places = [...balance.of(a.competence, a.date, projectNo).places.values()]
  const byShare = scaled(places.map((place) => ({ projectNo, hall: place.hall, share: place.shared })))
  if (byShare.length) return byShare
  const byDemand = scaled(places.map((place) => ({ projectNo, hall: place.hall, share: place.demand })))
  return byDemand.length ? byDemand : [{ projectNo, hall: PROJECT_PLACE, share: 1 }]
}

/**
 * Where the hours of a block go. A block with a place is all there. A block for a project goes to the project's places
 * as the balance shares its hours for no place. A block for no project goes to the projects as the balance shares the
 * untagged hours, and on to their places; where none lacks the hours («Ikke fordelt»), it goes nowhere: an empty list.
 * The demand without a project number is a project of its own, `NO_PROJECT`.
 */
export const blockPlaces = (balance: ProjectBalance, a: Pick<Assignment, 'competence' | 'date' | 'projectNo' | 'hall'>): WorkPlace[] => {
  if (a.projectNo?.trim()) {
    if (a.hall?.trim()) return [{ projectNo: a.projectNo.trim(), hall: a.hall.trim(), share: 1 }]
    return projectPlaces(balance, a, a.projectNo.trim())
  }
  const projects = scaled([...balance.get(a.competence, a.date).projects.values()].map((p) => ({ projectNo: p.projectNo, share: p.shared })))
  return projects.flatMap((p) => projectPlaces(balance, a, p.projectNo).map((place) => ({ ...place, share: place.share * p.share })))
}

/**
 * The places a project has booked in Venyou on a day, any phase, as the rows name them: a hall that a place of the
 * planner collects is that place. What `PROJECT_PLACE` stands for on that day. Bookings left out of the Kalender are left out.
 */
export const bookedPlaces = (ws: Pick<Workspace, 'venue' | 'hiddenVenue' | 'projects' | 'hallRules'>, projectNo: string, date: ISODate): string[] => {
  if (projectNo === NO_PROJECT) return []
  const venue = visibleVenue(ws.venue, ws.hiddenVenue)
  const halls = hallNames(ws.venue)
  const key = numberKey(projectNo)
  const ofProject = new Set(venueEvents(venue, ws.projects).filter((event) => numberKey(event.projectNo) === key).map((event) => event.key))
  const found = new Map<string, string>()
  for (const booking of venue) {
    if (!ofProject.has(eventKey(booking.eventName, anchorDate(booking)))) continue
    if (!Object.values(booking.phases).some((span) => span && span.start <= date && date <= span.end)) continue
    const place = collectedIn(booking.hall, halls, ws.hallRules)
    found.set(placeKey(place), place)
  }
  return [...found.values()].sort((a, b) => a.localeCompare(b, 'nb', { numeric: true }))
}
