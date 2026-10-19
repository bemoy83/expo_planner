-- The shared copy of the workspace (docs/supabase-sync-plan.md). Run once in the SQL editor of the Supabase project.
-- The browser keeps its own copy and sends its writes here through push_records; it reads with a plain select.

create table workspaces (
  id   uuid primary key default gen_random_uuid(),
  name text not null,
  -- The last rev handed out in this workspace. push_records takes the next ones from it under a row lock, so the
  -- revs of a workspace become visible in the order they are given: a client that has pulled up to N never misses one below.
  rev  bigint not null default 0
);

create table workspace_members (
  workspace_id uuid not null references workspaces on delete cascade,
  user_id      uuid not null references auth.users on delete cascade,
  role         text not null default 'planner',
  primary key (workspace_id, user_id)
);

-- One record per thing a planner edits, as src/store/records.ts makes them. A deleted record stays as a tombstone, so
-- that other clients learn of the delete.
create table records (
  workspace_id uuid not null references workspaces on delete cascade,
  kind         text not null,
  id           text not null,
  data         jsonb,
  deleted      boolean not null default false,
  rev          bigint not null,
  batch_id     uuid not null,
  updated_at   timestamptz not null default now(),
  updated_by   uuid not null references auth.users,
  primary key (workspace_id, kind, id)
);
create index records_by_rev on records (workspace_id, rev);

alter table workspaces enable row level security;
alter table workspace_members enable row level security;
alter table records enable row level security;

-- Members read their workspaces, their own membership and the records. Nobody writes the tables directly: records
-- are written by push_records alone, and memberships are added by hand in the dashboard.
create function is_member(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from workspace_members where workspace_id = ws and user_id = auth.uid())
$$;

create policy "members read their workspaces" on workspaces for select using (is_member(id));
create policy "members see their own membership" on workspace_members for select using (user_id = auth.uid());
create policy "members read the records" on records for select using (is_member(workspace_id));

-- Writes one batch (one user action) in a transaction. Each element of p_records is
-- {"kind": …, "id": …, "data": … or null, "base_rev": the rev the client last saw, or null}.
-- Returns, per record, its new rev, and the rev and writer it had where that was newer than the client's base_rev:
-- the write still wins (last write wins), but the client can tell the planner someone else changed it in between.
create function push_records(p_workspace uuid, p_batch uuid, p_records jsonb)
returns table (kind text, id text, rev bigint, overwritten_rev bigint, overwritten_by uuid)
language plpgsql security definer set search_path = public as $$
-- The names of the returned columns are those of the table's; in the queries below they mean the columns.
#variable_conflict use_column
declare
  first_rev bigint;
  n int := jsonb_array_length(p_records);
begin
  if auth.uid() is null or not is_member(p_workspace) then
    raise exception 'not a member of the workspace' using errcode = '42501';
  end if;
  -- The row lock orders the pushes to one workspace, so their revs commit in order.
  update workspaces w set rev = w.rev + n where w.id = p_workspace returning w.rev - n + 1 into first_rev;

  return query
  with incoming as (
    select r.value ->> 'kind' as kind, r.value ->> 'id' as id, r.value -> 'data' as data,
           (r.value ->> 'base_rev')::bigint as base_rev, first_rev + r.ordinality - 1 as rev
    from jsonb_array_elements(p_records) with ordinality as r(value, ordinality)
  ),
  before as (
    select rec.kind, rec.id, rec.rev, rec.updated_by
    from records rec join incoming i on rec.workspace_id = p_workspace and rec.kind = i.kind and rec.id = i.id
  ),
  written as (
    insert into records as rec (workspace_id, kind, id, data, deleted, rev, batch_id, updated_at, updated_by)
    select p_workspace, i.kind, i.id, case when jsonb_typeof(i.data) = 'null' then null else i.data end,
           i.data is null or jsonb_typeof(i.data) = 'null', i.rev, p_batch, now(), auth.uid()
    from incoming i
    on conflict (workspace_id, kind, id) do update
      set data = excluded.data, deleted = excluded.deleted, rev = excluded.rev, batch_id = excluded.batch_id,
          updated_at = excluded.updated_at, updated_by = excluded.updated_by
    returning rec.kind, rec.id, rec.rev
  )
  select w.kind, w.id, w.rev,
         case when b.rev > coalesce(i.base_rev, 0) then b.rev end,
         case when b.rev > coalesce(i.base_rev, 0) and b.updated_by <> auth.uid() then b.updated_by end
  from written w
  join incoming i on i.kind = w.kind and i.id = w.id
  left join before b on b.kind = w.kind and b.id = w.id;
end;
$$;

revoke all on function push_records(uuid, uuid, jsonb) from public, anon;
grant execute on function push_records(uuid, uuid, jsonb) to authenticated;
revoke all on function is_member(uuid) from public, anon;
grant execute on function is_member(uuid) to authenticated;

-- The one workspace of the proof of concept. After the planner has signed in once, add the membership by hand:
--   insert into workspace_members (workspace_id, user_id)
--   select w.id, u.id from workspaces w, auth.users u where w.name = 'Expo Planner' and u.email = '<the planner''s e-mail>';
insert into workspaces (name) values ('Expo Planner');
