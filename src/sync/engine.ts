import { confirmSent, databaseName, pendingOutbox, readCursor, takeRemote, type OutboxEntry, type RemoteRecord } from '../store/db'
import type { Delta, Kind } from '../store/records'
import { pushTo } from '../domain/collections'

/** Where the shared copy stands, as the page header says it. */
export type SyncState = 'synced' | 'syncing' | 'offline' | 'paused' | 'error'

/** A row of the shared table, as it is read. */
export interface RemoteRow {
  kind: string
  id: string
  data: unknown
  deleted: boolean
  rev: number
  batch_id: string
  updated_by: string
  updated_at: string
}

/** What the engine needs of the shared copy: the two calls it makes. Supabase in the app, a stand-in in the tests. */
export interface SharedCopy {
  /** Sends the writes of one batch; returns each record's new rev, and who it overwrote unseen where someone did. */
  push: (batch: string, records: { kind: string; id: string; data: unknown; base_rev: number | null }[]) => Promise<{ kind: string; id: string; rev: number; overwritten_by: string | null }[]>
  /** The records written after `after`, in the order of their revs, at most `limit`. */
  pull: (after: number, limit: number) => Promise<RemoteRow[]>
}

const PAGE = 1000

/**
 * Of a page of rows read in the order of their revs, those of the batches that are whole: the last batch of a full
 * page may go on in the next. A page that is one batch alone and full is not whole either; it is read on into the next.
 */
export const wholeBatches = (rows: RemoteRow[], full: boolean): RemoteRow[] => {
  if (!full || !rows.length) return rows
  const last = rows[rows.length - 1].batch_id
  return rows.filter((row) => row.batch_id !== last)
}

/** The batches waiting to be sent, each with its writes, oldest first. */
const batchesOf = (entries: OutboxEntry[]): OutboxEntry[][] => {
  const batches = new Map<string, OutboxEntry[]>()
  for (const entry of entries) pushTo(batches, entry.batch, entry)
  return [...batches.values()]
}

/** Sends what waits, a batch at a time. Returns the ids of the planners who had changed a record unseen. */
export const pushAll = async (copy: SharedCopy): Promise<string[]> => {
  const overwritten: string[] = []
  for (const batch of batchesOf(await pendingOutbox())) {
    // One write per record: the last of the batch is what it ended up as.
    const last = new Map(batch.map((entry) => [`${entry.kind}|${entry.id}`, entry]))
    const result = await copy.push(batch[0].batch, [...last.values()].map((entry) => ({ kind: entry.kind, id: entry.id, data: entry.value, base_rev: entry.baseRev })))
    await confirmSent(batch, result)
    for (const row of result) if (row.overwritten_by) overwritten.push(row.overwritten_by)
  }
  return overwritten
}

/** Reads what has been written since the cursor, a page at a time, whole batches only. Returns what changed. */
export const pullAll = async (copy: SharedCopy): Promise<Delta[]> => {
  let cursor = await readCursor()
  const deltas: Delta[] = []
  let carried: RemoteRow[] = []
  for (;;) {
    const page = await copy.pull(carried.length ? carried[carried.length - 1].rev : cursor, PAGE)
    const rows = [...carried, ...page]
    const full = page.length === PAGE
    const whole = wholeBatches(rows, full)
    carried = rows.slice(whole.length)
    if (whole.length) {
      cursor = whole[whole.length - 1].rev
      deltas.push(...(await takeRemote(whole.map((row): RemoteRecord => ({ kind: row.kind as Kind, id: row.id, value: row.deleted ? null : row.data, rev: row.rev, by: row.updated_by, at: row.updated_at })), cursor)))
    }
    if (!full) return deltas
  }
}

/** Whether an error is the network being gone, rather than the shared copy saying no. */
const offline = (error: unknown) => (typeof navigator !== 'undefined' && !navigator.onLine) || (error instanceof TypeError && /fetch|network/i.test(error.message))

/** A paused free project answers that it is not there. */
const paused = (error: unknown) => /paused|project.*(inactive|not found)|\b540\b/i.test(String((error as { message?: string })?.message ?? error))

/**
 * Whether the shared copy said no to what was sent, with a code of Postgres or of its REST layer (a member taken out,
 * a record it cannot take): sending the same again gets the same answer, so the sync stops until told to try again.
 * A sign-in that has run out (PGRST301, PGRST302) is renewed by itself, and is tried again.
 */
export const refused = (error: unknown): boolean => {
  const code = (error as { code?: unknown } | null)?.code
  return typeof code === 'string' && /^([0-9A-Z]{5}|PGRST\d+)$/.test(code) && !/^PGRST30[12]$/.test(code)
}

/** What went wrong, as the shared copy said it. */
const messageOf = (error: unknown): string => String((error as { message?: string } | null)?.message ?? error)

/**
 * Windows of one browser share its database, outbox and cursor: they send and read one at a time, so a batch is not
 * sent twice and nothing read in is read again.
 */
const oneWindowAtATime = (work: () => Promise<void>): Promise<void> =>
  typeof navigator !== 'undefined' && navigator.locks ? navigator.locks.request(`${databaseName()}:sync`, work) : work()

interface Engine {
  /** Sends and reads a moment from now: for writes, which come in bursts while a planner works. */
  nudge: () => void
  /** Sends and reads now, or as soon as the run under way is over: when another computer says it wrote. */
  now: () => void
  /** Starts again after the shared copy has said no. */
  retry: () => void
  stop: () => void
}

/** A write is sent this long after the last of a burst. */
const BURST_MS = 800
/** How often the shared copy is looked at without a word from the others: the check for a word that was lost. */
const LOOK_MS = 30_000

/**
 * Keeps the browser's copy and the shared one in step: sends what waits and reads what is new, at start, when told
 * (after a write), every half minute, when the network comes back and when the page is looked at again.
 */
export const startEngine = (
  copy: SharedCopy,
  on: { remote: (deltas: Delta[]) => void; state: (state: SyncState, error?: string) => void; overwritten: (by: string[]) => void; sent: () => void },
): Engine => {
  let running = false
  let again = false
  let stopped = false
  /** The shared copy said no: nothing is sent or read until the planner tries again. */
  let halted = false
  let timer: ReturnType<typeof setTimeout> | null = null

  const run = async () => {
    if (stopped || halted) return
    if (running) {
      again = true
      return
    }
    running = true
    try {
      await oneWindowAtATime(sync)
      on.state('synced')
    } catch (error) {
      halted = !offline(error) && refused(error)
      on.state(halted ? 'error' : offline(error) ? 'offline' : paused(error) ? 'paused' : 'error', halted ? messageOf(error) : undefined)
    } finally {
      running = false
      if (again) {
        again = false
        void run()
      }
    }
  }
  const sync = async () => {
    const sending = (await pendingOutbox()).length > 0
    // Said only when there is something to send: a look that finds nothing new says nothing.
    if (sending) on.state('syncing')
    const by = await pushAll(copy)
    if (by.length) on.overwritten(by)
    if (sending) on.sent()
    const deltas = await pullAll(copy)
    if (deltas.length && !stopped) on.remote(deltas)
  }
  // Writes come in bursts while a planner works; they are sent a moment after the last.
  const nudge = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(run, BURST_MS)
  }
  const interval = setInterval(run, LOOK_MS)
  const visible = () => document.visibilityState === 'visible' && void run()
  window.addEventListener('online', run)
  document.addEventListener('visibilitychange', visible)
  void run()
  return {
    nudge,
    now: () => void run(),
    retry: () => {
      halted = false
      void run()
    },
    stop: () => {
      stopped = true
      if (timer) clearTimeout(timer)
      clearInterval(interval)
      window.removeEventListener('online', run)
      document.removeEventListener('visibilitychange', visible)
    },
  }
}
