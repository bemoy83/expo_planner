// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../domain/types'
import { clearAll, pendingOutbox, readCursor, sharedDbName, switchDatabase, writeRecords } from '../store/db'
import { PUSH_CHUNK, pushAll, remoteRecord, startEngine, type RemoteRow, type SharedCopy, type SyncState } from './engine'

/**
 * The engine's runs against a stand-in for the shared copy: when it sends and reads, what it says of the state, and
 * where it stops. The shared copy itself, and the sync of two browsers through it, are tested in `shared.test.ts`.
 */

const row = (rev: number, over: Partial<RemoteRow> = {}): RemoteRow => ({
  kind: 'person',
  id: `p${rev}`,
  data: { id: `p${rev}`, name: `Person ${rev}`, order: rev, competences: [] },
  deleted: false,
  rev,
  batch_id: `b${rev}`,
  updated_by: 'kari',
  updated_at: '2026-10-23T10:00:00Z',
  ...over,
})

/** A shared copy that holds what it is sent and gives back what it holds, or fails the way it is told to. */
const standIn = () => {
  const rows: RemoteRow[] = []
  let failure: unknown = null
  const calls = { push: 0, pull: 0 }
  let gate: Promise<void> | null = null
  const copy: SharedCopy = {
    push: async (batch, records) => {
      calls.push++
      if (failure) throw failure
      return records.map((record) => {
        const rev = rows.length + 1
        rows.push({ kind: record.kind, id: record.id, data: record.data, deleted: record.data === null, rev, batch_id: batch, updated_by: 'me', updated_at: '' })
        return { kind: record.kind, id: record.id, rev, overwritten_by: null }
      })
    },
    pull: async (after, limit) => {
      calls.pull++
      if (gate) await gate
      if (failure) throw failure
      return rows.filter((r) => r.rev > after).slice(0, limit)
    },
  }
  return {
    copy,
    rows,
    calls,
    fail: (error: unknown) => (failure = error),
    heal: () => (failure = null),
    /** Holds every read until the returned function is called. */
    hold: () => {
      let open = () => {}
      gate = new Promise((resolve) => (open = resolve))
      return () => {
        gate = null
        open()
      }
    },
  }
}

/** The engine with what it says written down. */
const started = (copy: SharedCopy) => {
  const states: (SyncState | string)[] = []
  const remote: string[] = []
  const overwritten: string[][] = []
  let sent = 0
  const engine = startEngine(copy, {
    remote: (deltas) => remote.push(...deltas.map((d) => `${d.kind} ${d.id}`)),
    state: (state, error) => states.push(error ? `${state}: ${error}` : state),
    overwritten: (by) => overwritten.push(by),
    sent: () => sent++,
  })
  return { engine, states, remote, overwritten, sent: () => sent }
}

/** Lets the run under way, and the writes to the browser database in it, finish. */
const settle = () => vi.waitFor(async () => {
  await new Promise((resolve) => setTimeout(resolve, 5))
})

const person = (id: string) => ({ kind: 'person' as const, id, value: { id, name: id, order: 0, competences: [] } })

let stops: (() => void)[] = []

beforeEach(async () => {
  switchDatabase(sharedDbName('engine'))
  await clearAll()
})

afterEach(() => {
  for (const stop of stops) stop()
  stops = []
  vi.useRealTimers()
})

const start = (copy: SharedCopy) => {
  const run = started(copy)
  stops.push(run.engine.stop)
  return run
}

describe('the engine', () => {
  it('reads what is new at start, and says it is in step without saying it synced when nothing waited', async () => {
    const shared = standIn()
    shared.rows.push(row(1), row(2))
    const run = start(shared.copy)
    await vi.waitFor(() => expect(run.states).toEqual(['synced']))
    expect(run.remote).toEqual(['person p1', 'person p2'])
    expect(run.sent()).toBe(0)
    expect(await readCursor()).toBe(2)
  })

  it('sends what waits, says so, and then that it is in step', async () => {
    await writeRecords([{ kind: 'settings', id: 'settings', value: DEFAULT_SETTINGS }, person('p1')])
    const shared = standIn()
    const run = start(shared.copy)
    await vi.waitFor(() => expect(run.states).toEqual(['syncing', 'synced']))
    expect(run.sent()).toBe(1)
    expect(shared.rows.map((r) => r.id)).toEqual(['settings', 'p1'])
    expect(await pendingOutbox()).toEqual([])
    // Its own writes, read back, are no change.
    expect(run.remote).toEqual([])
  })

  it('sends a burst of writes once, a moment after the last', async () => {
    const shared = standIn()
    const run = start(shared.copy)
    await vi.waitFor(() => expect(run.states).toEqual(['synced']))
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    await writeRecords([person('p1')])
    run.engine.nudge()
    vi.advanceTimersByTime(500)
    await writeRecords([person('p2')])
    run.engine.nudge()
    vi.advanceTimersByTime(500)
    expect(shared.calls.push).toBe(0)
    vi.advanceTimersByTime(300)
    vi.useRealTimers()
    await vi.waitFor(() => expect(run.states).toEqual(['synced', 'syncing', 'synced']))
    // One run, which sends the two writes as the two batches they are.
    expect(shared.calls.pull).toBe(2)
    expect(shared.rows.map((r) => r.id)).toEqual(['p1', 'p2'])
  })

  it('runs once more after the run under way when told to while it runs, not once per word', async () => {
    const shared = standIn()
    const open = shared.hold()
    const run = start(shared.copy)
    await vi.waitFor(() => expect(shared.calls.pull).toBe(1))
    shared.rows.push(row(1))
    run.engine.now()
    run.engine.now()
    open()
    await vi.waitFor(() => expect(run.states).toEqual(['synced', 'synced']))
    await settle()
    expect(shared.calls.pull).toBe(2)
    expect(run.remote).toEqual(['person p1'])
  })

  it('says it is offline when the network is gone, and goes on when it is back', async () => {
    const shared = standIn()
    shared.fail(new TypeError('Failed to fetch'))
    const run = start(shared.copy)
    await vi.waitFor(() => expect(run.states).toEqual(['offline']))
    shared.heal()
    shared.rows.push(row(1))
    window.dispatchEvent(new Event('online'))
    await vi.waitFor(() => expect(run.states).toEqual(['offline', 'synced']))
    expect(run.remote).toEqual(['person p1'])
  })

  it('says a free project is paused, and tries again by itself', async () => {
    const shared = standIn()
    shared.fail(new Error('Project is paused'))
    const run = start(shared.copy)
    await vi.waitFor(() => expect(run.states).toEqual(['paused']))
    shared.heal()
    run.engine.now()
    await vi.waitFor(() => expect(run.states).toEqual(['paused', 'synced']))
  })

  it('stops where the shared copy said no, keeps the writes, and starts again when told to', async () => {
    await writeRecords([person('p1')])
    const shared = standIn()
    shared.fail({ code: '42501', message: 'not a member of the workspace' })
    const run = start(shared.copy)
    await vi.waitFor(() => expect(run.states).toEqual(['syncing', 'error: not a member of the workspace']))
    run.engine.now()
    run.engine.nudge()
    window.dispatchEvent(new Event('online'))
    await settle()
    expect(shared.calls.push).toBe(1)
    expect((await pendingOutbox()).map((entry) => entry.id)).toEqual(['p1'])
    shared.heal()
    run.engine.retry()
    await vi.waitFor(() => expect(run.states.at(-1)).toBe('synced'))
    expect(await pendingOutbox()).toEqual([])
  })

  it('tells who had changed a record unseen', async () => {
    await writeRecords([person('p1')])
    const shared = standIn()
    const push = shared.copy.push
    shared.copy.push = async (batch, records) => (await push(batch, records)).map((r) => ({ ...r, overwritten_by: 'ola' }))
    const run = start(shared.copy)
    await vi.waitFor(() => expect(run.overwritten).toEqual([['ola']]))
  })

  it('looks at the shared copy every half minute', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const shared = standIn()
    const run = start(shared.copy)
    await vi.waitFor(() => expect(run.states).toEqual(['synced']))
    shared.rows.push(row(1))
    vi.advanceTimersByTime(30_000)
    await vi.waitFor(() => expect(run.remote).toEqual(['person p1']))
  })

  it('does nothing once stopped, and passes on nothing a run under way read', async () => {
    const shared = standIn()
    shared.rows.push(row(1))
    const open = shared.hold()
    const run = start(shared.copy)
    await vi.waitFor(() => expect(shared.calls.pull).toBe(1))
    run.engine.stop()
    open()
    await settle()
    expect(run.remote).toEqual([])
    run.engine.now()
    window.dispatchEvent(new Event('online'))
    await settle()
    expect(shared.calls.pull).toBe(1)
  })

  it('passes over rows it cannot take, and moves past them', async () => {
    const shared = standIn()
    shared.rows.push(row(1), row(2, { kind: 'somethingNew' }), row(3, { data: 'not a person' }), row(4))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const run = start(shared.copy)
    await vi.waitFor(() => expect(run.states).toEqual(['synced']))
    expect(run.remote).toEqual(['person p1', 'person p4'])
    expect(await readCursor()).toBe(4)
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })
})

describe('a row of the shared table', () => {
  it('is a record when its kind is known and its value has the shape of the kind', () => {
    expect(remoteRecord(row(1))).toEqual({ kind: 'person', id: 'p1', value: row(1).data, rev: 1, by: 'kari', at: '2026-10-23T10:00:00Z' })
    expect(remoteRecord(row(1, { kind: 'hidden', data: true }))?.value).toBe(true)
    expect(remoteRecord(row(1, { kind: 'budget', data: 120000 }))?.value).toBe(120000)
    expect(remoteRecord(row(1, { kind: 'hallChoice', data: 'B' }))?.value).toBe('B')
  })

  it('is a delete when it is a tombstone, whatever it holds', () => {
    expect(remoteRecord(row(1, { deleted: true, data: null }))?.value).toBeNull()
    expect(remoteRecord(row(1, { kind: 'budget', deleted: true, data: null }))?.value).toBeNull()
  })

  it('is no record with a kind this version does not know, no id, no rev, or a value of the wrong shape', () => {
    expect(remoteRecord(row(1, { kind: 'trade' }))).toBeNull()
    expect(remoteRecord(row(1, { kind: 'toString' }))).toBeNull()
    expect(remoteRecord(row(1, { id: '' }))).toBeNull()
    expect(remoteRecord(row(Number.NaN))).toBeNull()
    expect(remoteRecord(row(1, { data: null }))).toBeNull()
    expect(remoteRecord(row(1, { data: [] }))).toBeNull()
    expect(remoteRecord(row(1, { data: 'Kari' }))).toBeNull()
    expect(remoteRecord(row(1, { kind: 'hidden', data: false }))).toBeNull()
    expect(remoteRecord(row(1, { kind: 'budget', data: '120000' }))).toBeNull()
  })
})

describe('sending a large batch', () => {
  /** The stand-in, with the size of every call it is sent, timing out on calls larger than `limit`. */
  const sized = (limit = Infinity) => {
    const shared = standIn()
    const sizes: number[] = []
    const copy: SharedCopy = {
      ...shared.copy,
      push: async (batch, records) => {
        sizes.push(records.length)
        if (records.length > limit) throw { code: '57014', message: 'canceling statement due to statement timeout' }
        return shared.copy.push(batch, records)
      },
    }
    return { shared, sizes, copy }
  }
  const people = (n: number) => Array.from({ length: n }, (_, i) => person(`p${i}`))

  it('sends it in parts under one batch id, and empties the outbox', async () => {
    await writeRecords(people(PUSH_CHUNK * 2 + 10))
    const { shared, sizes, copy } = sized()
    await pushAll(copy)
    expect(sizes).toEqual([PUSH_CHUNK, PUSH_CHUNK, 10])
    expect(new Set(shared.rows.map((r) => r.batch_id)).size).toBe(1)
    expect(await pendingOutbox()).toEqual([])
  })

  it('tries a part that runs out of time again at half the size, and goes on at that size', async () => {
    await writeRecords(people(300))
    const { shared, sizes, copy } = sized(200)
    await pushAll(copy)
    expect(sizes).toEqual([300, 250, 125, 125, 50])
    expect(shared.rows).toHaveLength(300)
    expect(await pendingOutbox()).toEqual([])
  })

  it('gives up where even the smallest part runs out of time, keeping what was not sent', async () => {
    await writeRecords(people(30))
    const { copy } = sized(10)
    await expect(pushAll(copy)).rejects.toMatchObject({ code: '57014' })
    expect(await pendingOutbox()).toHaveLength(30)
  })

  it('confirms every write of a record that a batch wrote twice', async () => {
    await writeRecords([person('p1'), { ...person('p1'), value: { id: 'p1', name: 'Ny', order: 0, competences: [] } }])
    const { shared, copy } = sized()
    await pushAll(copy)
    expect(shared.rows.map((r) => (r.data as { name: string }).name)).toEqual(['Ny'])
    expect(await pendingOutbox()).toEqual([])
  })
})
