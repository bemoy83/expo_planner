import Dexie, { type Table } from 'dexie'
import type { Workspace } from '../domain/types'
import { fromRecords, recordKey, toRecords, type Delta, type Kind, type RecordWrite, type StoredRecord } from './records'

/** A record as the browser keeps it: with the rev of the shared copy it was last seen at, where it has been synced. */
export interface LocalRecord extends StoredRecord {
  rev?: number
  /** In a shared workspace: who wrote it last, and when. */
  by?: string
  at?: string
}

/** A write waiting to be sent to the shared copy. The writes of one user action share a batch. */
export interface OutboxEntry {
  seq?: number
  batch: string
  kind: Kind
  id: string
  value: unknown
  /** The rev of the record when it was written: a newer one in the shared copy means someone else changed it since. */
  baseRev: number | null
}

/**
 * Browser-local storage: the records of the workspace (`records.ts`) in one table, keyed by kind and id, the shape
 * they have in the shared copy. A cell edit writes one record. A shared workspace has a database of its own
 * (`expo-planner-<id>`), with the writes waiting to be sent (`outbox`) and how far the shared copy has been read
 * (`sync`); the workspace of this browser alone is `expo-planner`, as before.
 */
class PlannerDb extends Dexie {
  records!: Table<LocalRecord, [Kind, string]>
  outbox!: Table<OutboxEntry, number>
  sync!: Table<{ key: string; value: unknown }, string>

  constructor(name: string) {
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
    this.version(7).stores({ outbox: '++seq, batch', sync: 'key' })
  }
}

export const LOCAL_DB = 'expo-planner'
export const sharedDbName = (workspaceId: string) => `${LOCAL_DB}-${workspaceId}`

let db = new PlannerDb(LOCAL_DB)
/** The database is a shared workspace's: what is written goes to the outbox too. */
let shared = false
const written = new Set<() => void>()

/**
 * The other windows of this browser that have the same database open: they share its records but not the workspace in
 * memory, so each says what it wrote or read in, and the others take it in as written elsewhere.
 */
const tabName = (name: string) => `${name}:records`
let tabs = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(tabName(LOCAL_DB))
const fromTabs = new Set<(deltas: Delta[]) => void>()
const listen = (channel: BroadcastChannel | null) => {
  if (channel) channel.onmessage = (event: MessageEvent<Delta[]>) => fromTabs.forEach((listener) => listener(event.data))
}
listen(tabs)

/** Called with what another window of this browser wrote to the database, or read into it from the shared copy. */
export const onOtherWindow = (listener: (deltas: Delta[]) => void) => {
  fromTabs.add(listener)
  return () => {
    fromTabs.delete(listener)
  }
}

const tellWindows = (deltas: Delta[]) => {
  if (deltas.length) tabs?.postMessage(deltas)
}

/** Switches to the database of a shared workspace, or back to this browser's own. */
export const switchDatabase = (name: string) => {
  if (db.name === name) return
  db.close()
  db = new PlannerDb(name)
  shared = name !== LOCAL_DB
  tabs?.close()
  tabs = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(tabName(name))
  listen(tabs)
}

/** The name of the database open, so that work on it can be kept to one window at a time. */
export const databaseName = () => db.name

export const isShared = () => shared

/** The planner signed in, whose writes in a shared workspace are noted as theirs. */
let planner: string | null = null
export const setPlanner = (id: string | null) => {
  planner = id
}

/** Called after each write to a shared workspace, so it can be sent. */
export const onWritten = (listener: () => void) => {
  written.add(listener)
  return () => written.delete(listener)
}

export const loadWorkspace = async (): Promise<Workspace | null> => fromRecords(await db.records.toArray())

/** The workspace kept in this browser alone, read without switching to it: to offer it for upload to a shared one. */
export const loadLocalWorkspace = async (): Promise<Workspace | null> => {
  const local = new PlannerDb(LOCAL_DB)
  try {
    return fromRecords(await local.records.toArray())
  } finally {
    local.close()
  }
}

/** Writes the records of one user action in one transaction, and in a shared workspace queues them to be sent, as one batch. */
export const writeRecords = async (writes: RecordWrite[]): Promise<void> => {
  if (!writes.length) return
  await db.transaction('rw', [db.records, db.outbox], async () => {
    // The rev each record was last seen at: it stays on the record, and goes with the write as what it was based on.
    const known = shared ? await db.records.bulkGet(writes.map((w): [Kind, string] => [w.kind, w.id])) : []
    const revOf = new Map(writes.map((w, i) => [recordKey(w.kind, w.id), known[i]?.rev]))
    const deletes = writes.filter((w) => w.value === null).map((w): [Kind, string] => [w.kind, w.id])
    const signed = shared && planner ? { by: planner, at: new Date().toISOString() } : {}
    const puts = writes.filter((w) => w.value !== null).map(({ kind, id, value }): LocalRecord => {
      const rev = revOf.get(recordKey(kind, id))
      return { kind, id, value, ...(rev === undefined ? {} : { rev }), ...signed }
    })
    if (deletes.length) await db.records.bulkDelete(deletes)
    if (puts.length) await db.records.bulkPut(puts)
    if (shared) {
      const batch = crypto.randomUUID()
      await db.outbox.bulkAdd(writes.map((w) => ({ batch, kind: w.kind, id: w.id, value: w.value, baseRev: revOf.get(recordKey(w.kind, w.id)) ?? null })))
    }
  })
  tellWindows(writes.map(({ kind, id, value }) => ({ kind, id, before: null, after: value })))
  if (shared) for (const listener of written) listener()
}

/** Replaces everything stored with the given workspace, in one transaction; in a shared workspace, for everyone. */
export const saveWorkspace = async (workspace: Workspace): Promise<void> => {
  const records = toRecords(workspace)
  if (!shared) {
    await db.transaction('rw', db.records, async () => {
      await db.records.clear()
      await db.records.bulkPut(records)
    })
    return
  }
  const keep = new Set(records.map((r) => recordKey(r.kind, r.id)))
  const gone = (await db.records.toArray()).filter((r) => !keep.has(recordKey(r.kind, r.id)))
  await writeRecords([...gone.map(({ kind, id }) => ({ kind, id, value: null })), ...records])
}

/** Removes everything stored in the browser for the workspace: its records, and in a shared one what was not sent yet and how far it was read. */
export const clearAll = () => db.transaction('rw', [db.records, db.outbox, db.sync], () => Promise.all([db.records.clear(), db.outbox.clear(), db.sync.clear()]))

/** Deletes a shared workspace's database from this browser. */
export const deleteDatabase = (name: string) => Dexie.delete(name)

// ---- what the sync reads and writes ------------------------------------------------------------------------------

export const readCursor = async (): Promise<number> => ((await db.sync.get('cursor'))?.value as number | undefined) ?? 0

/** The writes waiting to be sent, oldest first. */
export const pendingOutbox = (): Promise<OutboxEntry[]> => db.outbox.orderBy('seq').toArray()

/** The writes of a batch have reached the shared copy, with these revs. */
export const confirmSent = (sent: OutboxEntry[], revs: { kind: string; id: string; rev: number }[]) =>
  db.transaction('rw', [db.records, db.outbox], async () => {
    await db.outbox.bulkDelete(sent.map((entry) => entry.seq!))
    for (const { kind, id, rev } of revs) await db.records.update([kind as Kind, id], { rev })
  })

/** A record as read from the shared copy: `null` where it is deleted. */
export interface RemoteRecord {
  kind: Kind
  id: string
  value: unknown
  rev: number
  /** The planner who wrote it, and when. */
  by: string
  at: string
}

/**
 * Takes in records read from the shared copy and moves the cursor past them. A record with a write of this browser
 * still waiting is left as it is here: that write is later and will win. Returns what changed, to apply in memory.
 */
export const takeRemote = async (records: RemoteRecord[], cursor: number): Promise<Delta[]> => {
  const deltas = await takeIn(records, cursor)
  tellWindows(deltas)
  return deltas
}

const takeIn = (records: RemoteRecord[], cursor: number): Promise<Delta[]> =>
  db.transaction('rw', [db.records, db.outbox, db.sync], async () => {
    const waiting = new Set((await db.outbox.toArray()).map((entry) => recordKey(entry.kind, entry.id)))
    const incoming = records.filter((r) => !waiting.has(recordKey(r.kind, r.id)))
    const known = await db.records.bulkGet(incoming.map((r): [Kind, string] => [r.kind, r.id]))
    const deltas: Delta[] = []
    for (const [i, r] of incoming.entries()) {
      const before = known[i]?.value ?? null
      if (r.value === null) await db.records.delete([r.kind, r.id])
      else await db.records.put({ kind: r.kind, id: r.id, value: r.value, rev: r.rev, by: r.by, at: r.at })
      if (JSON.stringify(before) !== JSON.stringify(r.value)) deltas.push({ kind: r.kind, id: r.id, before, after: r.value, by: r.by })
    }
    await db.sync.put({ key: 'cursor', value: cursor })
    return deltas
  })

/** The planners of the shared workspace, by their id: the e-mail each signs in with. */
export const plannerNames = async (): Promise<Map<string, string>> =>
  new Map((await db.records.where('[kind+id]').between(['planner', ''], ['planner', '\uffff']).toArray()).map((r) => [r.id, (r.value as { email: string }).email]))

/** Notes the planner signed in, once, so the others can be told who changed what. */
export const notePlanner = async (id: string, email: string) => {
  const known = await db.records.get(['planner', id])
  if ((known?.value as { email?: string } | undefined)?.email !== email) await writeRecords([{ kind: 'planner', id, value: { email } }])
}

/** Who last wrote any of the records, and when; none where they were written before the workspace was shared. */
export const lastChanged = async (keys: [Kind, string][]): Promise<{ by: string; at: string } | null> => {
  let last: { by: string; at: string } | null = null
  for (const record of await db.records.bulkGet(keys)) if (record?.by && record.at && (!last || record.at > last.at)) last = { by: record.by, at: record.at }
  return last
}
