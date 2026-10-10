import type { ISODate } from './dates'
import { VENUE_PHASES, type AllocationRow, type DemandLine, type ProjectRef, type VenueBooking, type Workspace } from './types'
import { anchorDate } from './venueImport'

/**
 * A project is known by its number: demand, planning rows and orders point at it. The sources call the same project
 * by different names, so the project table (`Workspace.projects`, the Prosjekter tab) holds every name a project goes
 * by, a row per name. Every Venyou event with a hall booking is a project in the Kalender, and gets the number of the
 * project that carries its name in its year.
 */

export const normalizeName = (name: string): string => name.trim().toLowerCase().replace(/\s+/g, ' ')

/** Identifies an event across Venyou exports: its name and the year it takes place. */
export const eventKey = (eventName: string, anchor: ISODate | null): string => `${normalizeName(eventName)}|${(anchor ?? '').slice(0, 4)}`

/** The year a project number begins with («26970», «26VAM»), or none where it begins with something else. */
export const numberYear = (projectNo: string): string => {
  const digits = /^\d\d/.exec(projectNo.trim())
  return digits ? `20${digits[0]}` : ''
}

/** The year a row of the project table is for: the one set on it, else that of its number. Empty holds for any year. */
export const refYear = (ref: ProjectRef): string => ref.year ?? numberYear(ref.projectNo)

/** A row of the project table. The year is kept only where the number does not say it. */
export const projectRef = (name: string, projectNo: string, year = ''): ProjectRef => {
  const ref = { name: name.trim().replace(/\s+/g, ' '), projectNo: projectNo.trim() }
  return year && year !== numberYear(ref.projectNo) ? { ...ref, year } : ref
}

const refKey = (ref: ProjectRef): string => `${normalizeName(ref.name)}|${refYear(ref)}`
const sameNumber = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase()

export interface VenueEvent {
  key: string
  name: string
  /** The year it takes place, as in its key. */
  year: string
  /** The number of the project that carries the event's name in its year; empty where none or several do. */
  projectNo: string
  /** Several projects carry the name in this year, so none is picked. */
  ambiguous: boolean
  /** The numbers of the projects that carry the name in this year. */
  candidates: string[]
  start: ISODate
  end: ISODate
  halls: string[]
}

/** name → the rows of the project table under it. */
export const projectListIndex = (projects: ProjectRef[]): Map<string, ProjectRef[]> => {
  const index = new Map<string, ProjectRef[]>()
  for (const project of projects) {
    const name = normalizeName(project.name)
    if (!name || !project.projectNo.trim()) continue
    index.set(name, [...(index.get(name) ?? []), project])
  }
  return index
}

/** The numbers of the projects that go by the name in the year, sorted. A row without a year holds for every year. */
export const projectsNamed = (index: Map<string, ProjectRef[]>, name: string, year: string): string[] => {
  const numbers = new Map<string, string>()
  for (const ref of index.get(normalizeName(name)) ?? []) {
    const of = refYear(ref)
    if (!of || !year || of === year) numbers.set(ref.projectNo.trim().toLowerCase(), ref.projectNo.trim())
  }
  return [...numbers.values()].sort()
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
export const venueEvents = (bookings: VenueBooking[], projects: ProjectRef[]): VenueEvent[] => {
  const index = projectListIndex(projects)
  const events = new Map<string, VenueEvent>()
  for (const booking of bookings) {
    const anchor = anchorDate(booking)
    const key = eventKey(booking.eventName, anchor)
    let event = events.get(key)
    if (!event) {
      const year = (anchor ?? '').slice(0, 4)
      const candidates = projectsNamed(index, booking.eventName, year)
      event = { key, name: booking.eventName, year, projectNo: candidates.length === 1 ? candidates[0] : '', ambiguous: candidates.length > 1, candidates, start: '9999-12-31', end: '0000-01-01', halls: [] }
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

/** The halls each project has booked: those of the events that carry its number. */
export const hallsOfProjects = (bookings: VenueBooking[], projects: ProjectRef[]): Map<string, string[]> => {
  const halls = new Map<string, string[]>()
  for (const event of venueEvents(bookings, projects)) {
    if (!event.projectNo) continue
    halls.set(event.projectNo, [...new Set([...(halls.get(event.projectNo) ?? []), ...event.halls])])
  }
  return halls
}

/**
 * A number for a project that has none: the year and three letters of the name («26VAM»), as the planner has made
 * them by hand. Where that is taken, other letters of the name are tried, then a digit.
 */
export const suggestProjectNo = (name: string, year: string, taken: Iterable<string>): string => {
  const used = new Set([...taken].map((no) => no.trim().toUpperCase()))
  const prefix = year.slice(2, 4)
  // A year in the name says nothing the prefix does not.
  // Letters of the number are A to Z, as in the ones made by hand.
  const plain = name.toUpperCase().replace(/Æ/g, 'AE').replace(/Ø/g, 'O').replace(/Å/g, 'A').normalize('NFD')
  const words = plain.split(/[^A-Z0-9]+/).filter((word) => word && !/^(19|20)\d\d$/.test(word))
  const letters = words.join('')
  const tries = [letters.slice(0, 3), words.slice(0, 3).map((word) => word[0]).join(''), ...words.slice(1).map((word) => letters.slice(0, 2) + word[0]), ...[...letters.slice(3)].map((letter) => letters.slice(0, 2) + letter)]
  for (const attempt of tries) if (attempt.length === 3 && !used.has(prefix + attempt)) return prefix + attempt
  const stem = (letters.slice(0, 2) || 'X').padEnd(2, 'X')
  for (let n = 1; ; n += 1) if (!used.has(`${prefix}${stem}${n}`)) return `${prefix}${stem}${n}`
}

/** The table with the name on the project in the year, and on no other project in that year: a name and a year point at one project. */
export const withProjectName = (projects: ProjectRef[], projectNo: string, name: string, year = ''): ProjectRef[] => {
  const added = projectRef(name, projectNo, year)
  if (!added.name || !added.projectNo) return projects
  // Written as the project's number already is, so the same project is not listed twice in two spellings.
  const known = projects.find((ref) => sameNumber(ref.projectNo, added.projectNo))
  const ref = known ? projectRef(added.name, known.projectNo, year || refYear(known)) : added
  return [...projects.filter((other) => refKey(other) !== refKey(ref)), ref]
}

export const withoutProjectName = (projects: ProjectRef[], projectNo: string, name: string): ProjectRef[] =>
  projects.filter((ref) => !(sameNumber(ref.projectNo, projectNo) && normalizeName(ref.name) === normalizeName(name)))

export const withoutProject = (projects: ProjectRef[], projectNo: string): ProjectRef[] => projects.filter((ref) => !sameNumber(ref.projectNo, projectNo))

/** The project under another number, with its names and its year. Onto a number in use, the two become one project. */
export const withProjectNo = (projects: ProjectRef[], from: string, to: string): ProjectRef[] => {
  const number = projects.find((ref) => sameNumber(ref.projectNo, to))?.projectNo ?? to.trim()
  if (!number || sameNumber(from, number)) return projects
  const seen = new Set<string>()
  return projects.flatMap((ref) => {
    const moved = sameNumber(ref.projectNo, from) ? projectRef(ref.name, number, refYear(ref)) : ref
    const key = `${refKey(moved)}|${moved.projectNo.toLowerCase()}`
    if (seen.has(key)) return []
    seen.add(key)
    return [moved]
  })
}

/** The year the project's names are matched in, where it is another than its number says. */
export const withProjectYear = (projects: ProjectRef[], projectNo: string, year: string): ProjectRef[] =>
  projects.map((ref) => (sameNumber(ref.projectNo, projectNo) ? projectRef(ref.name, ref.projectNo, year) : ref))

const cleaned = (projects: ProjectRef[]): ProjectRef[] => {
  const seen = new Set<string>()
  const out: ProjectRef[] = []
  for (const project of projects) {
    const ref = projectRef(project.name, project.projectNo, project.year)
    const key = `${refKey(ref)}|${ref.projectNo.toLowerCase()}`
    if (!ref.name || !ref.projectNo || seen.has(key)) continue
    seen.add(key)
    out.push(ref)
  }
  return out
}

/** Rows from a file win over rows for the same name and year already in the table; names only in the app are kept. */
export const mergeProjectList = (existing: ProjectRef[], incoming: ProjectRef[]): ProjectRef[] => {
  const file = cleaned(incoming)
  const named = new Set(file.map(refKey))
  return [...file, ...cleaned(existing).filter((ref) => !named.has(refKey(ref)))]
}

/** The table as the file has it. */
export const replaceProjectList = (incoming: ProjectRef[]): ProjectRef[] => cleaned(incoming)

export interface ProjectDiff {
  added: number
  changed: number
  unchanged: number
  onlyInApp: number
}

/** What a file would change, counted in names: new ones, ones that go to another project, and ones only the app has. */
export const diffProjectList = (existing: ProjectRef[], incoming: ProjectRef[]): ProjectDiff => {
  const numbers = (refs: ProjectRef[]) => {
    const map = new Map<string, Set<string>>()
    for (const ref of cleaned(refs)) map.set(refKey(ref), (map.get(refKey(ref)) ?? new Set()).add(ref.projectNo.toLowerCase()))
    return map
  }
  const app = numbers(existing)
  const file = numbers(incoming)
  const diff = { added: 0, changed: 0, unchanged: 0, onlyInApp: 0 }
  for (const [key, to] of file) {
    const from = app.get(key)
    if (!from) diff.added += 1
    else if (from.size === to.size && [...from].every((no) => to.has(no))) diff.unchanged += 1
    else diff.changed += 1
  }
  for (const key of app.keys()) if (!file.has(key)) diff.onlyInApp += 1
  return diff
}

/**
 * Numbers that were typed on the events themselves, as the app stored them before the project table was edited in the
 * app, become names in the table: the event's name on that number, in the event's year.
 */
export const withEventLinksAsProjects = <T extends Pick<Workspace, 'venue' | 'projects' | 'eventLinks'>>(ws: T): T => {
  const links = Object.entries(ws.eventLinks ?? {}).filter(([, projectNo]) => projectNo.trim())
  if (!links.length) return ws.eventLinks ? { ...ws, eventLinks: undefined } : ws
  const names = new Map(ws.venue.map((booking) => [eventKey(booking.eventName, anchorDate(booking)), booking.eventName]))
  let projects = ws.projects
  for (const [key, projectNo] of links) {
    const [name, year] = key.split('|')
    projects = withProjectName(projects, projectNo, names.get(key) ?? name, year)
  }
  return { ...ws, projects, eventLinks: undefined }
}

export interface ProjectFollowers {
  allocations: AllocationRow[]
  demand: DemandLine[]
}

/**
 * The planning rows and the planner's own demand lines that follow a change of the project table, as they become.
 * Rows planned for an event follow it to the number it gets, so their demand is looked up there. A project that
 * gets another number (`renumbered`) takes its rows and its own demand lines along; orders keep the number they came with.
 */
export const projectFollowers = (ws: Pick<Workspace, 'venue' | 'projects' | 'allocations' | 'demand'>, projects: ProjectRef[], renumbered?: { from: string; to: string }): ProjectFollowers => {
  const before = new Map(venueEvents(ws.venue, ws.projects).map((event) => [event.key, event.projectNo]))
  const moves = venueEvents(ws.venue, projects)
    .filter((event) => before.get(event.key) !== event.projectNo)
    .map((event) => ({ name: normalizeName(event.name), from: before.get(event.key) ?? '', to: event.projectNo }))
  const moved = (row: AllocationRow): string => {
    if (renumbered && row.projectNo && sameNumber(row.projectNo, renumbered.from)) return renumbered.to
    const move = moves.find((event) => event.name === normalizeName(row.projectName) && row.projectNo === event.from)
    return move ? move.to : row.projectNo
  }
  return {
    allocations: ws.allocations.flatMap((row) => (moved(row) === row.projectNo ? [] : [{ ...row, projectNo: moved(row) }])),
    demand: renumbered ? ws.demand.flatMap((line) => (line.origin === 'manual' && sameNumber(line.projectNo, renumbered.from) ? [{ ...line, projectNo: renumbered.to }] : [])) : [],
  }
}

/** The name as it is compared: lower case, without years, company forms and signs, written together. */
const comparable = (name: string): string =>
  name
    .toLowerCase()
    .split(/[^a-zæøå0-9]+/)
    .filter((word) => word && !/^(19|20)\d\d$/.test(word) && word !== 'as')
    .join('')

/**
 * How alike two names are, from 0 to 1: the share of the pairs of letters they have in common. «VA messen» and
 * «VA MESSEN 2026» are 1, «Datacenterforum» and «Datacenter Forum Nordic» are well above `ALIKE`, two events of the
 * same organizer with different titles are below it.
 */
export const nameLikeness = (a: string, b: string): number => likeness(a, b).alike

/**
 * How much of the shorter name is in the longer, from 0 to 1: «Oslo Motor Show 2026» is all in «OSLO MOTOR SHOW 2026 -
 * VIP Green Room». A name of a few letters is in too many others to say anything, and gives 0.
 */
export const nameWithin = (a: string, b: string): number => likeness(a, b).within

const likeness = (a: string, b: string): { alike: number; within: number } => {
  const [x, y] = [comparable(a), comparable(b)]
  if (!x || !y) return { alike: 0, within: 0 }
  const pairs = (text: string) => {
    const counts = new Map<string, number>()
    for (let i = 0; i < text.length - 1; i += 1) counts.set(text.slice(i, i + 2), (counts.get(text.slice(i, i + 2)) ?? 0) + 1)
    return counts
  }
  const [px, py] = [pairs(x), pairs(y)]
  let shared = 0
  for (const [pair, n] of px) shared += Math.min(n, py.get(pair) ?? 0)
  const shorter = Math.min(x.length, y.length)
  return { alike: x === y ? 1 : (2 * shared) / (x.length - 1 + (y.length - 1) || 1), within: shorter < 5 ? 0 : x === y ? 1 : shared / (shorter - 1) }
}

/** How alike two names must be for one to be offered as the other. */
export const ALIKE = 0.75
/** How much of a name must be in a longer one for the two to be offered as one project, where their days overlap too. */
export const WITHIN = 0.9

/** A project a row is offered: its number, and the name of it that is like the row's. */
export interface ProjectMatch {
  projectNo: string
  name: string
}

/** What a row of the Prosjekter tab still lacks: an event without a project, a name several projects carry, or a number known from orders or the plan only. */
export type ProjectLacking = 'number' | 'ambiguous' | 'new'

/** A row of the Prosjekter tab: a project with its names, or an event that has no project yet. */
export interface ProjectRow {
  key: string
  /** Empty for an event that has no project. */
  projectNo: string
  year: string
  /** The names in the table. For an event without a project, and a number that is not in the table, the name it is known by. */
  names: string[]
  /** The Venyou events that got the project's number. */
  events: VenueEvent[]
  /** Whether orders are read in for the number. */
  orders: boolean
  /** How many demand lines and planning rows point at the number. */
  lines: number
  rows: number
  lacking: ProjectLacking | null
  /** A number to give an event that has none. */
  suggestion: string
  /** For an event without a project: a project of its year with a name like its own and no event on other days, or one whose name is within its own (or the other way) with an event on its days. */
  match?: ProjectMatch
  /**
   * For an event without a project and without a match in its year: the number of its year in the series of a project of
   * another year with a name like its own («27231» after «26231»), and that project's name. Only where that number is free.
   */
  series?: ProjectMatch & { after: string }
  /** For a number that is not in the table: the project that carries a name like its own under another number. The name, or the whole project where its number was made up, can go to this one. */
  replaces?: ProjectMatch
  /** The projects that carry the event's name, where there are several. */
  candidates: string[]
}

/** The rows of the Prosjekter tab: what lacks a project first, by date, then the projects, the latest year first. */
export const projectRows = (ws: Pick<Workspace, 'venue' | 'projects' | 'visma' | 'demand' | 'allocations'>): ProjectRow[] => {
  const byNumber = new Map<string, ProjectRow>()
  const row = (projectNo: string, year: string, lacking: ProjectLacking | null): ProjectRow => {
    const key = projectNo.trim().toLowerCase()
    let found = byNumber.get(key)
    if (!found) byNumber.set(key, (found = { key, projectNo: projectNo.trim(), year, names: [], events: [], orders: false, lines: 0, rows: 0, lacking, suggestion: '', candidates: [] }))
    return found
  }
  for (const ref of ws.projects) {
    if (!ref.name.trim() || !ref.projectNo.trim()) continue
    const project = row(ref.projectNo, refYear(ref), null)
    if (!project.names.some((name) => normalizeName(name) === normalizeName(ref.name))) project.names.push(ref.name)
  }
  // Numbers the orders, the demand and the plan point at are projects too, to be given their names.
  const known = (projectNo: string, name: string): ProjectRow | null => {
    if (!projectNo.trim()) return null
    const project = row(projectNo, numberYear(projectNo), 'new')
    if (project.lacking === 'new' && name.trim() && !project.names.length) project.names.push(name.trim())
    return project
  }
  for (const order of ws.visma ?? []) {
    const project = known(order.projectNo, order.eventName)
    if (project) project.orders = true
  }
  for (const line of ws.demand) {
    const project = known(line.projectNo, line.projectName)
    if (project) project.lines += 1
  }
  for (const planned of ws.allocations) {
    const project = known(planned.projectNo, planned.projectName)
    if (project) project.rows += 1
  }
  const taken = new Set([...byNumber.values()].map((project) => project.projectNo))
  const events = venueEvents(ws.venue, ws.projects)
  for (const event of events) if (event.projectNo) row(event.projectNo, event.year, null).events.push(event)
  /**
   * The project of the year with the name most like the given one. `sameDays` says whether the project has an event on
   * the days in question, or `null` where it has no event or there are no days to hold it against: a project with an
   * event on other days is another happening, however alike the names are, and one on the same days needs less of a likeness.
   */
  const mostAlike = (name: string, year: string, sameDays: (project: ProjectRow) => boolean | null, among: (project: ProjectRow) => boolean): ProjectMatch | undefined => {
    let best: (ProjectMatch & { score: number }) | undefined
    for (const project of byNumber.values()) {
      if ((project.year && year && project.year !== year) || !among(project)) continue
      const days = sameDays(project)
      if (days === false) continue
      for (const other of project.names) {
        const { alike, within } = likeness(name, other)
        if (alike < ALIKE && !(days && within >= WITHIN)) continue
        // A project on the same days comes before one that is only alike.
        const score = Math.max(alike, days ? within : 0) + (days ? 1 : 0)
        if (score > (best?.score ?? 0)) best = { projectNo: project.projectNo, name: other, score }
      }
    }
    return best && { projectNo: best.projectNo, name: best.name }
  }
  /**
   * A number is its year and what the project is numbered within the year, and an event that comes back is most often
   * numbered the same year after year. So the event is offered the number of its year after the project of the nearest
   * other year with a name like its own. Not where that number is in use: the numbers of a year are also given anew.
   */
  const inSeries = (name: string, year: string): ProjectRow['series'] => {
    let best: (ProjectMatch & { after: string; likeness: number; apart: number }) | undefined
    for (const project of byNumber.values()) {
      if (!year || !numberYear(project.projectNo) || project.year !== numberYear(project.projectNo) || project.year === year) continue
      const projectNo = year.slice(2) + project.projectNo.slice(2)
      if ([...taken].some((no) => sameNumber(no, projectNo))) continue
      const apart = Math.abs(Number(project.year) - Number(year))
      for (const other of project.names) {
        const likeness = nameLikeness(name, other)
        if (likeness >= ALIKE && (!best || apart < best.apart || (apart === best.apart && likeness > best.likeness))) best = { projectNo, name: other, after: project.projectNo, likeness, apart }
      }
    }
    return best && { projectNo: best.projectNo, name: best.name, after: best.after }
  }
  const missing: ProjectRow[] = []
  for (const event of events) {
    if (event.projectNo) continue
    const suggestion = suggestProjectNo(event.name, event.year, taken)
    taken.add(suggestion)
    const match = event.ambiguous ? undefined : mostAlike(event.name, event.year, (project) => (project.events.length ? project.events.some((other) => other.start <= event.end && event.start <= other.end) : null), () => true)
    const series = match || event.ambiguous ? undefined : inSeries(event.name, event.year)
    if (series) taken.add(series.projectNo)
    missing.push({ key: `event:${event.key}`, projectNo: '', year: event.year, names: [event.name], events: [event], orders: false, lines: 0, rows: 0, lacking: event.ambiguous ? 'ambiguous' : 'number', suggestion, candidates: event.candidates, ...(match ? { match } : {}), ...(series ? { series } : {}) })
  }
  for (const project of byNumber.values()) {
    if (project.lacking !== 'new' || !project.names[0]) continue
    const replaces = mostAlike(project.names[0], project.year, () => null, (other) => other.lacking === null)
    if (replaces) project.replaces = replaces
  }
  const projects = [...byNumber.values()].sort((a, b) => Number(b.lacking === 'new') - Number(a.lacking === 'new') || b.year.localeCompare(a.year) || a.projectNo.localeCompare(b.projectNo, 'nb'))
  return [...missing, ...projects]
}

/** Whether the number was made up in the app or by hand, as «26VAM», and not given by the system the orders come from. */
export const isMadeUpNumber = (projectNo: string): boolean => /[a-zæøå]/i.test(projectNo)

/**
 * The table when a number that came with orders takes over from the project that has carried its name (`ProjectRow.replaces`).
 * A project with a made-up number and that name alone becomes the number, and what points at it follows (`renumbered`).
 * From any other project the name alone moves. `ownName` is what the orders call the project.
 */
export const withNumberTakingOver = (projects: ProjectRef[], projectNo: string, ownName: string, from: ProjectMatch): { projects: ProjectRef[]; renumbered?: { from: string; to: string } } => {
  const names = projects.filter((ref) => sameNumber(ref.projectNo, from.projectNo))
  const year = refYear(names.find((ref) => normalizeName(ref.name) === normalizeName(from.name)) ?? projectRef(from.name, projectNo))
  // The name the orders have for it is one of its names from here on.
  const named = (list: ProjectRef[]) => withProjectName(list, projectNo, ownName, year)
  if (isMadeUpNumber(from.projectNo) && names.length === 1) return { projects: named(withProjectNo(projects, from.projectNo, projectNo)), renumbered: { from: from.projectNo, to: projectNo.trim() } }
  return { projects: named(withProjectName(projects, projectNo, from.name, year)) }
}
