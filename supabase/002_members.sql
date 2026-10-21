-- Members of a workspace, managed from the app («Skyen» under ⚙). Run once in the SQL editor, after schema.sql.
-- A planner can be added once they have signed in to the app: before that, there is no user to add.

-- The members of a workspace, with their e-mails, for its members.
create function list_members(p_workspace uuid)
returns table (user_id uuid, email text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_member(p_workspace) then
    raise exception 'not a member of the workspace' using errcode = '42501';
  end if;
  return query
  select m.user_id, u.email::text from workspace_members m join auth.users u on u.id = m.user_id
  where m.workspace_id = p_workspace order by u.email;
end;
$$;

-- Adds a planner by the e-mail they signed in with: 'added', 'already' or 'not-signed-in'.
create function add_member(p_workspace uuid, p_email text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  uid uuid;
begin
  if not is_member(p_workspace) then
    raise exception 'not a member of the workspace' using errcode = '42501';
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

-- Takes a planner out of a workspace; not oneself, so a workspace always keeps the one who manages it.
create function remove_member(p_workspace uuid, p_user uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_member(p_workspace) or p_user = auth.uid() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  delete from workspace_members where workspace_id = p_workspace and user_id = p_user;
end;
$$;

revoke all on function list_members(uuid), add_member(uuid, text), remove_member(uuid, uuid) from public, anon;
grant execute on function list_members(uuid), add_member(uuid, text), remove_member(uuid, uuid) to authenticated;
