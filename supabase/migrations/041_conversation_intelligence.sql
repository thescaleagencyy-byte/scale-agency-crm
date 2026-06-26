create table if not exists conversation_intelligence (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  generated_at timestamptz not null default now(),
  period_start timestamptz not null,
  period_end timestamptz not null,
  conversations_analyzed int not null default 0,
  top_objections jsonb not null default '[]',
  common_requests jsonb not null default '[]',
  sentiment_breakdown jsonb not null default '{}',
  avg_close_days numeric,
  key_insights jsonb not null default '[]',
  raw_summary text
);
create index if not exists idx_conversation_intelligence_account on conversation_intelligence(account_id, generated_at desc);
alter table conversation_intelligence enable row level security;
drop policy if exists "admins manage intelligence" on conversation_intelligence;
create policy "admins manage intelligence" on conversation_intelligence for all using (is_account_member(account_id, 'admin'));
drop policy if exists "agents read intelligence" on conversation_intelligence;
create policy "agents read intelligence" on conversation_intelligence for select using (is_account_member(account_id, 'agent'));

create table if not exists whatsapp_flows (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  name text not null,
  meta_flow_id text,
  status text not null default 'draft',
  definition jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_whatsapp_flows_account on whatsapp_flows(account_id);
alter table whatsapp_flows enable row level security;
drop policy if exists "admins manage whatsapp_flows" on whatsapp_flows;
create policy "admins manage whatsapp_flows" on whatsapp_flows for all using (is_account_member(account_id, 'admin'));
drop policy if exists "agents read whatsapp_flows" on whatsapp_flows;
create policy "agents read whatsapp_flows" on whatsapp_flows for select using (is_account_member(account_id, 'agent'));
