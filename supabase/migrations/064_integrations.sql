-- 064_integrations.sql
-- Integration Hub — real connection status per external service, not
-- fake "connected" badges. For services that can't be wired for real
-- yet (no developer app registered, no OAuth credentials), this is
-- the honest v1: track status + let credentials be pasted in and
-- encrypted (same AES-256-GCM pattern as ai_config.claude_api_key and
-- WhatsApp access tokens) so the day real API access exists, no code
-- change is needed to start using it — just paste the key.

create table if not exists integrations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  service text not null check (service in (
    'whatsapp', 'instagram', 'facebook', 'gmail', 'outlook',
    'google_calendar', 'stripe', 'shopify', 'woocommerce', 'pos',
    'accounting', 'google_drive', 'slack', 'n8n'
  )),
  status text not null default 'not_connected' check (status in ('not_connected', 'pending', 'connected', 'error')),
  credentials_encrypted text,
  config jsonb,
  connected_at timestamptz,
  last_checked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, service)
);

create index if not exists idx_integrations_account on integrations(account_id);

alter table integrations enable row level security;
drop policy if exists "members manage integrations" on integrations;
create policy "members manage integrations" on integrations for all
  using (is_account_member(account_id, 'viewer'))
  with check (is_account_member(account_id, 'admin'));

grant select, insert, update, delete on integrations to authenticated;

notify pgrst, 'reload schema';
