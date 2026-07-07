-- Missing migration: leads table was created directly in Supabase, not via migrations.
-- Run this FIRST before 001_initial_schema.sql

CREATE TABLE IF NOT EXISTS leads (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id       UUID        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  customer_name    TEXT,
  customer_phone   TEXT        NOT NULL,
  service_type     TEXT,
  project_site     TEXT,
  duration         TEXT,
  quantity         TEXT,
  company          TEXT,
  status           TEXT        NOT NULL DEFAULT 'new'
                               CHECK (status IN ('new', 'called', 'won', 'lost')),
  score            INTEGER     NOT NULL DEFAULT 0,
  score_factors    JSONB,
  contact_id       UUID        REFERENCES contacts(id) ON DELETE SET NULL,
  conversation_id  UUID        REFERENCES conversations(id) ON DELETE SET NULL,
  raw_handoff      TEXT,
  source           TEXT,
  ad_source_url    TEXT,
  ad_ctwa_clid     TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leads_account    ON leads(account_id);
CREATE INDEX IF NOT EXISTS idx_leads_status     ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_phone      ON leads(customer_phone);
CREATE INDEX IF NOT EXISTS idx_leads_contact    ON leads(contact_id);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Account members can manage leads" ON leads;
CREATE POLICY "Account members can manage leads" ON leads FOR ALL
  USING (account_id IN (
    SELECT account_id FROM profiles WHERE user_id = auth.uid()
  ));
