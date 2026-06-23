-- n8n integration config per account.
-- webhook_url: where the CRM forwards Meta webhook events (n8n trigger URL).
-- api_url:     n8n instance base URL for the live dashboard (e.g. https://my.n8n.io).
-- api_key:     n8n API key, AES-256-GCM encrypted at rest (same scheme as access_token).
CREATE TABLE IF NOT EXISTS n8n_config (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  webhook_url     TEXT,
  api_url         TEXT,
  api_key         TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(account_id)
);

ALTER TABLE n8n_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Account members can manage n8n config" ON n8n_config;
CREATE POLICY "Account members can manage n8n config" ON n8n_config
  FOR ALL USING (
    account_id IN (
      SELECT account_id FROM profiles WHERE user_id = auth.uid()
    )
  );

DROP TRIGGER IF EXISTS set_updated_at ON n8n_config;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON n8n_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
