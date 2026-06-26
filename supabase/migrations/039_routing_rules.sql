create table if not exists routing_rules (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  name text not null,
  priority int not null default 0,
  enabled boolean not null default true,
  conditions jsonb not null default '[]',
  assign_to_agent_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_routing_rules_account on routing_rules(account_id, enabled, priority);
alter table routing_rules enable row level security;
drop policy if exists "admins manage routing_rules" on routing_rules;
create policy "admins manage routing_rules" on routing_rules for all using (is_account_member(account_id, 'admin'));
drop policy if exists "agents read routing_rules" on routing_rules;
create policy "agents read routing_rules" on routing_rules for select using (is_account_member(account_id, 'agent'));
