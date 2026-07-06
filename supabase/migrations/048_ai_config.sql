-- ============================================================
-- AI config per workspace — Claude API key for the AI assistant.
--
-- The key is AES-256-GCM encrypted server-side (lib/crypto,
-- MESSAGE_ENCRYPTION_KEY) before insert, same as message bodies,
-- so a leaked DB dump doesn't leak the key. RLS additionally
-- scopes rows to account members.
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
  claude_api_key TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE ai_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_config_policy ON ai_config FOR ALL
  USING (is_account_member(account_id));
