-- Fix create_workspace: accounts.owner_user_id is NOT NULL, must pass auth.uid().
create or replace function create_workspace(workspace_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  insert into accounts(name, owner_user_id)
  values (workspace_name, auth.uid())
  returning id into new_id;

  insert into account_memberships(user_id, account_id, role)
  values (auth.uid(), new_id, 'owner');

  return new_id;
end;
$$;

grant execute on function create_workspace(text) to authenticated;
