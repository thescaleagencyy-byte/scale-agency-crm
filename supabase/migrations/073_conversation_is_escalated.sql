-- 073_conversation_is_escalated.sql
-- Dedicated escalation flag, decoupled from the generic Open/Pending/Closed
-- status so a bot marking a conversation escalated never collides with an
-- admin's own manual use of "Pending" for unrelated triage. Powers a
-- distinctly-labeled "Escalations" filter in the inbox (separate tab from
-- "Pending") — the actual thing that was asked for, not an overload of an
-- existing generic status.

alter table conversations
  add column if not exists is_escalated boolean not null default false;
