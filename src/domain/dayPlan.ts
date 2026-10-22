import type { ISODate } from './dates'
import { competenceStyles } from './competences'
import { dayType } from './holidays'
import { isWaiting } from './hire'
import { eventKey, numberKey, venueEvents } from './projects'
import { NO_PROJECT, PROJECT_PLACE, buildProjectBalance, okAssignments, paidHours, placeKey } from './staffing'
import { VENUE_PHASES, type CompetenceKey, type Minute, type VenuePhase, type Workspace } from './types'
import { PHASE_LABELS } from './venue'
import { anchorDate, visibleVenue } from './venueImport'
import { bookedPlaces, dealPlaces } from './workPlace'

/**
 * The day plan (`design_docs/ukeplan/`): one day for print, read-only. A card per project that works that day, then the
 * people as the day is read out at the start-up meeting: by place, then competence (`groups`). A person with work in two
 * groups stands in each, with the whole day drawn and the group's part of it marked. Everything is worked out from
 * Bemanning and the Kalender, and nothing is stored.
 */

/** How far a project's hours of one competence are covered that day, counting the permanent staff and confirmed orders. */
export type CoverageState = 'ok' | 'short' | 'wait'

export interface ProjectCoverage {
  competence: CompetenceKey
  state: CoverageState
  /** The suppliers that have an order waiting for an answer for it. */
  waiting: string[]
}

export interface ProjectPhaseDay {
  label: string
  /** The day of the phase's days, from one. */
  day: number
  of: number
  /** The next phase the project goes into after the day, with its first day. */
  next?: { label: string; date: ISODate }
}

export interface DayNote {
  competence: CompetenceKey
  /** The hall of the planning row; empty for a row of all halls. */
  hall: string
  text: string
}

export interface ProjectCard {
  projectNo: string
  name: string
  /** The places the project has booked that day, as the rows name them. */
  places: string[]
  phase?: ProjectPhaseDay
  coverage: ProjectCoverage[]
  notes: DayNote[]
}

/** A stretch of a fitter's day: a competence in a place for a project. */
export interface DayBlock {
  competence: CompetenceKey
  start: Minute
  end: Minute
  projectNo: string
  /** Empty where the project has no single place that day. */
  hall: string
  /** Painted on the place's line, not worked out. */
  set: boolean
  /** Worked out, and it could have been another place or project. */
  uncertain: boolean
}

export interface DayFitter {
  personId: string
  name: string
  blocks: DayBlock[]
}

/** The people of one supplier for a competence and project, with the answer. */
export interface DayHired {
  supplierId: string
  name: string
  people: number
  competence: CompetenceKey
  start: Minute
  end: Minute
  projectNo: string
  hall: string
  uncertain: boolean
  waiting: boolean
}

export interface DayAbsence {
  personId: string
  name: string
  /** The part of the day the person is away; none for the whole day. */
  from?: Minute
  to?: Minute
  /** Away at all that day, else only without a block. */
  away: boolean
  /** No block (the rest of the day, where the person is away only for a part). */
  idle: boolean
}

/** A fitter in a group: the whole day, and which of its blocks are the group's. */
export interface GroupFitter {
  kind: 'fitter'
  personId: string
  name: string
  blocks: DayBlock[]
  /** The indices of the blocks of `blocks` that belong to the group. */
  here: number[]
  /** The group's part is not the first of the person's day: the row is a later part. */
  later: boolean
}

/** The people of a competence in a place, with what they come to. */
export interface DayCompetenceGroup {
  competence: CompetenceKey
  entries: (GroupFitter | ({ kind: 'hired' } & DayHired))[]
  /** The people of the group as whole days: a fitter's paid hours in it over the hours of a normal day, and the people of confirmed orders. */
  people: number
  /** The people of orders that wait for an answer: shown, not counted. */
  waiting: number
  /** How far the project's hours of the competence are covered that day, from its card. */
  state?: CoverageState
}

/** A place of a project that day, with its competences; `projectNo` is `NO_PROJECT` for the work of no project. */
export interface DayPlaceGroup {
  projectNo: string
  name: string
  hall: string
  competences: DayCompetenceGroup[]
}

export interface DayPlan {
  date: ISODate
  projects: ProjectCard[]
  /** The people by place and then competence, as the day is read out; a person with work in two of them is in both. */
  groups: DayPlaceGroup[]
  /** The people whose blocks are for no project or no place. */
  unplaced: DayFitter[]
  /** People who are away, or without a block on a working day. */
  away: DayAbsence[]
  /** Blocks whose place is worked out, not set, and could have been another. */
  uncertain: number
  fitters: number
  hired: number
  waiting: number
}

const EPS = 0.01

/** The days each phase takes over the halls of a project's events, as the hall calendar does. */
export const projectPhaseSpans = (ws: Pick<Workspace, 'venue' | 'hiddenVenue' | 'projects'>, projectNo: string): Map<VenuePhase, { start: ISODate; end: ISODate }> => {
  const venue = visibleVenue(ws.venue, ws.hiddenVenue)
  const keys = new Set(venueEvents(venue, ws.projects).filter((event) => numberKey(event.projectNo) === numberKey(projectNo)).map((event) => event.key))
  const spans = new Map<VenuePhase, { start: ISODate; end: ISODate }>()
  for (const booking of venue) {
    if (!keys.has(eventKey(booking.eventName, anchorDate(booking)))) continue
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

/** The phase of a project on a day, and where it stands among its days. */
const phaseOn = (ws: Pick<Workspace, 'venue' | 'hiddenVenue' | 'projects'>, projectNo: string, date: ISODate): ProjectPhaseDay | undefined => {
  const spans = projectPhaseSpans(ws, projectNo)
  const phase = phaseAt(spans, date)
  if (!phase) return undefined
  const span = spans.get(phase)!
  const length = (a: ISODate, b: ISODate) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000) + 1
  const later = [...spans].filter(([, s]) => s.start > date).sort((a, b) => a[1].start.localeCompare(b[1].start))[0]
  return { label: PHASE_LABELS[phase], day: length(span.start, date), of: length(span.start, span.end), ...(later && { next: { label: PHASE_LABELS[later[0]], date: later[1].start } }) }
}

/** The day plan of a date. */
export const buildDayPlan = (ws: Workspace, date: ISODate): DayPlan => {
  const balance = buildProjectBalance(ws, [date], true)
  const dealt = dealPlaces(ws, [date])
  const styles = competenceStyles(ws)
  const order = new Map(styles.map((style, i) => [style.key, i]))
  const rankOf = (c: CompetenceKey) => order.get(c) ?? order.size
  const persons = new Map((ws.persons ?? []).map((p) => [p.id, p]))
  const nameOf = (id: string) => persons.get(id)?.name ?? id
  const suppliers = new Map((ws.suppliers ?? []).map((s) => [s.id, s]))
  const projectKeyOf = (projectNo: string) => numberKey(projectNo)
  const placeOf = (projectNo: string, hall: string): string => {
    if (placeKey(hall) !== PROJECT_PLACE) return hall.trim()
    const booked = bookedPlaces(ws, projectNo, date)
    return booked.length === 1 ? booked[0] : ''
  }

  const blocksOf = new Map<string, DayBlock[]>()
  const unplacedOf = new Map<string, DayBlock[]>()
  for (const a of okAssignments(ws)) {
    if (a.date !== date) continue
    const at = dealt.get(a.id)
    const block = (projectNo: string, hall: string, set: boolean, uncertain: boolean): DayBlock => ({ competence: a.competence, start: a.start, end: a.end, projectNo, hall, set, uncertain })
    if (at) blocksOf.set(a.personId, [...(blocksOf.get(a.personId) ?? []), block(at.projectNo, placeOf(at.projectNo, at.hall), at.set, at.uncertain)])
    else unplacedOf.set(a.personId, [...(unplacedOf.get(a.personId) ?? []), block(NO_PROJECT, '', false, false)])
  }
  // A person with blocks of both kinds stands on one row, the blocks of no project among the rest.
  for (const [personId, list] of unplacedOf) {
    if (!blocksOf.has(personId)) continue
    blocksOf.set(personId, [...blocksOf.get(personId)!, ...list])
    unplacedOf.delete(personId)
  }
  for (const list of [...blocksOf.values(), ...unplacedOf.values()]) list.sort((x, y) => x.start - y.start)

  const hiredRows: DayHired[] = []
  for (const o of ws.hireOrders ?? []) {
    if (o.date !== date) continue
    const projectNo = o.projectNo?.trim() ?? NO_PROJECT
    const places = projectNo ? [...balance.of(o.competence, date, projectNo).places.values()].filter((p) => p.demand > EPS) : []
    const best = places.reduce<(typeof places)[number] | undefined>((top, p) => (!top || p.demand > top.demand ? p : top), undefined)
    hiredRows.push({
      supplierId: o.supplierId,
      name: suppliers.get(o.supplierId)?.name ?? o.supplierId,
      people: o.conf ?? o.fte,
      competence: o.competence,
      start: o.start,
      end: o.end,
      projectNo,
      hall: best ? placeOf(projectNo, best.hall) : '',
      uncertain: places.length > 1,
      waiting: isWaiting(o),
    })
  }

  // The cards: every project with demand, blocks or orders that day.
  const numbers = new Map<string, string>()
  const note = (projectNo: string) => numbers.set(projectKeyOf(projectNo), projectNo)
  for (const c of balance.competences) for (const p of balance.get(c, date).projects.values()) if (p.projectNo) note(p.projectNo)
  for (const list of blocksOf.values()) for (const b of list) if (b.projectNo) note(b.projectNo)
  for (const h of hiredRows) if (h.projectNo) note(h.projectNo)
  const projects: ProjectCard[] = [...numbers.values()]
    .map((projectNo): ProjectCard => {
      const coverage: ProjectCoverage[] = []
      for (const c of balance.competences) {
        const p = balance.of(c, date, projectNo)
        const waiting = [...new Set(hiredRows.filter((h) => h.waiting && h.competence === c && projectKeyOf(h.projectNo) === projectKeyOf(projectNo)).map((h) => h.name))]
        if (p.demand <= EPS && p.tagged <= EPS && !waiting.length) continue
        coverage.push({ competence: c, state: p.remaining > EPS ? (waiting.length ? 'wait' : 'short') : 'ok', waiting })
      }
      coverage.sort((a, b) => rankOf(a.competence) - rankOf(b.competence))
      const notes: DayNote[] = ws.allocations
        .filter((row) => numberKey(row.projectNo) === projectKeyOf(projectNo) && row.notes?.[date]?.trim())
        .map((row) => ({ competence: row.competence.trim().toLowerCase(), hall: row.hall?.trim() ?? '', text: row.notes[date].trim() }))
      const name = ws.projects.find((ref) => numberKey(ref.projectNo) === projectKeyOf(projectNo))?.name ?? ws.allocations.find((row) => numberKey(row.projectNo) === projectKeyOf(projectNo))?.projectName ?? projectNo
      return { projectNo, name, places: bookedPlaces(ws, projectNo, date), phase: phaseOn(ws, projectNo, date), coverage, notes }
    })
    .sort((a, b) => a.projectNo.localeCompare(b.projectNo, 'nb', { numeric: true }))

  const unplaced: DayFitter[] = [...unplacedOf].map(([personId, blocks]) => ({ personId, name: nameOf(personId), blocks })).sort((a, b) => a.name.localeCompare(b.name, 'nb'))

  const working = new Set([...blocksOf.keys(), ...unplacedOf.keys()])
  const away: DayAbsence[] = []
  const absent = new Set<string>()
  for (const u of ws.unavailability ?? []) {
    if (u.date !== date) continue
    absent.add(u.personId)
    away.push({ personId: u.personId, name: nameOf(u.personId), ...(u.start !== undefined && u.end !== undefined && { from: u.start, to: u.end }), away: true, idle: !working.has(u.personId) })
  }
  // Without a block on a working day; on a weekend or a holiday nobody is expected to have one.
  if (dayType(date) === 'arbeidsdag') for (const p of ws.persons ?? []) if (!working.has(p.id) && !absent.has(p.id)) away.push({ personId: p.id, name: p.name, away: false, idle: true })
  away.sort((a, b) => a.name.localeCompare(b.name, 'nb'))

  const waiting = hiredRows.filter((h) => h.waiting).reduce((sum, h) => sum + h.people, 0)
  return {
    date,
    projects,
    groups: dayGroups(ws, [...blocksOf].map(([personId, blocks]) => ({ personId, name: nameOf(personId), blocks })), hiredRows, projects, rankOf),
    unplaced,
    away,
    uncertain: [...blocksOf.values()].reduce((sum, list) => sum + list.filter((b) => b.uncertain).length, 0),
    fitters: working.size,
    hired: hiredRows.filter((h) => !h.waiting).reduce((sum, h) => sum + h.people, 0),
    waiting,
  }
}

/**
 * The people by place and then competence: a group per project and place, a competence group in it per competence. A fitter
 * is in every group they have a block in, with their whole day; the groups come in the order of the projects' cards and
 * then of the places, the competences in the planner's order, and in a competence those who begin their day there first,
 * then the suppliers, then those who come to it later. The work of no project is a group of its own, last.
 */
const dayGroups = (ws: Workspace, fitters: DayFitter[], hired: DayHired[], cards: ProjectCard[], rankOf: (c: CompetenceKey) => number): DayPlaceGroup[] => {
  const wd = ws.settings.workday
  const fullDay = paidHours({ start: wd.dayStart, end: wd.dayEnd }, wd) || ws.settings.hoursPerDay
  const places = new Map<string, DayPlaceGroup>()
  const keyOf = (projectNo: string, hall: string) => `${numberKey(projectNo)}|${hall.trim().toLowerCase()}`
  const cardOf = (projectNo: string) => cards.find((card) => numberKey(card.projectNo) === numberKey(projectNo))
  const competenceIn = (projectNo: string, hall: string, competence: CompetenceKey) => {
    const key = keyOf(projectNo, hall)
    if (!places.has(key)) places.set(key, { projectNo, name: projectNo ? (cardOf(projectNo)?.name ?? projectNo) : 'Uten prosjekt', hall, competences: [] })
    const place = places.get(key)!
    let group = place.competences.find((g) => g.competence === competence)
    if (!group) {
      const state = cardOf(projectNo)?.coverage.find((c) => c.competence === competence)?.state
      group = { competence, entries: [], people: 0, waiting: 0, ...(state && { state }) }
      place.competences.push(group)
    }
    return group
  }
  for (const fitter of fitters) {
    const parts = new Map<string, number[]>()
    fitter.blocks.forEach((block, i) => {
      const key = `${keyOf(block.projectNo, block.hall)}|${block.competence}`
      parts.set(key, [...(parts.get(key) ?? []), i])
    })
    for (const here of parts.values()) {
      const first = fitter.blocks[here[0]]
      const group = competenceIn(first.projectNo, first.hall, first.competence)
      group.entries.push({ kind: 'fitter', personId: fitter.personId, name: fitter.name, blocks: fitter.blocks, here, later: here[0] > 0 })
      group.people += here.reduce((sum, i) => sum + paidHours(fitter.blocks[i], wd), 0) / fullDay
    }
  }
  for (const h of hired) {
    if (!h.projectNo) continue
    const group = competenceIn(h.projectNo, h.hall, h.competence)
    group.entries.push({ kind: 'hired', ...h })
    if (h.waiting) group.waiting += h.people
    else group.people += h.people
  }
  const order = (entry: DayCompetenceGroup['entries'][number]) => (entry.kind === 'hired' ? 1 : entry.later ? 2 : 0)
  const cardRank = (projectNo: string) => (projectNo ? cards.findIndex((card) => numberKey(card.projectNo) === numberKey(projectNo)) : cards.length)
  for (const place of places.values()) {
    place.competences.sort((a, b) => rankOf(a.competence) - rankOf(b.competence))
    for (const group of place.competences) group.entries.sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name, 'nb'))
  }
  return [...places.values()].sort((a, b) => cardRank(a.projectNo) - cardRank(b.projectNo) || a.hall.localeCompare(b.hall, 'nb', { numeric: true }))
}
