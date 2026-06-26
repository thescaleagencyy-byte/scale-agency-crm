-- 031_saved_replies.sql
-- Canned responses agents can insert via / shortcut in the composer.

create table if not exists saved_replies (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  title text not null,
  shortcut text not null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_saved_replies_account on saved_replies(account_id);
create unique index if not exists idx_saved_replies_account_shortcut on saved_replies(account_id, shortcut);

alter table saved_replies enable row level security;

drop policy if exists "members read saved_replies" on saved_replies;
create policy "members read saved_replies" on saved_replies for select
  using (is_account_member(account_id, 'viewer'));

drop policy if exists "admins manage saved_replies" on saved_replies;
create policy "admins manage saved_replies" on saved_replies for all
  using (is_account_member(account_id, 'admin'));
