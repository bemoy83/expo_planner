import Dexie, { type EntityTable } from 'dexie'
import type { AllocationRow, CapacityLine, DemandLine, KpiConfig, LineOverride, ProjectRef, Settings, VenueBooking, VenueImportInfo, VismaImport, Workspace } from '../domain/types'

interface MetaRecord {
  key: 'settings' | 'importedFrom' | 'kpi' | 'overrides' | 'venueImport' | 'hiddenVenue' | 'eventLinks'
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
  capacity!: EntityTable<CapacityLine, 'id'>
  visma!: EntityTable<VismaImport, 'projectNo'>

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
  }
}

export const db = new PlannerDb()

const TABLES = () => [db.meta, db.venue, db.projects, db.demand, db.allocations, db.capacity, db.visma]

export const loadWorkspace = async (): Promise<Workspace | null> => {
  const settings = await db.meta.get('settings')
  if (!settings) return null
  const [importedFrom, eventLinks, hiddenVenue, venueImport, kpi, overrides, visma, venue, projects, demand, allocations, capacity] = await Promise.all([
    db.meta.get('importedFrom'),
    db.meta.get('eventLinks'),
    db.meta.get('hiddenVenue'),
    db.meta.get('venueImport'),
    db.meta.get('kpi'),
    db.meta.get('overrides'),
    db.visma.toArray(),
    db.venue.toArray(),
    db.projects.toArray(),
    db.demand.toArray(),
    db.allocations.toArray(),
    db.capacity.toArray(),
  ])
  return {
    settings: settings.value as Settings,
    importedFrom: importedFrom?.value as Workspace['importedFrom'],
    venueImport: venueImport?.value as VenueImportInfo | undefined,
    hiddenVenue: (hiddenVenue?.value as Record<string, true> | undefined) ?? {},
    eventLinks: (eventLinks?.value as Record<string, string> | undefined) ?? {},
    kpi: kpi?.value as KpiConfig | undefined,
    overrides: (overrides?.value as Record<string, LineOverride> | undefined) ?? {},
    visma,
    venue,
    projects: projects.map(({ name, projectNo }) => ({ name, projectNo })),
    demand,
    allocations: allocations.sort((a, b) => a.order - b.order),
    capacity: capacity.sort((a, b) => a.order - b.order),
  }
}

/** Replaces everything stored with the given workspace, in one transaction. */
export const saveWorkspace = async (workspace: Workspace): Promise<void> => {
  await db.transaction('rw', TABLES(), async () => {
    await Promise.all(TABLES().map((table) => table.clear()))
    await db.meta.bulkPut([
      { key: 'settings', value: workspace.settings },
      ...(workspace.importedFrom ? [{ key: 'importedFrom' as const, value: workspace.importedFrom }] : []),
      ...(workspace.kpi ? [{ key: 'kpi' as const, value: workspace.kpi }] : []),
      ...(workspace.venueImport ? [{ key: 'venueImport' as const, value: workspace.venueImport }] : []),
      { key: 'overrides' as const, value: workspace.overrides ?? {} },
      { key: 'hiddenVenue' as const, value: workspace.hiddenVenue ?? {} },
      { key: 'eventLinks' as const, value: workspace.eventLinks ?? {} },
    ])
    await db.visma.bulkPut(workspace.visma ?? [])
    await db.venue.bulkPut(workspace.venue)
    await db.projects.bulkAdd(workspace.projects.map((p) => ({ ...p })))
    await db.demand.bulkPut(workspace.demand)
    await db.allocations.bulkPut(workspace.allocations)
    await db.capacity.bulkPut(workspace.capacity)
  })
}

export const putAllocation = (row: AllocationRow) => db.allocations.put(row)
export const deleteAllocation = (id: string) => db.allocations.delete(id)
export const putCapacityLine = (line: CapacityLine) => db.capacity.put(line)
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

/** Replaces the hall bookings and the note of which Venyou export they came from. */
export const writeVenue = (venue: VenueBooking[], info: VenueImportInfo | undefined) =>
  db.transaction('rw', [db.venue, db.meta], async () => {
    await db.venue.clear()
    await db.venue.bulkPut(venue)
    if (info) await db.meta.put({ key: 'venueImport', value: info })
    else await db.meta.delete('venueImport')
  })

export const putHiddenVenue = (hidden: Record<string, true>) => db.meta.put({ key: 'hiddenVenue', value: hidden })

export const putEventLinks = (links: Record<string, string>) => db.meta.put({ key: 'eventLinks', value: links })

/** Replaces the project list (event name → project number). */
export const writeProjects = (projects: ProjectRef[]) =>
  db.transaction('rw', [db.projects], async () => {
    await db.projects.clear()
    await db.projects.bulkAdd(projects.map((p) => ({ ...p })))
  })
