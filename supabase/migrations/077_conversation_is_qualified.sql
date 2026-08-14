-- 077_conversation_is_qualified.sql
-- Distinguishes a real business lead from noise (emoji/sticker/bare
-- voice note), independent of is_lead — is_lead is set by the
-- external n8n bot flow and already proven too loose (conversations
-- whose entire customer-side content was one emoji still got marked
-- is_lead=true), and it can't be redefined here since
-- src/lib/meta-ads/rollup.ts depends on its existing meaning for ad
-- ROI reporting. is_qualified is computed deterministically by this
-- app from message content: a bot/agent message ending in "?"
-- followed by a substantive customer reply (real text/button-tap,
-- not emoji-only/sticker/uncaptioned voice note).
--
-- One-way flag, same convention as is_lead / is_escalated.

alter table conversations
  add column if not exists is_qualified boolean not null default false;
