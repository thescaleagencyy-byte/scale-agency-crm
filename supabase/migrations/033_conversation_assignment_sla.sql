-- 033_conversation_assignment_sla.sql
-- Adds SLA tracking fields to conversations.
-- Note: assigned_agent_id already exists from migration 001.

alter table conversations add column if not exists first_replied_at timestamptz;
alter table conversations add column if not exists resolved_at timestamptz;

create index if not exists idx_conversations_resolved_at on conversations(resolved_at);
