-- 072_conversation_has_customer_replied.sql
-- Flags conversations where the contact has sent a genuine follow-up
-- message (not just their first inbound), so the inbox list can surface
-- real back-and-forth engagement separately from one-shot ad-triggered
-- greetings that never got a real reply. Backed by the existing
-- isFirstInboundMessage check already computed in the webhook handler
-- and the n8n log endpoint — this just persists that signal.

alter table conversations
  add column if not exists has_customer_replied boolean not null default false;
