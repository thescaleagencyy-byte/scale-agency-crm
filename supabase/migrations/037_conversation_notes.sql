create table if not exists conversation_notes (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  mentions uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_conversation_notes_conversation on conversation_notes(conversation_id);
create index if not exists idx_conversation_notes_account on conversation_notes(account_id);
alter table conversation_notes enable row level security;
drop policy if exists "members manage conversation_notes" on conversation_notes;
create policy "members manage conversation_notes" on conversation_notes for all using (is_account_member(account_id, 'agent'));
