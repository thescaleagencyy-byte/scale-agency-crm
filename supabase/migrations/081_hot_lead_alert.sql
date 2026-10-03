-- ============================================================
-- 081_hot_lead_alert.sql — Hot Lead WhatsApp Alert
--
-- Closes a gap between two features that already existed but were
-- never connected: AI lead triage (079_leads_ai_triage.sql —
-- `leads.ai_quality`) computes a real "this one's worth calling
-- right now" signal the moment a lead comes in, but today that
-- signal only shows up as a badge the owner has to go look for.
-- Speed-to-lead is one of the best-documented levers in sales (minutes
-- of delay measurably cost conversions) — this makes the CRM proactively
-- WhatsApp the account owner the moment a lead is both AI-flagged
-- `hot` and still sitting untouched (`status = 'new'`) past a
-- configurable threshold.
--
-- `lead_alert_settings` — one row per account, opt-in, mirrors the
-- shape of `recovery_settings` (060). `owner_whatsapp_number` is the
-- personal/admin number to alert — deliberately separate from the
-- business's own connected WhatsApp number (whatsapp_config), which
-- is what actually SENDS the alert; the owner may want alerts on a
-- different phone than the one customers message.
--
-- `lead_alerts` — one row per lead ever alerted on. `UNIQUE(lead_id)`
-- is the whole de-dupe mechanism: a lead can only trigger this once,
-- full stop, so the cron can run as often as it wants without risking
-- a double-ping.
-- ============================================================

CREATE TABLE IF NOT EXISTS lead_alert_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  threshold_minutes INTEGER NOT NULL DEFAULT 10 CHECK (threshold_minutes > 0),
  owner_whatsapp_number TEXT,
  template_name TEXT,
  template_language TEXT NOT NULL DEFAULT 'en_US',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE lead_alert_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lead_alert_settings_policy ON lead_alert_settings;
CREATE POLICY lead_alert_settings_policy ON lead_alert_settings FOR ALL
  USING (is_account_member(account_id));

CREATE TABLE IF NOT EXISTS lead_alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL UNIQUE REFERENCES leads(id) ON DELETE CASCADE,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE lead_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lead_alerts_policy ON lead_alerts;
CREATE POLICY lead_alerts_policy ON lead_alerts FOR ALL
  USING (is_account_member(account_id));

CREATE INDEX IF NOT EXISTS idx_lead_alerts_account ON lead_alerts(account_id);

-- The cron's main query: hot, untouched, old-enough-but-not-ancient
-- leads for an enabled account.
CREATE INDEX IF NOT EXISTS idx_leads_hot_new
  ON leads(account_id, created_at) WHERE status = 'new' AND ai_quality = 'hot';

GRANT SELECT, INSERT, UPDATE, DELETE ON lead_alert_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON lead_alerts TO authenticated;

NOTIFY pgrst, 'reload schema';
