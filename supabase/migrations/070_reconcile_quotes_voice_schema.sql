-- ============================================================
-- 070_reconcile_quotes_voice_schema.sql
--
-- The Supabase project was deleted and rebuilt on 2026-07-19 (free-tier
-- inactivity auto-delete). Migrations 050/051/053/054/055 were never
-- committed to git (applied straight to prod historically), so the
-- rebuild reconstructed them from session notes/prose — and the
-- reconstruction diverged from what the actual page/route code expects
-- on `quotes` and `voice_calls`. This patches the live tables up to
-- match the recovered original 050/054/055 without dropping anything
-- the reconstruction already has right.
--
-- Idempotent — ADD COLUMN IF NOT EXISTS throughout, safe to re-run.
-- ============================================================

-- quotes: reconstruction was missing most of the row shape, including
-- `status` itself (see original 050_quotes.sql for full column docs).
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS email_subject    TEXT,
  ADD COLUMN IF NOT EXISTS pdf_filename     TEXT,
  ADD COLUMN IF NOT EXISTS status           TEXT NOT NULL DEFAULT 'received',
  ADD COLUMN IF NOT EXISTS media_id         TEXT,
  ADD COLUMN IF NOT EXISTS error_detail     TEXT,
  ADD COLUMN IF NOT EXISTS contact_id       UUID REFERENCES contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS conversation_id  UUID REFERENCES conversations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delivery_status_at TIMESTAMPTZ;

ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_status_check;
ALTER TABLE quotes ADD CONSTRAINT quotes_status_check
  CHECK (status IN ('received', 'sent', 'failed', 'no_number'));

CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);

-- voice_calls: reconstruction was missing contact linkage + a few
-- call-log fields the /voice page and post-call n8n workflow write.
ALTER TABLE voice_calls
  ADD COLUMN IF NOT EXISTS contact_id       UUID REFERENCES contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS customer_name    TEXT,
  ADD COLUMN IF NOT EXISTS language_used    TEXT,
  ADD COLUMN IF NOT EXISTS escalated_to_ops BOOLEAN,
  ADD COLUMN IF NOT EXISTS cost_usd         NUMERIC(10,4);

-- leads.sla_alert_sent (054_voice_agent_extensions.sql) never landed —
-- needed by the SLA watchdog endpoint (/api/n8n/voice/stale-leads).
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS sla_alert_sent BOOLEAN NOT NULL DEFAULT FALSE;
