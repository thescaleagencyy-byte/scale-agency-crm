-- ============================================================
-- 082_ai_insight_alerts.sql — AI Insight Alerts (5 proactive signals)
--
-- Five cross-industry owner pain points, one settings shape. Every
-- SMB owner has the same blind spots regardless of niche: what staff
-- actually say on chat, a customer quietly souring before they leave
-- a bad review, money due that won't arrive in time, a booking that's
-- probably going to no-show, and a lead going quiet instead of
-- objecting out loud. Same WhatsApp-the-owner pattern as
-- 081_hot_lead_alert.sql (`notifyOwnerTemplate`), same opt-in
-- settings-row-per-account shape as `recovery_settings`.
--
-- One shared `ai_alert_settings` row per account (not 5 separate
-- settings tables) — these are naturally one product surface
-- ("AI Alerts" in Settings), and a single owner_whatsapp_number +
-- template_language serves all five rather than repeating it five
-- times.
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_alert_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
  owner_whatsapp_number TEXT,
  template_language TEXT NOT NULL DEFAULT 'en_US',

  staff_audit_enabled BOOLEAN NOT NULL DEFAULT false,
  staff_audit_template TEXT,
  staff_audit_min_score INTEGER NOT NULL DEFAULT 40 CHECK (staff_audit_min_score BETWEEN 0 AND 100),

  complaint_alert_enabled BOOLEAN NOT NULL DEFAULT false,
  complaint_alert_template TEXT,

  cashflow_alert_enabled BOOLEAN NOT NULL DEFAULT false,
  cashflow_alert_template TEXT,
  cashflow_danger_days INTEGER NOT NULL DEFAULT 14 CHECK (cashflow_danger_days > 0),

  noshow_alert_enabled BOOLEAN NOT NULL DEFAULT false,
  noshow_alert_template TEXT,

  price_objection_enabled BOOLEAN NOT NULL DEFAULT false,
  price_objection_template TEXT,
  price_objection_discount_cap NUMERIC(5,2) NOT NULL DEFAULT 10 CHECK (price_objection_discount_cap BETWEEN 0 AND 50),

  dialect_detection_enabled BOOLEAN NOT NULL DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE ai_alert_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_alert_settings_policy ON ai_alert_settings;
CREATE POLICY ai_alert_settings_policy ON ai_alert_settings FOR ALL
  USING (is_account_member(account_id));

-- ------------------------------------------------------------
-- 1. Staff Accountability Audit — one row per conversation ever
-- scored. AI reads the transcript, judges reply speed/tone/outcome.
-- Always recorded (so a per-staff history builds up even when the
-- score doesn't cross the alert threshold); alert only fires on a
-- bad score so this doesn't become noise.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS staff_performance_audits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL UNIQUE REFERENCES conversations(id) ON DELETE CASCADE,
  staff_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
  issues JSONB,
  ai_summary TEXT,
  alerted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE staff_performance_audits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_performance_audits_policy ON staff_performance_audits;
CREATE POLICY staff_performance_audits_policy ON staff_performance_audits FOR ALL
  USING (is_account_member(account_id));
CREATE INDEX IF NOT EXISTS idx_staff_audits_account ON staff_performance_audits(account_id);
CREATE INDEX IF NOT EXISTS idx_staff_audits_staff ON staff_performance_audits(staff_user_id);

-- ------------------------------------------------------------
-- 2. Complaint-Before-It-Explodes — one row per conversation ever
-- flagged. UNIQUE(conversation_id) caps this at one alert per
-- conversation life (MVP tradeoff: avoids spam on a long thread that
-- stays tense; a future pass could allow re-alerting after a cool-down).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS complaint_warnings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL UNIQUE REFERENCES conversations(id) ON DELETE CASCADE,
  risk_level TEXT NOT NULL CHECK (risk_level IN ('rising', 'high')),
  ai_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE complaint_warnings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS complaint_warnings_policy ON complaint_warnings;
CREATE POLICY complaint_warnings_policy ON complaint_warnings FOR ALL
  USING (is_account_member(account_id));
CREATE INDEX IF NOT EXISTS idx_complaint_warnings_account ON complaint_warnings(account_id);

-- ------------------------------------------------------------
-- 3. Cash Flow Crystal Ball — one row per account per day it fires.
-- Deliberately NOT a full cash-flow model (no expense tracking exists
-- in this schema) — honest, deterministic scope: "this much is unpaid
-- and due soon, go collect it," same calculated-not-fabricated
-- philosophy as the existing /predictions page. UNIQUE(account_id,
-- alert_date) is the daily-spam guard.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cashflow_alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  alert_date DATE NOT NULL DEFAULT CURRENT_DATE,
  projected_shortfall NUMERIC(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(account_id, alert_date)
);
ALTER TABLE cashflow_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cashflow_alerts_policy ON cashflow_alerts;
CREATE POLICY cashflow_alerts_policy ON cashflow_alerts FOR ALL
  USING (is_account_member(account_id));
CREATE INDEX IF NOT EXISTS idx_cashflow_alerts_account ON cashflow_alerts(account_id);

-- ------------------------------------------------------------
-- 4. No-Show Predictor — columns directly on `appointments` rather
-- than a new table (1:1 relationship, no history of its own). Purely
-- deterministic (count of this contact's past no_show appointments /
-- total past appointments) — no AI call, matching the existing
-- /predictions page's "calculation, not a live model" rule.
-- ------------------------------------------------------------
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS no_show_risk TEXT CHECK (no_show_risk IN ('low', 'medium', 'high')),
  ADD COLUMN IF NOT EXISTS no_show_reason TEXT,
  ADD COLUMN IF NOT EXISTS no_show_alerted_at TIMESTAMPTZ;

-- ------------------------------------------------------------
-- 5. Silent Price-Objection Catch — draft-and-approve, same pattern
-- as `agent_actions` (068_agent_actions.sql): AI drafts, nothing
-- auto-sends to the customer. `discount_cap` on ai_alert_settings is
-- the safety rail — the AI is never free to suggest more than the
-- owner capped, and even within the cap this only ever reaches the
-- OWNER's WhatsApp (not the customer) until a human acts on it.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS price_objection_drafts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL UNIQUE REFERENCES conversations(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  suggested_offer TEXT NOT NULL,
  ai_reason TEXT,
  status TEXT NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested', 'sent_to_owner', 'dismissed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE price_objection_drafts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS price_objection_drafts_policy ON price_objection_drafts;
CREATE POLICY price_objection_drafts_policy ON price_objection_drafts FOR ALL
  USING (is_account_member(account_id));
CREATE INDEX IF NOT EXISTS idx_price_objection_drafts_account ON price_objection_drafts(account_id);

-- ------------------------------------------------------------
-- 6. Dialect/register detection — passive metadata on `contacts`,
-- shown as a badge to the human agent (not an auto-reply: Umer
-- explicitly removed AI-drafted inbox replies on 2026-08-16 —
-- "Umer's call", see commit adcf095 — so this stays informational
-- only, never touches the composer).
-- ------------------------------------------------------------
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS detected_language TEXT;

GRANT SELECT, INSERT, UPDATE, DELETE ON ai_alert_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON staff_performance_audits TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON complaint_warnings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON cashflow_alerts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON price_objection_drafts TO authenticated;

NOTIFY pgrst, 'reload schema';
