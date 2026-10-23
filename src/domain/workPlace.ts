import type { ISODate } from './dates'
import { PROJECT_HALLS, collectedIn } from './locations'
import { eventKey, numberKey, venueEvents } from './projects'
import { paidHours } from './staffing/intervals'
import { NO_PROJECT, PROJECT_PLACE, buildProjectBalance, placeKey, type ProjectBalance } from './staffing/projectBalance'
import { okAssignments } from './staffing/time'
import { competenceKey, sameProject, VENUE_PHASES, workTag, type Assignment, type VenueBooking, type VenuePhase, type Workspace } from './types'
import { hallNames } from './venue'
import { anchorDate, visibleVenue } from './venueImport'
import { pushTo } from './collections'

/**
 * Where a block's work is: the place of the project it is for, as the Kalender's rows name it («B», not B1), for the
 * work plans. A block painted on a place's line has its place; the place of any other is worked out from the project
 * balance, as its project is: its hours go to the places of its project by what each lacks, and the hours of a block
 * without a project go first to the projects. Nothing of this is stored.
 */

/** A part of a block's hours: for a project, in a place, as a share of the block. `PROJECT_PLACE` is the project's halls that day. */
interface WorkPlace {
  projectNo: string
  hall: string
  share: number
}

/** A place as the balance and the work plans hold it: `PROJECT_PLACE` for a row of all the project's halls or «Ufordelt», else its name. */
export const placeOf = (hall: string): string => (placeKey(hall) === PROJECT_PLACE ? PROJECT_PLACE : hall.trim())

/** A place as it is stored on a block: the project's halls as «Ufordelt», which stands for them. */
export const placeTag = (hall: string): string => (placeKey(hall) === PROJECT_PLACE ? PROJECT_HALLS : hall.trim())

/** The name a place is shown with: the project's halls, on a row of all of them or «Ufordelt», as such. */
export const placeName = (hall: string): string => (placeKey(hall) === PROJECT_PLACE ? 'Prosjektets haller' : hall.trim())

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
    if (a.hall?.trim()) return [{ projectNo: a.projectNo.trim(), hall: placeOf(a.hall), share: 1 }]
    return projectPlaces(balance, a, a.projectNo.trim())
  }
  const projects = scaled([...balance.get(a.competence, a.date).projects.values()].map((p) => ({ projectNo: p.projectNo, share: p.shared })))
  return projects.flatMap((p) => projectPlaces(balance, a, p.projectNo).map((place) => ({ ...place, share: place.share * p.share })))
}

/** The bookings of a project in Venyou that the Kalender shows: its events by its number, in every hall. */
const projectBookings = (ws: Pick<Workspace, 'venue' | 'hiddenVenue' | 'projects'>, projectNo: string): VenueBooking[] => {
  if (projectNo === NO_PROJECT) return []
  const venue = visibleVenue(ws.venue, ws.hiddenVenue)
  const key = numberKey(projectNo)
  const ofProject = new Set(venueEvents(venue, ws.projects).filter((event) => numberKey(event.projectNo) === key).map((event) => event.key))
  return venue.filter((booking) => ofProject.has(eventKey(booking.eventName, anchorDate(booking))))
}

/**
 * The places a project has booked in Venyou on a day, any phase, as the rows name them: a hall that a place of the
 * planner collects is that place. What `PROJECT_PLACE` stands for on that day. Bookings left out of the Kalender are left out.
 */
export const bookedPlaces = (ws: Pick<Workspace, 'venue' | 'hiddenVenue' | 'projects' | 'hallRules'>, projectNo: string, date: ISODate): string[] => {
  const halls = hallNames(ws.venue)
  const found = new Map<string, string>()
  for (const booking of projectBookings(ws, projectNo)) {
    if (!Object.values(booking.phases).some((span) => span && span.start <= date && date <= span.end)) continue
    const place = collectedIn(booking.hall, halls, ws.hallRules)
    found.set(placeKey(place), place)
  }
  return [...found.values()].sort((a, b) => a.localeCompare(b, 'nb', { numeric: true }))
}

/** The days each phase takes over the halls of a project's events, as the hall calendar does. */
export const projectPhaseSpans = (ws: Pick<Workspace, 'venue' | 'hiddenVenue' | 'projects'>, projectNo: string): Map<VenuePhase, { start: ISODate; end: ISODate }> => {
  const spans = new Map<VenuePhase, { start: ISODate; end: ISODate }>()
  for (const booking of projectBookings(ws, projectNo)) {
    for (const phase of VENUE_PHASES) {
      const span = booking.phases[phase]
      if (!span) continue
      const held = spans.get(phase)
      spans.set(phase, held ? { start: span.start < held.start ? span.start : held.start, end: span.end > held.end ? span.end : held.end } : { ...span })
    }
  }
  return spans
}

/** The central phase wins where phases overlap, as in the hall calendar. */
const PHASE_RANK: Record<VenuePhase, number> = { event: 5, movingIn: 4, movingOut: 4, assembly: 3, dismantle: 3 }

/** The phase a project is in on a day. */
export const phaseAt = (spans: Map<VenuePhase, { start: ISODate; end: ISODate }>, date: ISODate): VenuePhase | undefined =>
  [...spans].filter(([, span]) => span.start <= date && date <= span.end).sort((a, b) => PHASE_RANK[b[0]] - PHASE_RANK[a[0]])[0]?.[0]

/** Where a whole block is, for the work plans: one place, and whether it was set or worked out, and whether it could have been another. */
interface DealtPlace {
  projectNo: string
  hall: string
  /** The block was painted on the place's line: nothing was worked out. */
  set: boolean
  /** Worked out, and more than one place or project lacked the hours of the block that day: it could have been another (≈ on the sheets). */
  uncertain: boolean
}

interface Recipient {
  projectNo: string
  hall: string
  /** What the place still lacks. */
  place: number
  /** What it lacked before any block was dealt. */
  start: number
}

/**
 * Deals the blocks of the dates out whole on the places, as the work plans print them. `blockPlaces` gives every block
 * without a place the same shares, which would send all of them to one place on a sheet that must say one. Here the
 * blocks of a competence and day go one by one, in the order of the people (then by id): first those of a project,
 * then those of none, each to the place of its project, or of any project, that lacks most, the largest first and in a
 * fixed order among equals. A block bigger than what any place lacks is not cut: it stands where it has its largest
 * share, which is that one. The hours that no place lacks («Ikke fordelt») go nowhere (`null`), except a block of a
 * project, which stands in the project's halls. Blocks with nothing that counts are left out. Nothing of this is stored.
 */
export const dealPlaces = (ws: Workspace, dates?: ISODate[]): Map<string, DealtPlace | null> => {
  const blocks = ws.assignments ?? []
  const days = dates ?? [...new Set(blocks.map((a) => a.date))]
  const balance = buildProjectBalance(ws, days)
  const wd = ws.settings.workday
  const hours = new Map<string, number>()
  for (const a of okAssignments(ws)) hours.set(a.id, (hours.get(a.id) ?? 0) + paidHours(a, wd))
  const order = new Map((ws.persons ?? []).map((person, i) => [person.id, i]))
  const rank = (personId: string) => order.get(personId) ?? order.size
  const dealt = new Map<string, DealtPlace | null>()
  const groups = new Map<string, typeof blocks>()
  for (const a of blocks) {
    if (!(hours.get(a.id)! > 0) || !days.includes(a.date)) continue
    const competence = competenceKey(a.competence)
    if (!competence) continue
    const key = `${competence}|${a.date}`
    pushTo(groups, key, a)
  }
  for (const [key, list] of groups) {
    const [competence, date] = [key.slice(0, key.lastIndexOf('|')), key.slice(key.lastIndexOf('|') + 1)]
    const day = balance.get(competence, date)
    const projectLeft = new Map<string, number>()
    const projectStart = new Map<string, number>()
    const recipients: Recipient[] = []
    for (const p of day.projects.values()) {
      projectLeft.set(p.projectNo, Math.max(0, p.demand - p.tagged))
      projectStart.set(p.projectNo, Math.max(0, p.demand - p.tagged))
      for (const at of p.places.values()) recipients.push({ projectNo: p.projectNo, hall: at.hall, place: Math.max(0, at.demand - at.tagged), start: Math.max(0, at.demand - at.tagged) })
    }
    // Among equals a project goes before the demand that has no number.
    recipients.sort((a, b) => Number(a.projectNo === NO_PROJECT) - Number(b.projectNo === NO_PROJECT) || a.projectNo.localeCompare(b.projectNo, 'nb', { numeric: true }) || a.hall.localeCompare(b.hall, 'nb', { numeric: true }))
    const tagged = (a: Assignment) => !!a.projectNo?.trim()
    const sorted = [...list].sort((a, b) => Number(tagged(b)) - Number(tagged(a)) || rank(a.personId) - rank(b.personId) || a.id.localeCompare(b.id))
    for (const a of sorted) {
      const h = hours.get(a.id)!
      if (tagged(a) && a.hall?.trim()) {
        const projectNo = a.projectNo!.trim()
        dealt.set(a.id, { projectNo, hall: placeOf(a.hall!), set: true, uncertain: false })
        continue
      }
      const ofProject = tagged(a) ? a.projectNo : undefined
      const candidates = recipients.filter((r) => ofProject === undefined || sameProject(r, { projectNo: ofProject }))
      const room = (r: Recipient) => (ofProject === undefined ? Math.min(r.place, projectLeft.get(r.projectNo) ?? 0) : r.place)
      const open = candidates.filter((r) => room(r) > 0)
      const best = open.reduce<Recipient | undefined>((top, r) => (!top || room(r) > room(top) ? r : top), undefined)
      if (best) {
        best.place = Math.max(0, best.place - h)
        if (ofProject === undefined) projectLeft.set(best.projectNo, Math.max(0, (projectLeft.get(best.projectNo) ?? 0) - h))
        const couldBe = candidates.filter((r) => (ofProject === undefined ? Math.min(r.start, projectStart.get(r.projectNo) ?? 0) : r.start) > 0).length
        dealt.set(a.id, { projectNo: best.projectNo, hall: best.hall, set: false, uncertain: couldBe > 1 })
      } else dealt.set(a.id, ofProject === undefined ? null : { projectNo: a.projectNo!.trim(), hall: PROJECT_PLACE, set: false, uncertain: false })
    }
  }
  return dealt
}

/**
 * The workspace with the places of a day stored on its blocks, as `dealPlaces` deals them: a block that was worked out
 * gets its project and place, so that the sheet printed does not change when the plan does. Blocks that have a place,
 * and blocks that go nowhere or to the demand without a project number, are left as they are.
 */
export const withPlacesSet = (ws: Workspace, date: ISODate): Workspace => {
  const dealt = dealPlaces(ws, [date])
  let changed = false
  const assignments = (ws.assignments ?? []).map((a) => {
    const at = dealt.get(a.id)
    if (a.date !== date || !at || at.set || !at.projectNo) return a
    changed = true
    return { ...a, ...workTag({ projectNo: at.projectNo, hall: placeTag(at.hall) }) }
  })
  return changed ? { ...ws, assignments } : ws
}
