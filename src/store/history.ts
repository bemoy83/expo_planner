import type { AllocationRow, Assignment, CompetenceStyle, DemandAdjustment, DemandLine, HallRules, KpiConfig, LineOverride, Person, ProjectRef, Settings, Unavailability, VenueBooking, VenueImportInfo, VismaImport, Workspace } from '../domain/types'

interface Delta<T> {
  before: T
  after: T
}

/** One undoable step: the records it touched, as they were before and after. */
export interface Change {
  /** `null` means the row did not exist (before an add, after a delete). */
  allocations: Map<string, Delta<AllocationRow | null>>
  settings?: Delta<Settings>
  /** Ledger lines, `null` where the line did not exist. */
  demand: Map<string, Delta<DemandLine | null>>
  /** Visma exports per project number, `null` where none was held. */
  visma: Map<string, Delta<VismaImport | null>>
  overrides?: Delta<Record<string, LineOverride>>
  kpi?: Delta<KpiConfig | undefined>
  /** Hall bookings as a whole, with the note of which Venyou export they came from. */
  venue?: Delta<{ bookings: VenueBooking[]; info: VenueImportInfo | undefined }>
  /** Which hall bookings are left out of the Kalender. */
  hiddenVenue?: Delta<Record<string, true>>
  /** Halls chosen by hand for Hall/Sted texts. */
  hallAliases?: Delta<Record<string, string>>
  /** The planner's own places and rules for words. */
  hallRules?: Delta<HallRules>
  /** The project table: the names each project goes by. */
  projects?: Delta<ProjectRef[]>
  /** The records of Bemanning, `null` where the record did not exist. */
  persons: Map<string, Delta<Person | null>>
  unavailability: Map<string, Delta<Unavailability | null>>
  assignments: Map<string, Delta<Assignment | null>>
  demandAdjustments: Map<string, Delta<DemandAdjustment | null>>
  competenceStyles?: Delta<Record<string, CompetenceStyle>>
}

export const emptyChange = (): Change => ({
  allocations: new Map(),
  demand: new Map(),
  visma: new Map(),
  persons: new Map(),
  unavailability: new Map(),
  assignments: new Map(),
  demandAdjustments: new Map(),
})

/** Several edits to the same record within one step keep the first `before` and the last `after`. */
const record = <T,>(map: Map<string, Delta<T>>, id: string, before: T, after: T) => {
  const existing = map.get(id)
  map.set(id, { before: existing ? existing.before : before, after })
}

export const recordAllocation = (change: Change, id: string, before: AllocationRow | null, after: AllocationRow | null) =>
  record(change.allocations, id, before, after)

export const recordSettings = (change: Change, before: Settings, after: Settings) => {
  change.settings = { before: change.settings ? change.settings.before : before, after }
}

/** Notes what a ledger change did, by comparing the workspace before and after it. */
export const recordLedger = (change: Change, before: Workspace, after: Workspace) => {
  if (before.demand !== after.demand) {
    const old = new Map(before.demand.map((line) => [line.id, line]))
    for (const line of after.demand) {
      const previous = old.get(line.id) ?? null
      if (previous !== line) record(change.demand, line.id, previous, line)
      old.delete(line.id)
    }
    for (const [id, line] of old) record(change.demand, id, line, null)
  }
  if (before.visma !== after.visma) {
    const old = new Map((before.visma ?? []).map((v) => [v.projectNo, v]))
    for (const v of after.visma ?? []) {
      const previous = old.get(v.projectNo) ?? null
      if (previous !== v) record(change.visma, v.projectNo, previous, v)
      old.delete(v.projectNo)
    }
    for (const [projectNo, v] of old) record(change.visma, projectNo, v, null)
  }
  if (before.overrides !== after.overrides) change.overrides = { before: change.overrides ? change.overrides.before : (before.overrides ?? {}), after: after.overrides ?? {} }
  if (before.kpi !== after.kpi) change.kpi = { before: change.kpi ? change.kpi.before : before.kpi, after: after.kpi }
}

export const recordVenue = (change: Change, before: Workspace, after: Workspace) => {
  change.venue = {
    before: change.venue ? change.venue.before : { bookings: before.venue, info: before.venueImport },
    after: { bookings: after.venue, info: after.venueImport },
  }
}

export const recordHallAliases = (change: Change, before: Record<string, string>, after: Record<string, string>) => {
  change.hallAliases = { before: change.hallAliases ? change.hallAliases.before : before, after }
}

export const recordHallRules = (change: Change, before: HallRules, after: HallRules) => {
  change.hallRules = { before: change.hallRules ? change.hallRules.before : before, after }
}

export const recordHiddenVenue = (change: Change, before: Record<string, true>, after: Record<string, true>) => {
  change.hiddenVenue = { before: change.hiddenVenue ? change.hiddenVenue.before : before, after }
}

export const recordProjects = (change: Change, before: ProjectRef[], after: ProjectRef[]) => {
  change.projects = { before: change.projects ? change.projects.before : before, after }
}

/** Notes the records that were added, changed or removed between two lists. */
const recordList = <T extends { id: string }>(map: Map<string, Delta<T | null>>, before: T[] = [], after: T[] = []) => {
  if (before === after) return
  const old = new Map(before.map((item) => [item.id, item]))
  for (const item of after) {
    const previous = old.get(item.id) ?? null
    if (previous !== item) record(map, item.id, previous, item)
    old.delete(item.id)
  }
  for (const [id, item] of old) record(map, id, item, null)
}

/** Notes what a change to people, absence, assignments and moved hours did, by comparing the workspace before and after it. */
export const recordStaffing = (change: Change, before: Workspace, after: Workspace) => {
  recordList(change.persons, before.persons, after.persons)
  recordList(change.unavailability, before.unavailability, after.unavailability)
  recordList(change.assignments, before.assignments, after.assignments)
  recordList(change.demandAdjustments, before.demandAdjustments, after.demandAdjustments)
  if (before.competenceStyles !== after.competenceStyles) {
    change.competenceStyles = { before: change.competenceStyles ? change.competenceStyles.before : (before.competenceStyles ?? {}), after: after.competenceStyles ?? {} }
  }
}

export const isEmptyChange = (change: Change): boolean =>
  !change.settings &&
  !change.overrides &&
  !change.kpi &&
  !change.venue &&
  !change.hiddenVenue &&
  !change.hallAliases &&
  !change.hallRules &&
  !change.projects &&
  !change.competenceStyles &&
  [change.persons, change.unavailability, change.assignments, change.demandAdjustments].every((map) => [...map.values()].every((d) => d.before === d.after)) &&
  [...change.demand.values()].every((d) => d.before === d.after) &&
  [...change.visma.values()].every((d) => d.before === d.after) &&
  [...change.allocations.values()].every((d) => d.before === d.after)

export type Direction = 'undo' | 'redo'

const target = <T,>(delta: Delta<T>, direction: Direction): T => (direction === 'undo' ? delta.before : delta.after)

/** The list with the records of the change as they are in the given direction. */
const applyList = <T extends { id: string }>(list: T[] | undefined, map: Map<string, Delta<T | null>>, direction: Direction): T[] | undefined =>
  map.size ? [...(list ?? []).filter((item) => !map.has(item.id)), ...[...map.values()].flatMap((delta) => target(delta, direction) ?? [])] : list

const puts = <T,>(map: Map<string, Delta<T | null>>, direction: Direction): T[] => [...map.values()].flatMap((delta) => target(delta, direction) ?? [])
const deletes = <T,>(map: Map<string, Delta<T | null>>, direction: Direction): string[] => [...map].filter(([, delta]) => target(delta, direction) === null).map(([id]) => id)

/** Returns the workspace with the change reverted (undo) or applied again (redo). */
export const applyChange = (workspace: Workspace, change: Change, direction: Direction): Workspace => {
  let allocations = workspace.allocations
  if (change.allocations.size) {
    const remaining = allocations.filter((row) => !change.allocations.has(row.id))
    const restored = [...change.allocations.values()].flatMap((delta) => target(delta, direction) ?? [])
    allocations = [...remaining, ...restored].sort((a, b) => a.order - b.order)
  }
  const settings = change.settings ? target(change.settings, direction) : workspace.settings
  const demand = change.demand.size
    ? [...workspace.demand.filter((line) => !change.demand.has(line.id)), ...[...change.demand.values()].flatMap((delta) => target(delta, direction) ?? [])]
    : workspace.demand
  const visma = change.visma.size
    ? [...(workspace.visma ?? []).filter((v) => !change.visma.has(v.projectNo)), ...[...change.visma.values()].flatMap((delta) => target(delta, direction) ?? [])]
    : workspace.visma
  const overrides = change.overrides ? target(change.overrides, direction) : workspace.overrides
  const kpi = change.kpi ? target(change.kpi, direction) : workspace.kpi
  const venue = change.venue ? target(change.venue, direction) : { bookings: workspace.venue, info: workspace.venueImport }
  return { ...workspace, allocations, settings, demand, visma, overrides, kpi, venue: venue.bookings, venueImport: venue.info, hiddenVenue: change.hiddenVenue ? target(change.hiddenVenue, direction) : workspace.hiddenVenue,
    hallAliases: change.hallAliases ? target(change.hallAliases, direction) : workspace.hallAliases,
    hallRules: change.hallRules ? target(change.hallRules, direction) : workspace.hallRules,
    projects: change.projects ? target(change.projects, direction) : workspace.projects,
    persons: change.persons.size ? applyList(workspace.persons, change.persons, direction)?.sort((a, b) => a.order - b.order) : workspace.persons,
    unavailability: applyList(workspace.unavailability, change.unavailability, direction),
    assignments: applyList(workspace.assignments, change.assignments, direction),
    demandAdjustments: applyList(workspace.demandAdjustments, change.demandAdjustments, direction),
    competenceStyles: change.competenceStyles ? target(change.competenceStyles, direction) : workspace.competenceStyles,
  }
}

/** What has to be written to storage after applying a change in the given direction. */
export const changeWrites = (change: Change, direction: Direction) => ({
  putAllocations: [...change.allocations.values()].flatMap((delta) => target(delta, direction) ?? []),
  deleteAllocations: [...change.allocations].filter(([, delta]) => target(delta, direction) === null).map(([id]) => id),
  settings: change.settings ? target(change.settings, direction) : null,
  putDemand: [...change.demand.values()].flatMap((delta) => target(delta, direction) ?? []),
  deleteDemand: [...change.demand].filter(([, delta]) => target(delta, direction) === null).map(([id]) => id),
  putVisma: [...change.visma.values()].flatMap((delta) => target(delta, direction) ?? []),
  deleteVisma: [...change.visma].filter(([, delta]) => target(delta, direction) === null).map(([projectNo]) => projectNo),
  overrides: change.overrides ? target(change.overrides, direction) : null,
  /** `undefined` means the KPI data is unchanged; `null` means it should be removed. */
  kpi: change.kpi ? (target(change.kpi, direction) ?? null) : undefined,
  venue: change.venue ? target(change.venue, direction) : null,
  hiddenVenue: change.hiddenVenue ? target(change.hiddenVenue, direction) : null,
  hallAliases: change.hallAliases ? target(change.hallAliases, direction) : null,
  hallRules: change.hallRules ? target(change.hallRules, direction) : null,
  projects: change.projects ? target(change.projects, direction) : null,
  staffing: {
    putPersons: puts(change.persons, direction),
    deletePersons: deletes(change.persons, direction),
    putUnavailability: puts(change.unavailability, direction),
    deleteUnavailability: deletes(change.unavailability, direction),
    putAssignments: puts(change.assignments, direction),
    deleteAssignments: deletes(change.assignments, direction),
    putAdjustments: puts(change.demandAdjustments, direction),
    deleteAdjustments: deletes(change.demandAdjustments, direction),
    competenceStyles: change.competenceStyles ? target(change.competenceStyles, direction) : null,
  },
})
