create table if not exists qr_codes (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  name text not null,
  phone text not null,
  prefill_message text not null default '',
  campaign_tag text,
  scan_count int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_qr_codes_account on qr_codes(account_id);
alter table qr_codes enable row level security;
drop policy if exists "members manage qr_codes" on qr_codes;
create policy "members manage qr_codes" on qr_codes for all using (is_account_member(account_id, 'agent'));
