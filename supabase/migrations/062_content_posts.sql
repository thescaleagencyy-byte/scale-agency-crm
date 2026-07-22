-- 062_content_posts.sql
-- Marketing OS v1: internal content calendar / planning layer only.
-- Deliberately does NOT integrate with any social platform API —
-- that needs real Instagram/TikTok/LinkedIn/YouTube credentials and
-- a video/image-gen budget this account doesn't have configured yet.
-- This table is the same "build the real internal model first"
-- pattern as client_invoices before any payment gateway existed:
-- draft -> scheduled -> posted -> cancelled tracking, useful on its
-- own as a content calendar regardless of when (or whether) live
-- posting gets wired up later.

create table if not exists content_posts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  title text not null,
  platform text not null check (platform in ('instagram', 'tiktok', 'linkedin', 'youtube', 'facebook', 'other')),
  caption text,
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'posted', 'cancelled')),
  scheduled_for timestamptz,
  posted_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_content_posts_account on content_posts(account_id);
create index if not exists idx_content_posts_status on content_posts(account_id, status);

alter table content_posts enable row level security;
drop policy if exists "members manage content_posts" on content_posts;
create policy "members manage content_posts" on content_posts for all
  using (is_account_member(account_id, 'agent'));

grant select, insert, update, delete on content_posts to authenticated;

notify pgrst, 'reload schema';
