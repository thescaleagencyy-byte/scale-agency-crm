-- ============================================================
-- 055_voice_calls.sql
--
-- Persists every AshWheelz voice-agent call (Vapi) into the
-- dashboard so there's a real "Voice Agent" tab — not just leads
-- mixed into the generic leads list, and not data that only lives
-- inside Vapi's own dashboard.
--
-- Populated by the "AshWheelz Voice — Post-Call WhatsApp
-- Confirmation" n8n workflow, which is triggered by Vapi's
-- end-of-call-report webhook for every call, whether or not it
-- resulted in a lead. vapi_call_id is unique so a retried/duplicate
-- webhook delivery upserts instead of double-inserting.
-- ============================================================

CREATE TABLE IF NOT EXISTS voice_calls (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id        UUID        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  vapi_call_id      TEXT        NOT NULL,
  contact_id        UUID        REFERENCES contacts(id) ON DELETE SET NULL,
  customer_phone    TEXT,
  customer_name     TEXT,
  call_type         TEXT,
  language_used     TEXT,
  resolved          BOOLEAN,
  escalated_to_ops  BOOLEAN,
  summary           TEXT,
  transcript        TEXT,
  recording_url     TEXT,
  ended_reason      TEXT,
  duration_seconds  INTEGER,
  cost_usd          NUMERIC(10,4),
  started_at        TIMESTAMPTZ,
  ended_at          TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_voice_calls_vapi_call_id ON voice_calls(account_id, vapi_call_id);
CREATE INDEX IF NOT EXISTS idx_voice_calls_account    ON voice_calls(account_id);
CREATE INDEX IF NOT EXISTS idx_voice_calls_created_at ON voice_calls(created_at);
CREATE INDEX IF NOT EXISTS idx_voice_calls_phone      ON voice_calls(customer_phone);

ALTER TABLE voice_calls ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Account members can manage voice calls" ON voice_calls;
CREATE POLICY "Account members can manage voice calls" ON voice_calls FOR ALL
  USING (account_id IN (
    SELECT account_id FROM profiles WHERE user_id = auth.uid()
  ));

GRANT ALL ON public.voice_calls TO authenticated, service_role;
