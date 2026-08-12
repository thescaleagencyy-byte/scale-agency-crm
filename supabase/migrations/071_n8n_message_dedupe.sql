-- 071_n8n_message_dedupe.sql
-- Atomic dedupe store for inbound WhatsApp webhook messages processed by
-- n8n bots. A unique constraint on message_id lets a single INSERT act as
-- the dedupe gate itself (conflict = already processed), instead of a
-- separate check-then-insert pair that races when the same message_id
-- arrives via two near-simultaneous webhook deliveries (Meta retries a
-- webhook it didn't get a fast ack for).

create table if not exists n8n_message_dedupe (
  message_id text primary key,
  created_at timestamptz not null default now()
);
