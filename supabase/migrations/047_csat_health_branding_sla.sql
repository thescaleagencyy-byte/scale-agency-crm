-- ============================================================
-- CSAT responses
-- ============================================================
CREATE TABLE IF NOT EXISTS csat_responses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  rating SMALLINT CHECK (rating BETWEEN 1 AND 5),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_csat_account ON csat_responses(account_id);
CREATE INDEX IF NOT EXISTS idx_csat_conversation ON csat_responses(conversation_id);
ALTER TABLE csat_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY csat_account_policy ON csat_responses FOR ALL
  USING (is_account_member(account_id));

-- ============================================================
-- WhatsApp number quality history
-- ============================================================
CREATE TABLE IF NOT EXISTS wa_quality_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  quality_rating TEXT NOT NULL CHECK (quality_rating IN ('GREEN', 'YELLOW', 'RED', 'UNKNOWN')),
  messaging_limit_tier TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wa_quality_account ON wa_quality_history(account_id, recorded_at DESC);
ALTER TABLE wa_quality_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY wa_quality_policy ON wa_quality_history FOR ALL
  USING (is_account_member(account_id));

-- ============================================================
-- Brand / white-label config per workspace
-- ============================================================
CREATE TABLE IF NOT EXISTS brand_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
  app_name TEXT,
  logo_url TEXT,
  primary_hex TEXT,
  support_email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE brand_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY brand_config_policy ON brand_config FOR ALL
  USING (is_account_member(account_id));

-- ============================================================
-- SLA fields on conversations
-- ============================================================
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS first_agent_reply_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sla_deadline_at TIMESTAMPTZ;

-- ============================================================
-- Lead score on contacts
-- ============================================================
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS lead_score SMALLINT DEFAULT 0 CHECK (lead_score BETWEEN 0 AND 100);

-- Trigger: bump lead_score on new inbound message
CREATE OR REPLACE FUNCTION recalculate_lead_score()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_contact_id UUID;
  v_msg_count INT;
  v_days_since_last INT;
  v_score INT := 0;
BEGIN
  -- Only on inbound (customer) messages
  IF NEW.sender_type <> 'customer' THEN
    RETURN NEW;
  END IF;

  SELECT contact_id INTO v_contact_id
  FROM conversations WHERE id = NEW.conversation_id;

  IF v_contact_id IS NULL THEN RETURN NEW; END IF;

  -- Message volume (up to 40 pts)
  SELECT COUNT(*) INTO v_msg_count
  FROM messages m
  JOIN conversations c ON c.id = m.conversation_id
  WHERE c.contact_id = v_contact_id AND m.sender_type = 'customer';
  v_score := v_score + LEAST(v_msg_count * 4, 40);

  -- Recency (up to 40 pts)
  SELECT EXTRACT(DAY FROM NOW() - MAX(m.created_at))::INT INTO v_days_since_last
  FROM messages m
  JOIN conversations c ON c.id = m.conversation_id
  WHERE c.contact_id = v_contact_id AND m.sender_type = 'customer';
  IF v_days_since_last IS NOT NULL THEN
    v_score := v_score + GREATEST(0, 40 - v_days_since_last * 4);
  END IF;

  -- Keyword match in latest message (up to 20 pts)
  IF NEW.content_text ILIKE ANY(ARRAY['%price%','%cost%','%how much%','%interested%','%buy%','%when%','%start%','%book%','%order%']) THEN
    v_score := v_score + 20;
  END IF;

  UPDATE contacts SET lead_score = LEAST(v_score, 100) WHERE id = v_contact_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lead_score ON messages;
CREATE TRIGGER trg_lead_score
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION recalculate_lead_score();
