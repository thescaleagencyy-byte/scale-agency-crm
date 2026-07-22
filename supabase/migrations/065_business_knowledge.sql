-- 065_business_knowledge.sql
-- AI Memory v1: durable business facts the Copilot reads before
-- answering — pricing, SOPs, refund policy, tone, whatever the owner
-- wants it to permanently know instead of re-explaining every
-- conversation. Simple key/value + free-text, not a vector store —
-- the whole point is these facts get pasted verbatim into every
-- system prompt (small volume, always-relevant), not semantically
-- searched.

create table if not exists business_knowledge (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  category text not null default 'general' check (category in (
    'pricing', 'sop', 'policy', 'tone', 'products', 'team', 'goals', 'general'
  )),
  title text not null,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_business_knowledge_account on business_knowledge(account_id);

alter table business_knowledge enable row level security;
drop policy if exists "members manage business_knowledge" on business_knowledge;
create policy "members manage business_knowledge" on business_knowledge for all
  using (is_account_member(account_id, 'viewer'))
  with check (is_account_member(account_id, 'agent'));

grant select, insert, update, delete on business_knowledge to authenticated;

notify pgrst, 'reload schema';
