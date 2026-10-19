# Supabase sync: a plan

Status: agreed in outline with the user, 2026-10-18 (see «Decisions»), and revised the same day after a review against the code. Nothing is built. Read with `src/store/` open.

## End goal

The planner opens the published app on any computer, signs in, and sees the same plan. Several planners can work in it at once and see each other's edits within a few seconds. No edit is lost without a word: where two people change the same thing, the later one wins and the other is told. The app keeps working through a short network outage and catches up afterwards. The data is backed up outside the browser, so a cleared browser or a lost laptop loses nothing.

The first step is a proof of concept on Supabase's free plan. This answers the item «Data that lasts» in `docs/TODO.md`, and the «several planners at once» that Innleid left undesigned.

## Where the app stands

- **Storage.** Dexie (IndexedDB `expo-planner`), `src/store/db.ts`. Ten tables of records with a string key: `venue`, `demand`, `allocations`, `visma` (keyed by `projectNo`), `persons`, `unavailability`, `assignments`, `demandAdjustments`, `suppliers`, `hireOrders`; and `projects` (auto-increment id, always replaced as a whole by `writeProjects`). Plus `meta`, eight singletons stored as one blob each: `settings`, `kpi`, `overrides`, `venueImport`, `hiddenVenue`, `hallRules`, `competenceStyles`, `budgets`.
- **Data flow.** `workspaceStore.tsx` loads the whole `Workspace` into memory once, every mutation replaces it in memory at once (`commit`) and persists the touched records in the background (`track`). One user action is one undo step (`openStep`, closed on the next tick).
- **Undo.** `history.ts`: a `Change` holds per record a `before` and an `after`; `applyChange` and `changeWrites` turn it into the workspace and the writes in either direction. In memory only, 200 steps, gone on reload.
- **Preferences.** `prefs.ts`: localStorage under `expo-planner:`, per browser (grouping, folds, zoom, hall filter, parts open). Not in the workspace or the backup.
- **Backup.** `backup.ts`: the whole `Workspace` as JSON, `format: expo-planner-backup`, `version: 1`. A restore replaces everything and cannot be undone.
- **Ids.** New records get `crypto.randomUUID()` with a prefix (`manual-`, `asg-`, `hire-`, `person-`). Visma lines get ids made from the source (`visma-` and the line's key), so the same line read in twice has the same id. Venyou bookings do not: `importVenue` names them `venyou-<importedAt>-<index>`, and `writeVenue` clears the table and writes it again, so every import replaces every booking under new ids. Phase 1 changes that (below).
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
create table workspaces (
  id   uuid primary key,
  name text not null,
  rev  bigint not null default 0       -- the last rev handed out in this workspace
);
create table workspace_members (workspace_id uuid references workspaces, user_id uuid references auth.users, role text not null default 'planner', primary key (workspace_id, user_id));

create table records (
  workspace_id uuid not null references workspaces,
  kind         text not null,          -- 'demand', 'allocations', 'allocCell', 'override', …
  id           text not null,          -- the record's own id, or the key within its kind
  data         jsonb,                  -- the record as the domain has it; null when deleted
  deleted      boolean not null default false,
  rev          bigint not null,        -- from workspaces.rev: the order of writes in the workspace
  batch_id     uuid not null,          -- the push it came in; one user action is one batch
  updated_at   timestamptz not null default now(),
  updated_by   uuid not null default auth.uid() references auth.users,
  primary key (workspace_id, kind, id)
);
create index on records (workspace_id, rev);
```

Why generic: the domain records change shape often, and by convention there are no migrations (the planner starts clean). A jsonb column takes any shape, the sync code is one code path for every kind, and the domain stays the only place that knows the shapes. Typed columns could be added later for reports in SQL, if wanted. Deletes are tombstones (`deleted = true`), so other clients learn of them.

**Where `rev` comes from.** Not from a sequence: sequence numbers are handed out when a row is written but become visible when its transaction commits, which can be in another order. A client that has pulled up to 501 while 499 was still uncommitted would never fetch 499. Instead `push_records` takes the revs of a batch from the workspace's own counter (`update workspaces set rev = rev + n where id = … returning rev`). The row lock makes pushes to one workspace commit one after another, so the revs become visible in order. For a handful of planners that wait is nothing.

**Access.** Row-level security lets a member of a workspace read its `records`, and nobody insert, update or delete them directly: every write goes through `push_records`, a `security definer` function that checks membership with `auth.uid()`, sets `rev`, `batch_id`, `updated_at` and `updated_by` itself, and never takes them from the client. Otherwise a client could write past the counter, or in another planner's name. That is the whole of the access model for a first version.

### What has to change in the local model first

Sync works per record, so a conflict loses at most one record. Today some records are too big for that, some ids are not stable, and some stored data is worked out from other data. The rule for all of it: **what is synced is what a planner or a source decided; what can be worked out again is worked out on each computer.**

**Granularity: one record per thing a planner edits.**

- **`allocations[].fte` and `.notes`.** A planning row holds FTE for every day. Two planners typing in different days of one row would overwrite each other's day. Each day becomes a record of its own at the sync boundary (`allocCell`, id `rowId|date`, holding the FTE and the note); the row record keeps the rest. In memory and in the backup, `AllocationRow` keeps its `fte` and `notes` maps as now: the sync layer splits a row into its cells on the way out (by comparing the row before and after) and joins them on the way in. The domain, the grid and the backup format do not change.
- **Maps in `meta`.** `overrides` (every Visma line decision), `budgets` (every project), `hiddenVenue` and `competenceStyles` are maps edited one key at a time; each key becomes a record (`override|key`, `budget|projectNo`, `hidden|key`, `competenceStyle|key`).
- **Parts of `hallRules` and `kpi` that are edited from Behov.** `hallRules.choices` is written by `setHallChoice`, which Behov calls from the Visma review, «Avklar» and the placing panel, and `kpi.byText` by «Avklar». That is everyday review work, not setup done by one planner at a time, so each choice and each text rule becomes a record (`hallChoice|` and its `choiceKey`, `kpiText|text`), as does each of `kpi.excludedArticles` (`kpiExcluded|articleNo`). As with the cells, they are split at the sync boundary; `HallRules` and `KpiConfig` keep their shape in memory. The rest of `hallRules` (places, word rules, areas) and of `kpi` (the product types) stays one record each, with a conflict notice, until that bites.
- **`settings`.** Stays one record. Two planners changing different settings at the same moment lose one of the two; settings change rarely enough that this is accepted, and the notice says so.

**Stable ids.**

- **Venyou bookings.** The id comes from the booking itself: `venyou-` and `venueKey` (hall, event name and anchor date), which the hidden bookings are already keyed by. The ids are used for nothing else today but React keys (`Haller.tsx`). An import then writes only what it changes, from `diffVenue`: the added and changed bookings, and tombstones for the removed. The same file read in twice, on one computer or two, writes nothing the second time. Where two bookings in one export have the same key, the second gets `|2`.
- **`projects`.** Each row's id is `name|projectNo`: a row per name a project goes by, and the same name comes back every year under a new number, so the name alone, or the name and the optional `year`, is not unique. A renamed or renumbered row is a delete and a put. The rows that changed are written, not the whole table.

**Derived data is not synced.**

- **Visma demand lines** are worked out from the Visma exports, the KPI table and the overrides (`vismaDemandLines`). If they were synced, a planner changing the KPI while another sets an override would leave, by last write wins per line, that project's lines worked out from the old KPI: nothing lost, but wrong. So the `visma`, `kpi` and override records are synced, and each computer works out the Visma lines itself after a pull, as `withVismaLines` does after a local edit. They stay in Dexie as a cache, outside the outbox. Only the planner's own demand lines (`manual-`) are synced as records. This also keeps a KPI change from pushing hundreds of lines.
- Where an edit changes other records as a consequence (a renamed competence reaches the rows, the people and their blocks; a renumbered project takes its rows along), those are real edits and are synced, in the same batch.

**Rows that are deleted, and the order of rows.**

- Deleting a planning row writes tombstones for its cells too. A cell whose row is not there (another planner typed in it while the row was deleted) is ignored on load and in the grid.
- New rows, people and suppliers get `max(order) + 1`; two planners adding at once get the same number. Ties are broken by id wherever rows are sorted, so every computer shows the same order, and the next move by hand gives them their own.

**Undo per record.** `Change` in `history.ts` holds `overrides`, `budgets`, `hiddenVenue`, `hallRules`, `projects`, `venue` and `competenceStyles` as whole values before and after. With other planners writing, undoing one override would put back the whole map as it was and wipe their keys in between. So `Change` gets the same granularity as the sync: a map of records per kind, with a `before` and an `after` each (`Map<string, Delta<…>>`, as `allocations` and `demand` already have). That is what lets undo leave a record alone that someone else has changed since.

**One write path.** Every mutation, undo and redo included, produces one list of record writes (`RecordWrite[]`: kind, id, the record or a delete), and one function `applyWrites` writes it to the Dexie tables, and later to the outbox, in **one** Dexie transaction. Today they are split: `rowWrites` writes a planning row a tick later, and the undo path chains `writeVenue`, hall rules, projects and budgets as separate transactions. With an outbox, a closed tab between two of them would leave the tables and the outbox telling different stories. `writeQueue` stays, but gathers `RecordWrite`s rather than rows.

All of this is refactoring with nothing visible to the planner, and can be tested without Supabase.

### Sync

- **Local sync state.** A Dexie table `sync` holds the workspace's cursor (the highest `rev` applied) and, per record, the `rev` it was last seen at. The outbox is a Dexie table too, written by `applyWrites` in the same transaction as the records it holds.
- **Push.** The outbox holds `{batchId, kind, id, data | deleted, baseRev}` per write, in order; one user action is one batch. The loop sends whole batches through one Postgres function (`push_records`) that writes them in a transaction, takes their revs from the workspace's counter and returns them; the client then stores them as the records' last-seen revs and empties those entries. On a network error it retries with backoff; the save indicator («Lagret», «Lagrer», «Feil») gains «Frakoblet».
- **Pull.** On start and whenever told, the client asks for `records where rev > cursor order by rev`, in pages. A page can end in the middle of a batch, so the client applies only whole batches: it holds back the records of the last batch of a page until the next page, or an empty one, shows the batch is complete. It applies them to Dexie and memory, works out the Visma lines of any project whose `visma`, `kpi` or overrides came in, and moves the cursor. A first load of a workspace pulls everything.
- **Realtime.** Supabase Realtime on `records` for the workspace is only a nudge to pull; the pull is what is trusted, so a dropped message costs nothing but a few seconds.
- **Applying a remote write** replaces the record in memory through the same path an undo uses (`applyChange` with a change made from the remote records), so the grid draws it as it draws an undo. A remote write to a record that has a write of our own still in the outbox is held until ours is answered. A remote write never goes on the undo stack and is never merged into the open step. While a stroke, a drag or a pull of a span's end is being drawn, remote writes wait until it is let go, so the preview is not drawn from data that changed under it.

### Conflicts with several planners

- **Rule: last write wins per record**, ordered by the server (`rev`), not by the clocks. With per-day cells and per-key overrides, the cases left are two people changing the same cell, the same decision or the same person's day at once.
- **Detected, not silent.** Each push carries the `rev` the client last saw for the record (`baseRev`). If the server's is newer, someone else changed it in between; the write still wins, but the other planner gets a toast: «Kari endret samme celle samtidig». A stricter rule, refusing the write, is possible per kind if the planner wants it for, say, hire orders.
- **Imports.** A Venyou export replaces the bookings in its period and a Visma export the exports of its projects. With the ids of phase 1, two planners importing the same file give the same ids and the same data, so the second writes nothing. Two planners importing different exports at once is the later one's result, as today on one computer.
- **Derived data.** Some edits follow others in the same step (a renamed competence reaches the rows, the people and their blocks; a renumbered project takes its rows along). These are written as one batch and applied by others as one batch (see Pull), so no one sees half of it.
- **Presence (optional, phase 4).** Realtime presence shows who else is in the workspace, and perhaps which project they are on, which avoids most conflicts before they happen.

### Undo

Undo stays local and per planner: it undoes my own steps, never another's. An undo is a new write like any other. If a record in the step has been changed by someone else since, that record is left as it is and the planner is told («1 endring ble ikke angret: endret av Kari»). The history still dies with the page; keeping it across reloads is possible later from the outbox, but not needed.

### Auth

Supabase Auth with Microsoft sign-in (the Azure provider). The company uses Microsoft, but it is not settled that a company account may be used, so the proof of concept signs in with a **private Microsoft account**: an app registration in Azure (free with a personal account) that accepts personal Microsoft accounts, given to Supabase as the Azure provider. Moving to the company's own tenant later is a change of settings in Azure and Supabase, not of the app. A sign-in link by e-mail is kept as the fallback, since it needs no Azure at all, and the two can be on together.

To check before it is built: Supabase needs an e-mail from the provider, and a personal Microsoft account gives one only when the app registration asks for it (the `email` claim, the `consumers` or `common` tenant). The sign-in returns to the page it came from, so the published address on GitHub Pages and `localhost` both go into Supabase's list of redirect URLs.

Membership of the one workspace is added by hand in the Supabase dashboard; there is no invite screen in the proof of concept. The app without sign-in stays as it is today (local only), so nothing breaks for someone who never signs in.

### The local copy and the shared one

- **One Dexie database per workspace.** Local mode keeps `expo-planner` as now. A shared workspace gets its own database, `expo-planner-<workspaceId>`, holding its records, the outbox and the sync state. Signing in and out switches between them, so the local data and the shared copy are never mixed in one database, and the data of one cannot leak into the other's outbox.
- **Signing out** keeps the shared copy in the browser, so the planner can sign in again and work offline, unless «Logg ut og fjern data fra denne nettleseren» is chosen, for a computer that is not one's own. Writes still in the outbox are pushed first, or the planner is told they will be lost.
- **«Slett alt og start på nytt»** in a shared workspace clears this browser's copy and pulls the workspace again: it touches no one else. Emptying the shared workspace for everyone is an action of its own under Innstillinger, behind a warning that names it, written as one batch of tombstones. The planner's way of testing from a clean state then means: empty the shared workspace, then read the sources in.

### Preferences

They stay per browser in localStorage. A few may be worth carrying per user later (the ticked halls under «Steder», the grouping), as a `prefs` row per user; not in the first phases.

### Moving the data in

The planner starts clean anyway, so the simplest path is enough: on the first sign-in to an empty workspace, the app offers «Last opp data fra denne nettleseren», which writes every record of the local workspace in batches. If the workspace already has data, the local data is kept aside as a backup file and the shared data is loaded. The backup JSON stays as the format for a copy to keep; a restore into a shared workspace becomes «replace the workspace for everyone», behind a clear warning, and is written as one batch.

### Backups

The proof of concept runs on Supabase's free plan, which has no backups of its own and pauses a project after a week without use (it is woken again from the dashboard; the data is kept). So the backup JSON stays the real backup: the app should remind the planner to take one, or write one by itself now and then, and a paused project is shown in the app as «Skyen er satt på pause» rather than as an error. A move to Pro, with daily backups, belongs with putting real data in.

### Data protection

The proof of concept holds **invented data only**: the season of `src/demo/demoData.ts`, which all testing uses from 2026-10-19 on, since the app has already been checked against the real files. Its staff are made up, its suppliers have no contact, it has no customer or order number, and the planner is the only user, on his private account. Real data, of any kind, waits for the company's answer on data protection. The Supabase project is made in an EU region (Stockholm or Frankfurt) so that nothing has to move later. Pro, with its backups, comes with real data (decision 5).

What the workspace holds is cut down before that question is asked, so that the answer is easier (decided 2026-10-19):

- **No customer and no order number from Visma.** The calculation needs neither. `customer` (the column «navn») is read into `VismaRow` and used nowhere in the app; `orderNo` is only shown on the sample cards of «Avklar». Both stop being read in `import/vismaExport.ts`, so they are not stored at all, locally or in the cloud. What a line keeps is booking information: project number and event name, Avdeling, article number and text (the articles are public in the web shop), quantity, product group and type, and the stand or Hall/Sted text. Checked against the export of 2026-09-21 (784 lines, 112 customers): «Avdeling» holds three two-digit department codes, never a customer; no event name, article text, stand or free-text place («Trans.opplysn. 1», 20 lines) holds a customer's name. The free-text place is typed by hand and should be looked at again in a new export before real data goes in.
- **No reason for absence.** The plan needs two states for a person's day, there or away; why someone is away belongs in HR. `Unavailability.kind` (syk, ferie, kurs, annet) and its free-text `note` are removed, so no health data is stored, locally or in the cloud. What this changes in Bemanning: the reason badge becomes one «Borte»; the sickness shortcuts in the cell menu («Syk», «Friskmeld fra», R35) become «Borte» and «Tilbake fra»; a day away shows its blocks that are still open («uløst») whatever the reason, as a sick day does today. The hours count as now, since every absence already gives a person's hours back to the demand.

What is left that is personal data: the permanent staff by name with their competences, hours and the days they are away; supplier contacts, where the contact is a person; and the planners' own accounts. That still needs the company's yes and Supabase's data processing agreement, but no longer covers health data.

## Phasing

Each phase is usable on its own and can stop there.

Phases 1 and 2 come before the first version; 3 and 4 after it.

1. **One write path (no Supabase).** Everything under «What has to change in the local model first»: every mutation produces a list of record writes, applied with the outbox's place ready in one transaction; `Change` per record; the split into cells and keys at the sync boundary; ids from the source for Venyou bookings and `name|projectNo` for projects; Visma lines kept out of what is synced; tombstones for a deleted row's cells and ties in `order` broken by id; no customer or order number read from Visma, and no reason or note on absence. Tests on the domain and the store. Nothing visible changes. **Built 2026-10-19** (`src/store/records.ts`): the workspace is read and written as records of the kinds above, and the browser stores them in one Dexie table keyed by kind and id, the shape of the shared table, rather than a table per kind. Every mutation hands the store the next workspace; the records that differ are the undo step and the writes, in one transaction per event. Visible changes: no customer, order number or reason for absence.
2. **Cloud copy for one planner (the proof of concept).** On the invented season (see «Data protection»). Supabase free project in an EU region, Microsoft sign-in with a private account, the schema with the workspace counter, sign-in, RLS with writes through `push_records` only; a database per workspace, the outbox, push and pull in whole batches, without realtime; signing out and «Slett alt» as above. One planner on two computers has the same plan, and the data is off the browser. This alone settles «Data that lasts», once the real data is in it.
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
- The proof of concept runs on **invented** data, never data taken from the real files.
- **Less to protect** (2026-10-19): Visma's customer and order number are not read, and absence is stored without a reason, only there or away. See «Data protection».
- **Invented data for all testing** (2026-10-19), the proof of concept included: the app has been checked against the real files, and the invented season of `src/demo/demoData.ts` is what is tested on from now on.
