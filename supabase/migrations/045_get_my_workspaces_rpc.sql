-- SECURITY DEFINER RPC so the workspaces panel can read ALL accounts
-- the caller belongs to, bypassing accounts RLS (which only allows
-- access to the currently active account via profiles.account_id).
create or replace function get_my_workspaces()
returns table (
  account_id  uuid,
  role        account_role_enum,
  account_name text
)
language sql
security definer
stable
set search_path = public
as $$
  select
    am.account_id,
    am.role,
    a.name as account_name
  from account_memberships am
  join accounts a on a.id = am.account_id
  where am.user_id = auth.uid()
  order by am.created_at;
$$;

grant execute on function get_my_workspaces() to authenticated;
