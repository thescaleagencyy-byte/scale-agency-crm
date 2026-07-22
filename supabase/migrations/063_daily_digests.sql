-- 063_daily_digests.sql
-- Proactive daily digest — "every morning it says what you should do
-- today," per the original Scale OS pitch. This account has no
-- WhatsApp Business number connected, so real message delivery isn't
-- testable yet; the digest is generated + stored + shown in-app first
-- (same "build the real internal layer, external send later" pattern
-- as Finance/Marketing OS), with WhatsApp delivery attempted only when
-- whatsapp_config actually exists for the account.

create table if not exists daily_digests (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  content text not null,
  stats jsonb,
  sent_via_whatsapp boolean not null default false,
  generated_at timestamptz not null default now()
);

create index if not exists idx_daily_digests_account on daily_digests(account_id, generated_at desc);

alter table daily_digests enable row level security;
drop policy if exists "members read daily_digests" on daily_digests;
create policy "members read daily_digests" on daily_digests for select
  using (is_account_member(account_id, 'viewer'));

grant select, insert, update, delete on daily_digests to authenticated;

notify pgrst, 'reload schema';
