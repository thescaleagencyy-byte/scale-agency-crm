-- ============================================================
-- 053_quote_automation_control.sql
--
-- Kill switch for the Outlook → WhatsApp quote automation
-- (n8n workflow "AshWheelz Prime - Outlook Quote to WhatsApp").
-- One row per account. enabled=false pauses the workflow before
-- any extraction/send happens — n8n checks this on every trigger
-- fire via GET /api/n8n/quote/automation-status.
--
-- No row yet for an account = treated as enabled (default-on,
-- opt-in pause only — see route comments for the fail-open
-- behavior on top of this default).
-- ============================================================

CREATE TABLE IF NOT EXISTS quote_automation_control (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id  UUID        NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
  enabled     BOOLEAN     NOT NULL DEFAULT TRUE,
  updated_by  TEXT,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE quote_automation_control ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Account members can manage quote automation control" ON quote_automation_control;
CREATE POLICY "Account members can manage quote automation control" ON quote_automation_control FOR ALL
  USING (account_id IN (
    SELECT account_id FROM profiles WHERE user_id = auth.uid()
  ));

-- This project's default privileges don't auto-grant to the API roles
-- (same gotcha as quotes/ai_config — 42501 without this).
GRANT ALL ON public.quote_automation_control TO authenticated, service_role;
