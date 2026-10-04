import Dexie, { type EntityTable } from 'dexie'
import type { AllocationRow, CapacityLine, DemandLine, ProjectRef, Settings, VenueBooking, Workspace } from '../domain/types'

interface MetaRecord {
  key: 'settings' | 'importedFrom'
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
  }
}

export const db = new PlannerDb()

const TABLES = () => [db.meta, db.venue, db.projects, db.demand, db.allocations, db.capacity]

export const loadWorkspace = async (): Promise<Workspace | null> => {
  const settings = await db.meta.get('settings')
  if (!settings) return null
  const [importedFrom, venue, projects, demand, allocations, capacity] = await Promise.all([
    db.meta.get('importedFrom'),
    db.venue.toArray(),
    db.projects.toArray(),
    db.demand.toArray(),
    db.allocations.toArray(),
    db.capacity.toArray(),
  ])
  return {
    settings: settings.value as Settings,
    importedFrom: importedFrom?.value as Workspace['importedFrom'],
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
    ])
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
