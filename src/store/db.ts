import Dexie, { type EntityTable } from 'dexie'
import { withoutStoredNames } from '../domain/kpi'
import { withEventLinksAsProjects } from '../domain/projects'
import { withSettingsDefaults, type AllocationRow, type Assignment, type CompetenceStyle, type DemandAdjustment, type DemandLine, type HallRules, type KpiConfig, type LineOverride, type Person, type ProjectRef, type Settings, type Unavailability, type VenueBooking, type VenueImportInfo, type VismaImport, type Workspace } from '../domain/types'

interface MetaRecord {
  key: 'settings' | 'kpi' | 'overrides' | 'venueImport' | 'hiddenVenue' | 'eventLinks' | 'hallAliases' | 'hallRules' | 'competenceStyles'
  value: unknown
}

type ProjectRecord = ProjectRef & { id?: number }

/** Browser-local storage. Each kind of record has its own table so a cell edit writes one row. */
class PlannerDb extends Dexie {
  meta!: EntityTable<MetaRecord, 'key'>
  venue!: EntityTable<VenueBooking, 'id'>
  projects!: EntityTable<ProjectRecord, 'id'>
  demand!: EntityTable<DemandLine, 'id'>
  allocations!: EntityTable<AllocationRow, 'id'>
  visma!: EntityTable<VismaImport, 'projectNo'>
  persons!: EntityTable<Person, 'id'>
  unavailability!: EntityTable<Unavailability, 'id'>
  assignments!: EntityTable<Assignment, 'id'>
  demandAdjustments!: EntityTable<DemandAdjustment, 'id'>

  constructor(name = 'expo-planner') {
    super(name)
    this.version(1).stores({
      meta: 'key',
      venue: 'id',
      projects: '++id',
      demand: 'id, projectNo',
      allocations: 'id, projectName',
      capacity: 'id',
    })
    this.version(2).stores({ visma: 'projectNo' })
    this.version(3).stores({ persons: 'id', unavailability: 'id, personId, date', assignments: 'id, personId, date', demandAdjustments: 'id, date' })
    // The staffing lines typed in by hand came with the planner workbook only; their table is dropped.
    this.version(4).stores({ capacity: null })
  }
}

export const db = new PlannerDb()

/** The tables of Bemanning: people, their absence and assignments, and hours moved between days. */
export const STAFFING_TABLES = () => [db.persons, db.unavailability, db.assignments, db.demandAdjustments]

const TABLES = () => [db.meta, db.venue, db.projects, db.demand, db.allocations, db.visma, ...STAFFING_TABLES()]

export const loadWorkspace = async (): Promise<Workspace | null> => {
  const settings = await db.meta.get('settings')
  if (!settings) return null
  const [eventLinks, hallAliases, hallRules, hiddenVenue, venueImport, kpi, overrides, competenceStyles, visma, venue, projects, demand, allocations, persons, unavailability, assignments, demandAdjustments] = await Promise.all([
    db.meta.get('eventLinks'),
    db.meta.get('hallAliases'),
    db.meta.get('hallRules'),
    db.meta.get('hiddenVenue'),
    db.meta.get('venueImport'),
    db.meta.get('kpi'),
    db.meta.get('overrides'),
    db.meta.get('competenceStyles'),
    db.visma.toArray(),
    db.venue.toArray(),
    db.projects.toArray(),
    db.demand.toArray(),
    db.allocations.toArray(),
    db.persons.toArray(),
    db.unavailability.toArray(),
    db.assignments.toArray(),
    db.demandAdjustments.toArray(),
  ])
  // Numbers typed on the events by an earlier version are names in the project table from here on; they are written there with its next change.
  return withEventLinksAsProjects({
    settings: withSettingsDefaults(settings.value as Partial<Settings>),
    venueImport: venueImport?.value as VenueImportInfo | undefined,
    hiddenVenue: (hiddenVenue?.value as Record<string, true> | undefined) ?? {},
    eventLinks: (eventLinks?.value as Record<string, string> | undefined) ?? {},
    hallAliases: (hallAliases?.value as Record<string, string> | undefined) ?? {},
    ...(hallRules ? { hallRules: hallRules.value as HallRules } : {}),
    kpi: kpi ? withoutStoredNames(kpi.value as KpiConfig) : undefined,
    overrides: (overrides?.value as Record<string, LineOverride> | undefined) ?? {},
    visma,
    venue,
    projects: projects.map(({ id: _id, ...ref }) => ref),
    demand,
    allocations: allocations.sort((a, b) => a.order - b.order),
    persons: persons.sort((a, b) => a.order - b.order),
    unavailability,
    assignments,
    demandAdjustments,
    competenceStyles: (competenceStyles?.value as Record<string, CompetenceStyle> | undefined) ?? {},
  })
}

/** Replaces everything stored with the given workspace, in one transaction. */
export const saveWorkspace = async (workspace: Workspace): Promise<void> => {
  await db.transaction('rw', TABLES(), async () => {
    await Promise.all(TABLES().map((table) => table.clear()))
    await db.meta.bulkPut([
      { key: 'settings', value: workspace.settings },
      ...(workspace.kpi ? [{ key: 'kpi' as const, value: workspace.kpi }] : []),
      ...(workspace.venueImport ? [{ key: 'venueImport' as const, value: workspace.venueImport }] : []),
      { key: 'overrides' as const, value: workspace.overrides ?? {} },
      { key: 'hiddenVenue' as const, value: workspace.hiddenVenue ?? {} },
      { key: 'hallAliases' as const, value: workspace.hallAliases ?? {} },
      ...(workspace.hallRules ? [{ key: 'hallRules' as const, value: workspace.hallRules }] : []),
      { key: 'competenceStyles' as const, value: workspace.competenceStyles ?? {} },
    ])
    await db.visma.bulkPut(workspace.visma ?? [])
    await db.venue.bulkPut(workspace.venue)
    await db.projects.bulkAdd(workspace.projects.map((p) => ({ ...p })))
    await db.demand.bulkPut(workspace.demand)
    await db.allocations.bulkPut(workspace.allocations)
    await db.persons.bulkPut(workspace.persons ?? [])
    await db.unavailability.bulkPut(workspace.unavailability ?? [])
    await db.assignments.bulkPut(workspace.assignments ?? [])
    await db.demandAdjustments.bulkPut(workspace.demandAdjustments ?? [])
  })
}

export const deleteAllocation = (id: string) => db.allocations.delete(id)
export const putSettings = (settings: Settings) => db.meta.put({ key: 'settings', value: settings })

export interface DemandWrite {
  deleteIds?: string[]
  putLines?: DemandLine[]
  overrides?: Record<string, LineOverride>
  kpi?: KpiConfig
  visma?: VismaImport[]
}

/** Writes one change to the demand ledger and its reference data in a single transaction. */
export const writeDemand = (change: DemandWrite) =>
  db.transaction('rw', [db.demand, db.meta, db.visma], async () => {
    if (change.deleteIds?.length) await db.demand.bulkDelete(change.deleteIds)
    if (change.putLines?.length) await db.demand.bulkPut(change.putLines)
    if (change.overrides) await db.meta.put({ key: 'overrides', value: change.overrides })
    if (change.kpi) await db.meta.put({ key: 'kpi', value: change.kpi })
    if (change.visma?.length) await db.visma.bulkPut(change.visma)
  })

export interface StaffingWrite {
  putPersons?: Person[]
  deletePersons?: string[]
  putUnavailability?: Unavailability[]
  deleteUnavailability?: string[]
  putAssignments?: Assignment[]
  deleteAssignments?: string[]
  putAdjustments?: DemandAdjustment[]
  deleteAdjustments?: string[]
  competenceStyles?: Record<string, CompetenceStyle> | null
}

/** The writes of one staffing change; call it inside a transaction that covers the staffing tables and `meta`. */
export const putStaffing = async (change: StaffingWrite) => {
  if (change.deletePersons?.length) await db.persons.bulkDelete(change.deletePersons)
  if (change.putPersons?.length) await db.persons.bulkPut(change.putPersons)
  if (change.deleteUnavailability?.length) await db.unavailability.bulkDelete(change.deleteUnavailability)
  if (change.putUnavailability?.length) await db.unavailability.bulkPut(change.putUnavailability)
  if (change.deleteAssignments?.length) await db.assignments.bulkDelete(change.deleteAssignments)
  if (change.putAssignments?.length) await db.assignments.bulkPut(change.putAssignments)
  if (change.deleteAdjustments?.length) await db.demandAdjustments.bulkDelete(change.deleteAdjustments)
  if (change.putAdjustments?.length) await db.demandAdjustments.bulkPut(change.putAdjustments)
  if (change.competenceStyles) await db.meta.put({ key: 'competenceStyles', value: change.competenceStyles })
}

/** Replaces the hall bookings and the note of which Venyou export they came from. */
export const writeVenue = (venue: VenueBooking[], info: VenueImportInfo | undefined) =>
  db.transaction('rw', [db.venue, db.meta], async () => {
    await db.venue.clear()
    await db.venue.bulkPut(venue)
    if (info) await db.meta.put({ key: 'venueImport', value: info })
    else await db.meta.delete('venueImport')
  })

export const putHiddenVenue = (hidden: Record<string, true>) => db.meta.put({ key: 'hiddenVenue', value: hidden })

export const putHallAliases = (aliases: Record<string, string>) => db.meta.put({ key: 'hallAliases', value: aliases })

export const putHallRules = (rules: HallRules) => db.meta.put({ key: 'hallRules', value: rules })

/** Replaces the project table. The numbers an earlier version kept on the events are in it by now, and go. */
export const writeProjects = (projects: ProjectRef[]) =>
  db.transaction('rw', [db.projects, db.meta], async () => {
    await db.meta.delete('eventLinks')
    await db.projects.clear()
    await db.projects.bulkAdd(projects.map((p) => ({ ...p })))
  })

/** Removes everything stored in the browser for the app. */
export const clearAll = () => db.transaction('rw', TABLES(), () => Promise.all(TABLES().map((table) => table.clear())))
