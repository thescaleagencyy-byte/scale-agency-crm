-- 036_multi_workspace.sql
-- Adds account_memberships table so a user can belong to multiple workspaces
-- and switch between them by updating profiles.account_id.

create table if not exists account_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  role account_role_enum not null default 'owner',
  created_at timestamptz not null default now(),
  unique(user_id, account_id)
);

create index if not exists idx_account_memberships_user on account_memberships(user_id);
create index if not exists idx_account_memberships_account on account_memberships(account_id);

alter table account_memberships enable row level security;

drop policy if exists "users see own memberships" on account_memberships;
create policy "users see own memberships" on account_memberships for select
  using (user_id = auth.uid());

-- Backfill: every existing user gets a membership for their current account.
insert into account_memberships(user_id, account_id, role)
select p.user_id, p.account_id, coalesce(p.account_role, 'owner')
from profiles p
where p.account_id is not null
on conflict (user_id, account_id) do nothing;

-- RPC: create a new workspace and add caller as owner.
create or replace function create_workspace(workspace_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  insert into accounts(name) values (workspace_name) returning id into new_id;
  insert into account_memberships(user_id, account_id, role) values (auth.uid(), new_id, 'owner');
  return new_id;
end;
$$;

grant execute on function create_workspace(text) to authenticated;

-- RPC: switch active workspace (validates membership first).
create or replace function switch_workspace(target_account_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  member_role account_role_enum;
begin
  select role into member_role
  from account_memberships
  where user_id = auth.uid() and account_id = target_account_id;

  if member_role is null then
    raise exception 'Not a member of this workspace';
  end if;

  update profiles
  set account_id = target_account_id, account_role = member_role
  where user_id = auth.uid();
end;
$$;

grant execute on function switch_workspace(uuid) to authenticated;
