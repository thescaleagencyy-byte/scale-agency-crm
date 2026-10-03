-- ============================================================
-- 083_growth_features.sql — 5 revenue-generating features
--
-- Where 082 (AI Insight Alerts) catches things going WRONG, this
-- batch catches money being left on the table: reviews nobody asked
-- for, "lost" leads nobody ever follows up with again, repeat
-- questions nobody's turned into a saved answer, referrals nobody's
-- tracking, and upsell moments nobody's acting on. Same settings-row-
-- per-account shape as 082 (`growth_feature_settings`), same
-- `notifyOwnerTemplate` WhatsApp pattern — except Knowledge Gap
-- Finder, which surfaces in-app (Business Knowledge page) instead of
-- WhatsApp since it's a low-urgency "review when convenient" signal,
-- not something that needs to interrupt the owner's phone.
-- ============================================================

CREATE TABLE IF NOT EXISTS growth_feature_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
  owner_whatsapp_number TEXT,
  template_language TEXT NOT NULL DEFAULT 'en_US',

  review_request_enabled BOOLEAN NOT NULL DEFAULT false,
  review_request_template TEXT,
  review_request_link TEXT,

  reactivation_enabled BOOLEAN NOT NULL DEFAULT false,
  reactivation_template TEXT,
  reactivation_min_days INTEGER NOT NULL DEFAULT 90 CHECK (reactivation_min_days > 0),

  knowledge_gap_enabled BOOLEAN NOT NULL DEFAULT false,

  referral_detection_enabled BOOLEAN NOT NULL DEFAULT false,
  referral_alert_template TEXT,

  upsell_detector_enabled BOOLEAN NOT NULL DEFAULT false,
  upsell_detector_template TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE growth_feature_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS growth_feature_settings_policy ON growth_feature_settings;
CREATE POLICY growth_feature_settings_policy ON growth_feature_settings FOR ALL
  USING (is_account_member(account_id));

-- ------------------------------------------------------------
-- 1. Review Request Autopilot — one row per "happy moment" event
-- (deal won / invoice paid / appointment completed) ever alerted on.
-- UNIQUE(source_type, source_id) is the de-dupe: the same won deal
-- can't trigger a second review ask even if it's touched again later.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS review_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('deal', 'invoice', 'appointment')),
  source_id UUID NOT NULL,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(source_type, source_id)
);
ALTER TABLE review_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS review_requests_policy ON review_requests;
CREATE POLICY review_requests_policy ON review_requests FOR ALL
  USING (is_account_member(account_id));
CREATE INDEX IF NOT EXISTS idx_review_requests_account ON review_requests(account_id);

-- ------------------------------------------------------------
-- 2. Dead Lead Reactivation — one row per lead ever reactivated.
-- UNIQUE(lead_id) caps this at one re-engagement attempt per lead,
-- ever — this is a "nothing to lose, worth one shot" play, not a
-- recurring nudge like recovery_attempts.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reactivation_attempts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL UNIQUE REFERENCES leads(id) ON DELETE CASCADE,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE reactivation_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS reactivation_attempts_policy ON reactivation_attempts;
CREATE POLICY reactivation_attempts_policy ON reactivation_attempts FOR ALL
  USING (is_account_member(account_id));
CREATE INDEX IF NOT EXISTS idx_reactivation_attempts_account ON reactivation_attempts(account_id);

-- ------------------------------------------------------------
-- 3. Knowledge Gap Finder — in-app only (Business Knowledge page),
-- not a WhatsApp alert. UNIQUE(account_id, question_pattern) so a
-- repeated question increments occurrence_count on the same row
-- instead of piling up duplicates — the count itself is the signal
-- ("17 customers asked this") that makes the gap worth closing.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS knowledge_gaps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  question_pattern TEXT NOT NULL,
  sample_quote TEXT,
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'added', 'dismissed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(account_id, question_pattern)
);
ALTER TABLE knowledge_gaps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS knowledge_gaps_policy ON knowledge_gaps;
CREATE POLICY knowledge_gaps_policy ON knowledge_gaps FOR ALL
  USING (is_account_member(account_id));
CREATE INDEX IF NOT EXISTS idx_knowledge_gaps_account ON knowledge_gaps(account_id, status);

-- ------------------------------------------------------------
-- 4. Referral Auto-Detection — `referred_by_contact_id` lives on
-- `contacts` directly (one fact about the contact, not a history).
-- `referral_alerts` is just the one-alert-ever guard, same shape as
-- everywhere else in this migration.
-- ------------------------------------------------------------
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS referred_by_contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS referral_alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL UNIQUE REFERENCES contacts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE referral_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS referral_alerts_policy ON referral_alerts;
CREATE POLICY referral_alerts_policy ON referral_alerts FOR ALL
  USING (is_account_member(account_id));

-- ------------------------------------------------------------
-- 5. Upsell Moment Detector — draft-and-approve, same spirit as
-- `price_objection_drafts` (082) and `agent_actions` (068): AI
-- drafts, nothing auto-sends to the customer. UNIQUE(deal_id) caps
-- it at one suggestion per won deal.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS upsell_suggestions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  deal_id UUID NOT NULL UNIQUE REFERENCES deals(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  suggested_upsell TEXT NOT NULL,
  ai_reason TEXT,
  status TEXT NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested', 'sent_to_owner', 'dismissed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE upsell_suggestions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS upsell_suggestions_policy ON upsell_suggestions;
CREATE POLICY upsell_suggestions_policy ON upsell_suggestions FOR ALL
  USING (is_account_member(account_id));
CREATE INDEX IF NOT EXISTS idx_upsell_suggestions_account ON upsell_suggestions(account_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON growth_feature_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON review_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON reactivation_attempts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON knowledge_gaps TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON referral_alerts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON upsell_suggestions TO authenticated;

NOTIFY pgrst, 'reload schema';
