-- 068_agent_actions.sql
-- Autonomous Daily Agent v1 — draft-and-approve queue, not full
-- autonomy. The agent drafts a follow-up WhatsApp message per cold
-- lead; nothing sends to a real customer until a human clicks
-- Approve. This is the explicit tradeoff Umer chose over full
-- auto-send: one bad drafted message caught before it goes out,
-- not after.

create table if not exists agent_actions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  kind text not null default 'followup_message' check (kind in ('followup_message')),
  lead_id uuid references leads(id) on delete cascade,
  contact_id uuid references contacts(id) on delete set null,
  conversation_id uuid references conversations(id) on delete set null,
  reason text not null,
  drafted_text text not null,
  status text not null default 'draft' check (status in ('draft', 'approved', 'rejected', 'sent', 'failed')),
  error text,
  created_at timestamptz not null default now(),
  actioned_at timestamptz,
  actioned_by uuid references auth.users(id) on delete set null,
  unique (lead_id, kind, status)
);

create index if not exists idx_agent_actions_account_status on agent_actions(account_id, status);

alter table agent_actions enable row level security;
drop policy if exists "members manage agent_actions" on agent_actions;
create policy "members manage agent_actions" on agent_actions for all
  using (is_account_member(account_id, 'viewer'))
  with check (is_account_member(account_id, 'agent'));

grant select, insert, update, delete on agent_actions to authenticated;

notify pgrst, 'reload schema';
