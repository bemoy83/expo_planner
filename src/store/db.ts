import Dexie, { type Table } from 'dexie'
import type { Workspace } from '../domain/types'
import { fromRecords, toRecords, type Kind, type RecordWrite, type StoredRecord } from './records'

/**
 * Browser-local storage: the records of the workspace (`records.ts`) in one table, keyed by kind and id, the shape
 * they will have in the shared copy. A cell edit writes one record.
 */
class PlannerDb extends Dexie {
  records!: Table<StoredRecord, [Kind, string]>

  constructor(name = 'expo-planner') {
    super(name)
    // A table per kind of record until version 5; the planner starts clean, so they are dropped, not moved.
    this.version(6).stores({
      meta: null,
      venue: null,
      projects: null,
      demand: null,
      allocations: null,
      visma: null,
      persons: null,
      unavailability: null,
      assignments: null,
      demandAdjustments: null,
      suppliers: null,
      hireOrders: null,
      records: '[kind+id]',
    })
  }
}

export const db = new PlannerDb()

export const loadWorkspace = async (): Promise<Workspace | null> => fromRecords(await db.records.toArray())

/** Replaces everything stored with the given workspace, in one transaction. */
export const saveWorkspace = (workspace: Workspace): Promise<void> =>
  db.transaction('rw', db.records, async () => {
    await db.records.clear()
    await db.records.bulkPut(toRecords(workspace))
  })

/** Writes the records of one user action, in one transaction. */
export const writeRecords = (writes: RecordWrite[]): Promise<void> =>
  db.transaction('rw', db.records, async () => {
    const deletes = writes.filter((write) => write.value === null).map((write): [Kind, string] => [write.kind, write.id])
    const puts = writes.filter((write) => write.value !== null).map(({ kind, id, value }): StoredRecord => ({ kind, id, value }))
    if (deletes.length) await db.records.bulkDelete(deletes)
    if (puts.length) await db.records.bulkPut(puts)
  })

/** Removes everything stored in the browser for the app. */
export const clearAll = () => db.records.clear()
