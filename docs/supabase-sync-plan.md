# Supabase sync: a plan

Status: agreed in outline with the user, 2026-10-18 (see «Decisions»). Nothing is built. Read with `src/store/` open.

## End goal

The planner opens the published app on any computer, signs in, and sees the same plan. Several planners can work in it at once and see each other's edits within a few seconds. No edit is lost without a word: where two people change the same thing, the later one wins and the other is told. The app keeps working through a short network outage and catches up afterwards. The data is backed up outside the browser, so a cleared browser or a lost laptop loses nothing.

The first step is a proof of concept on Supabase's free plan. This answers the item «Data that lasts» in `docs/TODO.md`, and the «several planners at once» that Innleid left undesigned.

## Where the app stands

- **Storage.** Dexie (IndexedDB `expo-planner`), `src/store/db.ts`. Ten tables of records with a string key: `venue`, `demand`, `allocations`, `visma` (keyed by `projectNo`), `persons`, `unavailability`, `assignments`, `demandAdjustments`, `suppliers`, `hireOrders`; and `projects` (auto-increment id, always replaced as a whole by `writeProjects`). Plus `meta`, eight singletons stored as one blob each: `settings`, `kpi`, `overrides`, `venueImport`, `hiddenVenue`, `hallRules`, `competenceStyles`, `budgets`.
- **Data flow.** `workspaceStore.tsx` loads the whole `Workspace` into memory once, every mutation replaces it in memory at once (`commit`) and persists the touched records in the background (`track`). One user action is one undo step (`openStep`, closed on the next tick).
- **Undo.** `history.ts`: a `Change` holds per record a `before` and an `after`; `applyChange` and `changeWrites` turn it into the workspace and the writes in either direction. In memory only, 200 steps, gone on reload.
- **Preferences.** `prefs.ts`: localStorage under `expo-planner:`, per browser (grouping, folds, zoom, hall filter, parts open). Not in the workspace or the backup.
- **Backup.** `backup.ts`: the whole `Workspace` as JSON, `format: expo-planner-backup`, `version: 1`. A restore replaces everything and cannot be undone.
- **Ids.** New records get `crypto.randomUUID()` with a prefix (`manual-`, `asg-`, `hire-`, `person-`). Visma lines and Venyou bookings get ids made from the source, so the same line read in twice has the same id. That is what makes record-level sync workable.
- **Hosting.** A static build on GitHub Pages. No server of our own, and none is needed: Supabase is reached from the browser with its public key, guarded by row-level security.

## The shape of the solution

**Dexie stays, as the local copy; Supabase is the shared copy.** The app keeps reading from memory and writing to Dexie exactly as now, so nothing in the grid gets slower and the app works offline. Every write also goes into an outbox table in Dexie; a sync loop sends the outbox to Supabase and pulls in what others wrote. Writing straight to Supabase instead would put a network round trip under every cell typed, lose offline, and break the instant feel of the grid. Not recommended.

```
UI ──commit──▶ memory ──▶ Dexie tables ──▶ outbox ──push──▶ Supabase (Postgres)
                  ▲                                            │
                  └──── apply ◀── pull since cursor ◀──────────┤
                                  realtime nudge  ◀────────────┘
```

### Schema

One generic table rather than a typed table per record kind:

```sql
create table records (
  workspace_id uuid not null references workspaces,
  kind         text not null,          -- 'demand', 'allocations', 'meta', 'allocCell', …
  id           text not null,          -- the record's own id, or the meta key
  data         jsonb,                  -- the record as the domain has it; null when deleted
  deleted      boolean not null default false,
  rev          bigint not null,        -- from a sequence: a global order of writes
  updated_at   timestamptz not null default now(),
  updated_by   uuid not null references auth.users,
  primary key (workspace_id, kind, id)
);
create index on records (workspace_id, rev);

create table workspaces (id uuid primary key, name text not null);
create table workspace_members (workspace_id uuid references workspaces, user_id uuid references auth.users, role text not null default 'planner', primary key (workspace_id, user_id));
```

Why generic: the domain records change shape often, and by convention there are no migrations (the planner starts clean). A jsonb column takes any shape, the sync code is one code path for every kind, and the domain stays the only place that knows the shapes. Typed columns could be added later for reports in SQL, if wanted. `rev` is set by a trigger from a sequence on every insert or update, so a client asks for «everything after rev N» and never misses a write, whatever the clocks of the computers say. Deletes are tombstones (`deleted = true`), so other clients learn of them.

Row-level security: a user reads and writes `records` only of a workspace they are a member of. That is the whole of the access model for a first version.

### What has to change in the local model first

Sync works per record, so a conflict loses at most one record. Today some records are too big for that:

- **`allocations[].fte` and `.notes`.** A planning row holds FTE for every day. Two planners typing in different days of one row would overwrite each other's day. Store each day as a record of its own (`allocCell`, id `rowId|date`), or merge `fte` per day on the server. Per-day records are simpler and match how the grid edits.
- **`meta` blobs.** `overrides` (every Visma line decision), `budgets` (every project) and `hiddenVenue` are maps edited one key at a time; store each key as a record (`override|key`, `budget|projectNo`, `hidden|key`). `kpi` and `hallRules` are edited as a whole by one planner at a time in practice; keep them whole for now, with a conflict notice, and split them if that bites.
- **`projects`.** Give each row a stable id (its name and year), and write the rows that changed instead of replacing the table.
- **One write path.** `changeWrites` already turns a step into puts and deletes per kind; make every mutation, not only undo, go through that one shape (`RecordWrite[]`). Then the outbox, Dexie and the server all take the same list. This is pure refactoring and can be tested without Supabase.

### Sync

- **Push.** The outbox holds `{kind, id, data | deleted, baseRev}` per write, in order. The loop sends a batch through one Postgres function (`push_records`) that writes them in a transaction and returns their new `rev`s. On a network error it retries with backoff; the save indicator («Lagret», «Lagrer», «Feil») gains «Frakoblet».
- **Pull.** On start and whenever told, the client asks for `records where rev > cursor`, applies them to Dexie and memory, and moves the cursor. A first load of a workspace pulls everything.
- **Realtime.** Supabase Realtime on `records` for the workspace is only a nudge to pull; the pull is what is trusted, so a dropped message costs nothing but a few seconds.
- **Applying a remote write** replaces the record in memory through the same path an undo uses (`applyChange` with a change made from the remote records), so the grid draws it as it draws an undo. A remote write to a record that has a write of our own still in the outbox is held until ours is answered.

### Conflicts with several planners

- **Rule: last write wins per record**, ordered by the server (`rev`), not by the clocks. With per-day cells and per-key overrides, the cases left are two people changing the same cell, the same decision or the same person's day at once.
- **Detected, not silent.** Each push carries the `rev` the client last saw for the record (`baseRev`). If the server's is newer, someone else changed it in between; the write still wins, but the other planner gets a toast: «Kari endret samme celle samtidig». A stricter rule, refusing the write, is possible per kind if the planner wants it for, say, hire orders.
- **Imports.** A Venyou export replaces the bookings in its period and a Visma export the lines of its projects. Two planners importing the same file give the same ids and the same data, so it is harmless. Two planners importing different exports at once is the later one's result, as today on one computer.
- **Derived data.** Some edits follow others in the same step (a renamed competence reaches the rows, the people and their blocks; a renumbered project takes its rows along). These are written as one batch and arrive at others as one batch, so no one sees half of it.
- **Presence (optional, phase 4).** Realtime presence shows who else is in the workspace, and perhaps which project they are on, which avoids most conflicts before they happen.

### Undo

Undo stays local and per planner: it undoes my own steps, never another's. An undo is a new write like any other. If a record in the step has been changed by someone else since, that record is left as it is and the planner is told («1 endring ble ikke angret: endret av Kari»). The history still dies with the page; keeping it across reloads is possible later from the outbox, but not needed.

### Auth

Supabase Auth with Microsoft sign-in (the Azure provider). The company uses Microsoft, but it is not settled that a company account may be used, so the proof of concept signs in with a **private Microsoft account**: an app registration in Azure (free with a personal account) that accepts personal Microsoft accounts, given to Supabase as the Azure provider. Moving to the company's own tenant later is a change of settings in Azure and Supabase, not of the app. A sign-in link by e-mail is kept as the fallback, since it needs no Azure at all, and the two can be on together.

Membership of the one workspace is added by hand in the Supabase dashboard; there is no invite screen in the proof of concept. The app without sign-in stays as it is today (local only), so nothing breaks for someone who never signs in.

### Preferences

They stay per browser in localStorage. A few may be worth carrying per user later (the ticked halls under «Steder», the grouping), as a `prefs` row per user; not in the first phases.

### Moving the data in

The planner starts clean anyway, so the simplest path is enough: on the first sign-in to an empty workspace, the app offers «Last opp data fra denne nettleseren», which writes every record of the local workspace in batches. If the workspace already has data, the local data is kept aside as a backup file and the shared data is loaded. The backup JSON stays as the format for a copy to keep; a restore into a shared workspace becomes «replace the workspace for everyone», behind a clear warning, and is written as one batch.

### Backups

The proof of concept runs on Supabase's free plan, which has no backups of its own and pauses a project after a week without use (it is woken again from the dashboard; the data is kept). So the backup JSON stays the real backup: the app should remind the planner to take one, or write one by itself now and then, and a paused project is shown in the app as «Skyen er satt på pause» rather than as an error. A move to Pro, with daily backups, belongs with putting real data in.

### Data protection

The workspace holds customer and booking data, and staff absence including sickness, which is health data under GDPR. Until whoever owns data protection at the company has said yes, the proof of concept holds **invented test data only**, never data from the real files. The Supabase project is made in an EU region (Stockholm or Frankfurt) so that nothing has to move later. Real data waits on that answer, and so does Pro.

## Phasing

Each phase is usable on its own and can stop there.

Phases 1 and 2 come before the first version; 3 and 4 after it.

1. **One write path (no Supabase).** Every mutation produces a list of record writes; split `fte`/`notes` into per-day records, `overrides`, `budgets` and `hiddenVenue` into per-key records; stable ids on projects. Tests on the domain and the store. Nothing visible changes.
2. **Cloud copy for one planner (the proof of concept).** Supabase free project in an EU region, Microsoft sign-in with a private account, the schema, sign-in, RLS; the outbox, push and pull, without realtime. One planner on two computers has the same plan, and the data is off the browser. This alone settles «Data that lasts», once real data may go in.
3. **Live, several planners.** Realtime nudges, remote writes applied in the grid, `baseRev` conflict notices, undo of own steps only, «Frakoblet» in the save indicator.
4. **Comfort.** Presence, who changed what and when (the `updated_by` and `updated_at` are already stored; Innleid asked for it on answers), an invite screen, preferences per user, a scheduled JSON export.

## Alternatives weighed

- **Dexie Cloud** (not chosen). The makers of Dexie sell a sync service that plugs into the existing Dexie database, with auth, access control and offline sync done; it would replace most of phases 2 and 3 with configuration. It is a smaller vendor with its own pricing, and the data then lives on their servers rather than in a Postgres the company controls. The user chose Supabase, where he already has an account.
- **A sync engine over Supabase** (PowerSync, ElectricSQL). More machinery than this app needs for a handful of planners.
- **Supabase direct, no Dexie.** Simpler code, but every edit waits on the network and there is no offline. Not recommended for the grid.

## Decisions

Made by the user, 2026-10-18:

1. **Supabase**, on the account he already has.
2. **One shared workspace**, opened and used on several computers.
3. **Microsoft sign-in, with a private Microsoft account** for now, since it is not settled that the company account may be used. E-mail link as the fallback.
4. **Data protection is a real question.** Test data only in the cloud until it is answered.
5. **Free plan** for the proof of concept; Pro when real data goes in.
6. **Last write wins** per cell or record, with a notice to the other planner.
7. **Offline** is kept.
8. **Phases 1 and 2 before the first version**, 3 and 4 after.

Settled since:

- The questions of data protection and of the company's Microsoft tenant stay with the user; they are not part of this plan, and do not block phases 1 and 2.
- The test data of the proof of concept is **invented**, never taken from the real files.
