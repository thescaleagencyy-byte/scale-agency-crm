-- 075_meta_ads.sql
-- Meta Ads Analytics: daily ad-level spend/impressions/clicks synced from
-- the Marketing API, joined at query time against conversations.ad_source_id
-- (already populated per-CTWA-message) and deals to compute cost-per-lead
-- and ROAS. No separate campaign dimension table — level=ad insights rows
-- already carry campaign_id/campaign_name together, so campaign rollup is
-- just grouping these rows.

alter table integrations drop constraint integrations_service_check;
alter table integrations add constraint integrations_service_check check (service in (
  'whatsapp','instagram','facebook','gmail','outlook','google_calendar','stripe',
  'shopify','woocommerce','pos','accounting','google_drive','slack','n8n','meta_ads'
));

create table if not exists meta_ad_insights (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  ad_account_id text not null,
  date date not null,
  campaign_id text not null,
  campaign_name text,
  adset_id text,
  adset_name text,
  ad_id text not null,
  ad_name text,
  spend numeric(12,2) not null default 0,
  impressions integer not null default 0,
  clicks integer not null default 0,
  reach integer not null default 0,
  currency text,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, ad_account_id, ad_id, date)
);
create index if not exists idx_meta_ad_insights_account_date on meta_ad_insights(account_id, date);
create index if not exists idx_meta_ad_insights_campaign on meta_ad_insights(account_id, campaign_id);

alter table meta_ad_insights enable row level security;
drop policy if exists "members read ad insights" on meta_ad_insights;
create policy "members read ad insights" on meta_ad_insights for select
  using (is_account_member(account_id, 'viewer'));
grant select on meta_ad_insights to authenticated;

notify pgrst, 'reload schema';
