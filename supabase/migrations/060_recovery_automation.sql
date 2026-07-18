-- ============================================================
-- 060_recovery_automation.sql — Automated lost-lead recovery
--
-- `recovery_settings` — one row per account, opt-in. When enabled,
-- the recovery cron (GET /api/recovery/cron) sends `template_name`
-- to any OPEN conversation that's gone idle for `idle_days`+ — a
-- pre-approved template because a cold conversation is outside
-- WhatsApp's 24h free-form window (Meta rejects plain text there).
--
-- `recovery_attempts` — one row per send. `recovered_at` is set by
-- the same cron on a later pass, once the contact replies after
-- `sent_at`. `recovered_value` is best-effort: the value of a deal
-- for that contact that closed 'won' after the recovery send — null
-- when there's no linked deal, but the attempt still counts as a
-- recovered conversation.
-- ============================================================

CREATE TABLE IF NOT EXISTS recovery_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  idle_days INTEGER NOT NULL DEFAULT 3 CHECK (idle_days > 0),
  template_name TEXT,
  template_language TEXT NOT NULL DEFAULT 'en_US',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE recovery_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS recovery_settings_policy ON recovery_settings;
CREATE POLICY recovery_settings_policy ON recovery_settings FOR ALL
  USING (is_account_member(account_id));

CREATE TABLE IF NOT EXISTS recovery_attempts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  recovered_at TIMESTAMPTZ,
  recovered_value NUMERIC(12,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE recovery_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS recovery_attempts_policy ON recovery_attempts;
CREATE POLICY recovery_attempts_policy ON recovery_attempts FOR ALL
  USING (is_account_member(account_id));

CREATE INDEX IF NOT EXISTS idx_recovery_attempts_account ON recovery_attempts(account_id);
-- Fast "does this conversation already have an open attempt?" check —
-- the cron uses this to avoid re-sending every run while one is
-- still pending a reply.
CREATE INDEX IF NOT EXISTS idx_recovery_attempts_open_conv
  ON recovery_attempts(conversation_id) WHERE recovered_at IS NULL;
