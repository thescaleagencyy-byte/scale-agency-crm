-- 074_conversation_is_lead.sql
-- Flags a conversation as a genuine lead the moment the contact gives
-- their first real, on-topic answer to a qualifying question — not
-- gated on a second message like has_customer_replied, since one good
-- answer is enough signal and spam/troll replies never trigger this
-- (the bot only reaches a qualifying-question payload after a valid
-- answer to the previous one).

alter table conversations
  add column if not exists is_lead boolean not null default false;
