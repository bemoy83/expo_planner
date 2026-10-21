// @vitest-environment node
import { readFileSync } from 'node:fs'
import 'fake-indexeddb/auto'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, type Workspace } from '../domain/types'
import { emptyShared, loadWorkspace, notePlanner, pendingOutbox, plannerNames, saveWorkspace, sharedDbName, switchDatabase, writeRecords } from '../store/db'
import { pullAll, pushAll, refused, wholeBatches, type RemoteRow, type SharedCopy } from './engine'

/**
 * The shared copy and the sync with it. The schema is run in an in-memory Postgres with a stand-in for Supabase's `auth` schema: the user
 * a request comes from is the setting `request.jwt.claim.sub`, as `auth.uid()` reads it in Supabase.
 */
const AUTH = `
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon;
  create role authenticated;
  grant usage on schema public, auth to anon, authenticated;
  create schema realtime;
  create table realtime.messages (topic text);
  alter table realtime.messages enable row level security;
  create function realtime.topic() returns text language sql stable as $$ select current_setting('realtime.topic', true) $$;
  grant usage on schema realtime to authenticated;
  grant select, insert on realtime.messages to authenticated;
  insert into auth.users values ('00000000-0000-0000-0000-00000000000a', 'kari@example.com'), ('00000000-0000-0000-0000-00000000000b', 'ola@example.com'), ('00000000-0000-0000-0000-00000000000c', 'ute@example.com');
`
const KARI = '00000000-0000-0000-0000-00000000000a'
const OLA = '00000000-0000-0000-0000-00000000000b'
const OUTSIDER = '00000000-0000-0000-0000-00000000000c'

let db: PGlite
let workspace: string

/** Runs a query as a signed-in user, with the rights of Supabase's `authenticated` role. */
const as = async <T,>(user: string, sql: string, params: unknown[] = []): Promise<T[]> =>
  db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [user])
    await tx.query('set local role authenticated')
    return (await tx.query<T>(sql, params)).rows
  })

const push = (user: string, records: object[], batch: string = crypto.randomUUID()) =>
  as<{ kind: string; id: string; rev: number; overwritten_rev: number | null; overwritten_by: string | null }>(user, 'select * from push_records($1, $2, $3)', [workspace, batch, JSON.stringify(records)])

beforeAll(async () => {
  db = new PGlite()
  await db.exec(AUTH)
  await db.exec(readFileSync('supabase/schema.sql', 'utf8'))
  await db.exec(readFileSync('supabase/002_members.sql', 'utf8'))
  await db.exec(readFileSync('supabase/003_owner_and_channel.sql', 'utf8'))
  // Supabase grants the roles everything on the tables of `public`; row-level security is what holds them back.
  await db.exec('grant all on workspaces, workspace_members, records to anon, authenticated')
  workspace = (await db.query<{ id: string }>(`select id from workspaces where name = 'Expo Planner'`)).rows[0].id
  await db.query(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'owner'), ($1, $3, 'planner')`, [workspace, KARI, OLA])
}, 30000)

describe('the shared copy', () => {
  it('writes a batch with revs in order, and reads it back by rev', async () => {
    const written = await push(KARI, [
      { kind: 'settings', id: 'settings', data: { hoursPerDay: 7.5 }, base_rev: null },
      { kind: 'allocCell', id: 'r1|2026-10-14', data: { fte: 2 }, base_rev: null },
    ])
    expect(written.map((w) => Number(w.rev))).toEqual([1, 2])
    const rows = await as<{ kind: string; data: unknown; updated_by: string }>(KARI, 'select kind, data, updated_by from records where workspace_id = $1 and rev > 0 order by rev', [workspace])
    expect(rows).toEqual([
      { kind: 'settings', data: { hoursPerDay: 7.5 }, updated_by: KARI },
      { kind: 'allocCell', data: { fte: 2 }, updated_by: KARI },
    ])
  })

  it('keeps a delete as a tombstone', async () => {
    await push(KARI, [{ kind: 'allocCell', id: 'r1|2026-10-14', data: null, base_rev: 2 }])
    const [cell] = await as<{ data: unknown; deleted: boolean }>(KARI, `select data, deleted from records where kind = 'allocCell'`)
    expect(cell).toEqual({ data: null, deleted: true })
  })

  it('lets the later write win and says who it overwrote', async () => {
    const [mine] = await push(KARI, [{ kind: 'override', id: 'k1', data: { comment: 'Kari' }, base_rev: null }])
    // Ola changes it without having seen Kari's write.
    const [theirs] = await push(OLA, [{ kind: 'override', id: 'k1', data: { comment: 'Ola' }, base_rev: null }])
    expect(theirs).toMatchObject({ overwritten_rev: mine.rev, overwritten_by: KARI })
    // Having seen it, there is nothing to tell.
    const [again] = await push(KARI, [{ kind: 'override', id: 'k1', data: { comment: 'Kari igjen' }, base_rev: theirs.rev }])
    expect(again).toMatchObject({ overwritten_rev: null, overwritten_by: null })
  })

  it('is closed to those who are not members, for reading and writing', async () => {
    await expect(push(OUTSIDER, [{ kind: 'override', id: 'x', data: {}, base_rev: null }])).rejects.toThrow(/not a member/)
    expect(await as(OUTSIDER, 'select * from records')).toEqual([])
    expect(await as(OUTSIDER, 'select * from workspaces')).toEqual([])
  })

  it('takes no writes but through push_records', async () => {
    await expect(as(KARI, `insert into records (workspace_id, kind, id, rev, batch_id, updated_by) values ($1, 'x', 'y', 999, gen_random_uuid(), $2)`, [workspace, KARI])).rejects.toThrow()
    await as(KARI, `update workspaces set rev = 0`)
    await as(KARI, `delete from records`)
    expect(Number((await db.query<{ rev: number }>('select rev from workspaces')).rows[0].rev)).toBeGreaterThan(0)
    expect((await db.query('select * from records')).rows.length).toBeGreaterThan(0)
  })
})

/** The shared copy as the engine reaches it, for one signed-in planner. */
const copyFor = (user: string): SharedCopy => ({
  push: async (batch, records) => (await push(user, records, batch)).map((row) => ({ ...row, rev: Number(row.rev) })),
  pull: async (after, limit) =>
    (await as<RemoteRow>(user, 'select kind, id, data, deleted, rev, batch_id, updated_by, updated_at::text from records where workspace_id = $1 and rev > $2 order by rev limit $3', [workspace, after, limit])).map((row) => ({ ...row, rev: Number(row.rev) })),
})

/** One browser: its own database, switched to before it acts. */
const browser = (name: string, user: string) => ({
  name,
  copy: copyFor(user),
  async act<T>(fn: () => Promise<T>): Promise<T> {
    switchDatabase(sharedDbName(name))
    return fn()
  },
  records: () => {
    switchDatabase(sharedDbName(name))
    return loadWorkspace()
  },
})

describe('the members of a workspace', () => {
  it('are listed for members, with their e-mails and who owns it', async () => {
    const members = await as<{ email: string; owner: boolean }>(OLA, 'select email, owner from list_members($1)', [workspace])
    expect(members).toEqual([
      { email: 'kari@example.com', owner: true },
      { email: 'ola@example.com', owner: false },
    ])
    await expect(as(OUTSIDER, 'select * from list_members($1)', [workspace])).rejects.toThrow(/not a member/)
  })

  it('are added by the owner, once they have a user, and taken out again', async () => {
    expect(await as<{ add_member: string }>(KARI, 'select add_member($1, $2)', [workspace, 'nobody@example.com'])).toEqual([{ add_member: 'not-signed-in' }])
    expect(await as<{ add_member: string }>(KARI, 'select add_member($1, $2)', [workspace, ' UTE@example.com '])).toEqual([{ add_member: 'added' }])
    expect(await as<{ add_member: string }>(KARI, 'select add_member($1, $2)', [workspace, 'ute@example.com'])).toEqual([{ add_member: 'already' }])
    await as(KARI, 'select remove_member($1, $2)', [workspace, OUTSIDER])
    expect((await as(KARI, 'select * from list_members($1)', [workspace])).length).toBe(2)
    await expect(as(KARI, 'select remove_member($1, $2)', [workspace, KARI])).rejects.toThrow(/not allowed/)
  })

  it('are managed by the owner alone', async () => {
    await expect(as(OLA, 'select add_member($1, $2)', [workspace, 'ute@example.com'])).rejects.toThrow(/not the owner/)
    await expect(as(OLA, 'select remove_member($1, $2)', [workspace, KARI])).rejects.toThrow(/not allowed/)
    await expect(as(OUTSIDER, 'select add_member($1, $2)', [workspace, 'ute@example.com'])).rejects.toThrow(/not the owner/)
  })
})

describe('the channel of a workspace', () => {
  /** Whether a user may listen on, and write to, a Realtime topic. */
  const onChannel = async (user: string, topic: string) => {
    await db.query(`select set_config('realtime.topic', $1, false)`, [topic])
    await db.query('delete from realtime.messages')
    await db.query('insert into realtime.messages (topic) values ($1)', [topic])
    const listen = (await as(user, 'select * from realtime.messages')).length === 1
    const write = await as(user, 'insert into realtime.messages (topic) values (realtime.topic())').then(() => true, () => false)
    return { listen, write }
  }

  it('is open to the members of the workspace alone', async () => {
    expect(await onChannel(OLA, `workspace:${workspace}`)).toEqual({ listen: true, write: true })
    expect(await onChannel(OUTSIDER, `workspace:${workspace}`)).toEqual({ listen: false, write: false })
    expect(await onChannel(OLA, 'workspace:something-else')).toEqual({ listen: false, write: false })
  })
})

describe('two browsers through the shared copy', () => {
  const settings = { kind: 'settings' as const, id: 'settings', value: DEFAULT_SETTINGS }
  const row = (id: string) => ({ kind: 'allocation' as const, id, value: { id, order: 0, projectName: 'Byggemessen 2026', projectNo: '26101', refYear: '2026', competence: 'Vegger', phase: 'Montering', basis: 'Planlagt' } })
  const cell = (rowId: string, date: string, fte: number | null) => ({ kind: 'allocCell' as const, id: `${rowId}|${date}`, value: fte === null ? null : { fte } })
  const emptyWorkspace: Workspace = { settings: DEFAULT_SETTINGS, venue: [], projects: [], demand: [], allocations: [], overrides: {}, hiddenVenue: {}, visma: [] }
  const a = browser('a', KARI)
  const b = browser('b', OLA)

  it('sends one browser\'s writes and reads them into the other', async () => {
    await a.act(() => writeRecords([settings, row('r9'), cell('r9', '2026-10-08', 2)]))
    await a.act(() => pushAll(a.copy))
    expect(await a.act(pendingOutbox)).toEqual([])
    const deltas = await b.act(() => pullAll(b.copy))
    expect(deltas.map((d) => `${d.kind} ${d.id}`)).toEqual(expect.arrayContaining(['settings settings', 'allocation r9', 'allocCell r9|2026-10-08']))
    expect((await b.records())!.allocations.find((r) => r.id === 'r9')!.fte).toEqual({ '2026-10-08': 2 })
  })

  it('keeps edits to different days of one row by two planners', async () => {
    await a.act(() => writeRecords([cell('r9', '2026-10-09', 3)]))
    await b.act(() => writeRecords([cell('r9', '2026-10-12', 1)]))
    await a.act(() => pushAll(a.copy))
    await b.act(() => pushAll(b.copy))
    await a.act(() => pullAll(a.copy))
    await b.act(() => pullAll(b.copy))
    const fte = { '2026-10-08': 2, '2026-10-09': 3, '2026-10-12': 1 }
    expect((await a.records())!.allocations.find((r) => r.id === 'r9')!.fte).toEqual(fte)
    expect((await b.records())!.allocations.find((r) => r.id === 'r9')!.fte).toEqual(fte)
  })

  it('leaves a record with a write still waiting as it is, and lets that later write win', async () => {
    await a.act(() => writeRecords([cell('r9', '2026-10-08', 5)]))
    await b.act(() => writeRecords([cell('r9', '2026-10-08', 4)]))
    await b.act(() => pushAll(b.copy))
    // A reads before it has sent: its own day stays.
    await a.act(() => pullAll(a.copy))
    expect((await a.records())!.allocations.find((r) => r.id === 'r9')!.fte['2026-10-08']).toBe(5)
    // Sent, it wins, and A learns that Ola had changed it unseen.
    expect(await a.act(() => pushAll(a.copy))).toEqual([OLA])
    await b.act(() => pullAll(b.copy))
    expect((await b.records())!.allocations.find((r) => r.id === 'r9')!.fte['2026-10-08']).toBe(5)
  })

  it('reads a delete as one', async () => {
    await a.act(() => writeRecords([cell('r9', '2026-10-12', null)]))
    await a.act(() => pushAll(a.copy))
    const deltas = await b.act(() => pullAll(b.copy))
    expect(deltas).toEqual([{ kind: 'allocCell', id: 'r9|2026-10-12', before: { fte: 1 }, after: null, by: KARI }])
  })

  it('reads its own writes back as no change, though the shared copy orders their keys otherwise', async () => {
    // Postgres keeps the keys of jsonb in an order of its own: «name» comes back after «id».
    const person = { kind: 'person' as const, id: 'p1', value: { name: 'Kari Nordmann', id: 'p1', order: 0, competences: ['Vegger'] } }
    await a.act(() => writeRecords([person]))
    await a.act(() => pushAll(a.copy))
    expect(await a.act(() => pullAll(a.copy))).toEqual([])
    expect((await b.act(() => pullAll(b.copy))).map((d) => d.id)).toEqual(['p1'])
    // Read again from the start, as «Hent alt på nytt» does, the same values are no change either.
    expect(await b.act(async () => (await pullAll({ ...b.copy, pull: (_after, limit) => b.copy.pull(0, limit) })).filter((d) => d.id === 'p1'))).toEqual([])
  })

  it('keeps the planners when the shared workspace is emptied or replaced', async () => {
    await a.act(() => notePlanner(KARI, 'kari@example.com'))
    await a.act(emptyShared)
    const sent = await a.act(pendingOutbox)
    expect(sent.some((entry) => entry.kind === 'planner' && entry.value === null)).toBe(false)
    expect(sent.filter((entry) => entry.value === null).map((entry) => entry.kind)).toEqual(expect.arrayContaining(['settings', 'allocation', 'allocCell', 'person']))
    expect([...(await a.act(plannerNames)).values()]).toEqual(['kari@example.com'])
    await a.act(() => saveWorkspace(emptyWorkspace))
    expect([...(await a.act(plannerNames)).values()]).toEqual(['kari@example.com'])
    await a.act(() => pushAll(a.copy))
  })
})

describe('reading in pages', () => {
  const r = (rev: number, batch: string): RemoteRow => ({ kind: 'x', id: String(rev), data: {}, deleted: false, rev, batch_id: batch, updated_by: KARI, updated_at: '' })

  it('holds back the last batch of a full page, which may go on in the next', () => {
    expect(wholeBatches([r(1, 'a'), r(2, 'b'), r(3, 'b')], true).map((row) => row.rev)).toEqual([1])
    expect(wholeBatches([r(1, 'a'), r(2, 'b'), r(3, 'b')], false).map((row) => row.rev)).toEqual([1, 2, 3])
    expect(wholeBatches([r(1, 'a'), r(2, 'a')], true)).toEqual([])
  })
})

describe('an answer of the shared copy', () => {
  it('stops the sync where it said no, and not where the network or a sign-in that ran out is to blame', () => {
    expect(refused({ code: '42501', message: 'not a member of the workspace' })).toBe(true)
    expect(refused({ code: 'PGRST204', message: 'no such column' })).toBe(true)
    expect(refused({ code: 'PGRST301', message: 'JWT expired' })).toBe(false)
    expect(refused(new TypeError('Failed to fetch'))).toBe(false)
    expect(refused({ code: '', message: 'Internal server error' })).toBe(false)
  })
})
