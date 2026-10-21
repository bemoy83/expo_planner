-- Only the owner of a workspace manages its members, and its Realtime channel is open to its members alone.
-- Run once in the SQL editor, after 002_members.sql. Then, in the dashboard:
--   Realtime › Settings: turn off «Allow public access», so that only private channels are used.
--   Authentication › Sign In / Providers › Email: turn off «Allow new users to sign up». A new planner is then made
--   under Authentication › Users › «Invite user», and added in the app afterwards.
-- And make yourself the owner:
--   update workspace_members set role = 'owner'
--   where user_id = (select id from auth.users where email = '<your e-mail>');

create function is_owner(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from workspace_members where workspace_id = ws and user_id = auth.uid() and role = 'owner')
$$;

revoke all on function is_owner(uuid) from public, anon;
grant execute on function is_owner(uuid) to authenticated;

-- The members, with their e-mails and whether they own the workspace, for its members.
drop function list_members(uuid);
create function list_members(p_workspace uuid)
returns table (user_id uuid, email text, owner boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_member(p_workspace) then
    raise exception 'not a member of the workspace' using errcode = '42501';
  end if;
  return query
  select m.user_id, u.email::text, m.role = 'owner' from workspace_members m join auth.users u on u.id = m.user_id
  where m.workspace_id = p_workspace order by u.email;
end;
$$;

-- Adds a planner by the e-mail of their user: 'added', 'already' or 'not-signed-in'. The owner alone.
create or replace function add_member(p_workspace uuid, p_email text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  uid uuid;
begin
  if not is_owner(p_workspace) then
    raise exception 'not the owner of the workspace' using errcode = '42501';
  end if;
  select u.id into uid from auth.users u where lower(u.email) = lower(trim(p_email));
  if uid is null then
    return 'not-signed-in';
  end if;
  if exists (select 1 from workspace_members where workspace_id = p_workspace and user_id = uid) then
    return 'already';
  end if;
  insert into workspace_members (workspace_id, user_id) values (p_workspace, uid);
  return 'added';
end;
$$;

-- Takes a planner out of a workspace. The owner alone, and not themself, so a workspace always keeps its owner.
create or replace function remove_member(p_workspace uuid, p_user uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_owner(p_workspace) or p_user = auth.uid() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  delete from workspace_members where workspace_id = p_workspace and user_id = p_user;
end;
$$;

revoke all on function list_members(uuid) from public, anon;
grant execute on function list_members(uuid) to authenticated;

-- The private channel of a workspace, `workspace:<id>` (liveChannel in src/sync/client.ts): its members alone may
-- listen, see who is there and say they wrote.
create function channel_workspace(topic text) returns uuid
language sql immutable as $$
  select case when topic ~ '^workspace:[0-9a-f-]{36}$' then substring(topic from 11)::uuid end
$$;

create policy "members listen on the channel of their workspace" on realtime.messages
  for select to authenticated using (is_member(channel_workspace(realtime.topic())));
create policy "members write on the channel of their workspace" on realtime.messages
  for insert to authenticated with check (is_member(channel_workspace(realtime.topic())));
