-- ============================================================
-- 054_voice_agent_extensions.sql
--
-- Support for the AshWheelz Vapi voice agent ("Reem"):
--   1. leads.sla_alert_sent — lets the SLA watchdog n8n workflow
--      (checks for voice leads unclaimed >1hr) mark a lead as
--      already alerted, so it doesn't re-page Umer every poll.
--      Voice leads are identified via the existing leads.source
--      column (add 'voice' to its informal value list — see
--      032_lead_source_attribution.sql for the others).
--   2. voice_agent_control — kill switch for the voice agent,
--      same shape/pattern as quote_automation_control
--      (053_quote_automation_control.sql). Not wired to an
--      enforcement point yet — Vapi has no phone number attached
--      to this assistant yet, so there's no inbound webhook to
--      gate. Table + endpoint exist now so the enforcement point
--      is a one-line n8n check once the number is connected.
-- ============================================================

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS sla_alert_sent BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS voice_agent_control (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id  UUID        NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
  enabled     BOOLEAN     NOT NULL DEFAULT TRUE,
  updated_by  TEXT,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE voice_agent_control ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Account members can manage voice agent control" ON voice_agent_control;
CREATE POLICY "Account members can manage voice agent control" ON voice_agent_control FOR ALL
  USING (account_id IN (
    SELECT account_id FROM profiles WHERE user_id = auth.uid()
  ));

GRANT ALL ON public.voice_agent_control TO authenticated, service_role;
