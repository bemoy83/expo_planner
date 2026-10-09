import type { ISODate } from './dates'
import { VENUE_PHASES, type ProjectRef, type VenueBooking } from './types'
import { anchorDate } from './venueImport'

/**
 * Projects in the workspace come from the Venyou calendar: every event with a hall booking is a project,
 * whether or not any demand exists for it. The project list (name → project number) is only the key that
 * connects a Venyou event to its Visma project number.
 */

export const normalizeName = (name: string): string => name.trim().toLowerCase().replace(/\s+/g, ' ')

/** Identifies an event across Venyou exports: its name and the year it takes place. */
export const eventKey = (eventName: string, anchor: ISODate | null): string => `${normalizeName(eventName)}|${(anchor ?? '').slice(0, 4)}`

export type LinkSource = 'manual' | 'list' | 'none'

export interface VenueEvent {
  key: string
  name: string
  projectNo: string
  /** How the project number was found: set by hand, matched by name in the project list, or not found. */
  linkSource: LinkSource
  /** More than one number in the project list carries this name, so none is picked. */
  ambiguous: boolean
  /** The numbers the project list has under this name, to pick from where there are several. */
  candidates: string[]
  start: ISODate
  end: ISODate
  halls: string[]
}

/** name → the project numbers registered under it. */
export const projectListIndex = (projects: ProjectRef[]): Map<string, Set<string>> => {
  const index = new Map<string, Set<string>>()
  for (const project of projects) {
    const name = normalizeName(project.name)
    const projectNo = project.projectNo.trim()
    if (!name || !projectNo) continue
    index.set(name, (index.get(name) ?? new Set()).add(projectNo))
  }
  return index
}

/** project number → the names the project list has for it, normalized. */
export const projectNamesIndex = (projects: ProjectRef[]): Map<string, Set<string>> => {
  const index = new Map<string, Set<string>>()
  for (const project of projects) {
    const name = normalizeName(project.name)
    const projectNo = project.projectNo.trim()
    if (!name || !projectNo) continue
    index.set(projectNo, (index.get(projectNo) ?? new Set()).add(name))
  }
  return index
}

/** One entry per event in the hall bookings, with its period, halls and project number. */
export const venueEvents = (bookings: VenueBooking[], links: Record<string, string> | undefined, projects: ProjectRef[]): VenueEvent[] => {
  const index = projectListIndex(projects)
  const events = new Map<string, VenueEvent>()
  for (const booking of bookings) {
    const key = eventKey(booking.eventName, anchorDate(booking))
    let event = events.get(key)
    if (!event) {
      const listed = index.get(normalizeName(booking.eventName))
      const manual = links?.[key]?.trim()
      const fromList = listed?.size === 1 ? [...listed][0] : ''
      event = {
        key,
        name: booking.eventName,
        projectNo: manual || fromList,
        linkSource: manual ? 'manual' : fromList ? 'list' : 'none',
        ambiguous: !manual && (listed?.size ?? 0) > 1,
        candidates: [...(listed ?? [])].sort(),
        start: '9999-12-31',
        end: '0000-01-01',
        halls: [],
      }
      events.set(key, event)
    }
    if (!event.halls.includes(booking.hall)) event.halls.push(booking.hall)
    for (const phase of VENUE_PHASES) {
      const span = booking.phases[phase]
      if (!span) continue
      if (span.start < event.start) event.start = span.start
      if (span.end > event.end) event.end = span.end
    }
  }
  return [...events.values()].filter((event) => event.start <= event.end).sort((a, b) => a.start.localeCompare(b.start) || a.name.localeCompare(b.name, 'nb'))
}

/** Rows from a file win over names already in the list; names only in the app are kept. */
export const mergeProjectList = (existing: ProjectRef[], incoming: ProjectRef[]): ProjectRef[] => {
  const seen = new Set<string>()
  const out: ProjectRef[] = []
  for (const project of [...incoming, ...existing]) {
    const key = `${normalizeName(project.name)}|${project.projectNo.trim()}`
    if (!project.name.trim() || !project.projectNo.trim() || seen.has(key)) continue
    seen.add(key)
    out.push({ name: project.name.trim(), projectNo: project.projectNo.trim() })
  }
  return out
}
