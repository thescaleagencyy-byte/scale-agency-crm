alter table conversations
  add column if not exists ad_source_url text,
  add column if not exists ad_source_id text,
  add column if not exists ad_headline text,
  add column if not exists ad_ctwa_clid text,
  add column if not exists referral_data jsonb;

alter table leads
  add column if not exists ad_source_url text,
  add column if not exists ad_ctwa_clid text;
