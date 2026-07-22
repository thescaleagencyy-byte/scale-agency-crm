-- 066_competitors.sql
-- Competitor Intelligence v1: track competitors to watch, store the
-- last scrape/summary. The actual scraping needs a real Firecrawl
-- API key (FIRECRAWL_API_KEY) set on the deployed app — that's a
-- separate account-level credential from the Firecrawl MCP access
-- used during development, and doesn't exist for this app yet. This
-- table + the tracking UI works regardless; "Analyze now" honestly
-- errors until the key is set, same pattern as every blocked
-- Integration Hub service.

create table if not exists competitors (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  name text not null,
  url text not null,
  notes text,
  last_summary text,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_competitors_account on competitors(account_id);

alter table competitors enable row level security;
drop policy if exists "members manage competitors" on competitors;
create policy "members manage competitors" on competitors for all
  using (is_account_member(account_id, 'viewer'))
  with check (is_account_member(account_id, 'agent'));

grant select, insert, update, delete on competitors to authenticated;

notify pgrst, 'reload schema';
