-- Drip campaigns: multi-step timed broadcast sequences
CREATE TABLE IF NOT EXISTS drip_campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'archived')),
  enroll_trigger TEXT NOT NULL DEFAULT 'manual' CHECK (enroll_trigger IN ('manual', 'tag_added', 'lead_created', 'contact_created')),
  enroll_config JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_drip_campaigns_account ON drip_campaigns(account_id);

ALTER TABLE drip_campaigns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Account members can manage drip campaigns" ON drip_campaigns;
CREATE POLICY "Account members can manage drip campaigns" ON drip_campaigns FOR ALL
  USING (account_id IN (SELECT account_id FROM profiles WHERE user_id = auth.uid()));

DROP TRIGGER IF EXISTS set_updated_at ON drip_campaigns;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON drip_campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Steps within a drip campaign
CREATE TABLE IF NOT EXISTS drip_steps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID NOT NULL REFERENCES drip_campaigns(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  delay_days INTEGER NOT NULL DEFAULT 0,
  template_name TEXT NOT NULL,
  template_language TEXT NOT NULL DEFAULT 'en_US',
  template_variables JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_drip_steps_campaign ON drip_steps(campaign_id, position);

ALTER TABLE drip_steps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Account members can manage drip steps" ON drip_steps;
CREATE POLICY "Account members can manage drip steps" ON drip_steps FOR ALL
  USING (campaign_id IN (
    SELECT id FROM drip_campaigns
    WHERE account_id IN (SELECT account_id FROM profiles WHERE user_id = auth.uid())
  ));

-- Enrollments: one row per contact per campaign
CREATE TABLE IF NOT EXISTS drip_enrollments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID NOT NULL REFERENCES drip_campaigns(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  current_step INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'unsubscribed', 'failed')),
  enrolled_at TIMESTAMPTZ DEFAULT NOW(),
  next_send_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  UNIQUE(campaign_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_drip_enrollments_next ON drip_enrollments(next_send_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_drip_enrollments_campaign ON drip_enrollments(campaign_id);

ALTER TABLE drip_enrollments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Account members can manage drip enrollments" ON drip_enrollments;
CREATE POLICY "Account members can manage drip enrollments" ON drip_enrollments FOR ALL
  USING (account_id IN (SELECT account_id FROM profiles WHERE user_id = auth.uid()));
