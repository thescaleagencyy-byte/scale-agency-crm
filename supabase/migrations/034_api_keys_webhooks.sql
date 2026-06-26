-- 034_api_keys_webhooks.sql
-- API keys for external integrations + webhook endpoints.

create table if not exists api_keys (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  name text not null,
  key_hash text not null,
  key_prefix text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create index if not exists idx_api_keys_account on api_keys(account_id);
create index if not exists idx_api_keys_key_hash on api_keys(key_hash);

alter table api_keys enable row level security;

drop policy if exists "admins manage api_keys" on api_keys;
create policy "admins manage api_keys" on api_keys for all
  using (is_account_member(account_id, 'admin'));

-- ----

create table if not exists webhooks (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  name text not null default '',
  url text not null,
  events text[] not null default '{}',
  secret text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  last_triggered_at timestamptz,
  last_status int
);

create index if not exists idx_webhooks_account on webhooks(account_id);

alter table webhooks enable row level security;

drop policy if exists "admins manage webhooks" on webhooks;
create policy "admins manage webhooks" on webhooks for all
  using (is_account_member(account_id, 'admin'));
