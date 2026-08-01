-- ============================================================
-- 050_quotes.sql
--
-- Quote delivery log for the Outlook → WhatsApp quote automation
-- (n8n workflow "AshWheelz Prime - Outlook Quote to WhatsApp").
-- Each row is one quote email the automation picked up: who it was
-- for, which salesperson sent it, the PDF, and whether the WhatsApp
-- template send succeeded.
--
-- Rows are written ONLY by the n8n ingest endpoint
-- (/api/n8n/quote, service role). Dashboard users read them on the
-- /quotes page and can update status manually if needed.
--
-- Statuses mirror the workflow's terminal branches:
--   sent       — template message accepted by Meta (wa_message_id set)
--   failed     — media upload or send call returned an error
--   no_number  — PDF found but no WhatsApp number extracted from email
--   received   — ingested, outcome unknown (defensive default)
--
-- PDFs live in the private `quote-pdfs` storage bucket, path:
--   quote-pdfs/account-<account_id>/<timestamp>-<filename>.pdf
-- Bucket is PRIVATE (quotes are commercially sensitive); dashboard
-- reads use signed URLs via the account-member SELECT policy.
--
-- Idempotent — safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS quotes (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id       UUID        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  customer_name    TEXT,
  customer_phone   TEXT,
  company          TEXT,
  email_subject    TEXT,
  sender_email     TEXT,
  pdf_filename     TEXT,
  pdf_path         TEXT,
  status           TEXT        NOT NULL DEFAULT 'received'
                               CHECK (status IN ('received', 'sent', 'failed', 'no_number')),
  wa_message_id    TEXT,
  media_id         TEXT,
  error_detail     TEXT,
  contact_id       UUID        REFERENCES contacts(id) ON DELETE SET NULL,
  conversation_id  UUID        REFERENCES conversations(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quotes_account    ON quotes(account_id);
CREATE INDEX IF NOT EXISTS idx_quotes_status     ON quotes(status);
CREATE INDEX IF NOT EXISTS idx_quotes_phone      ON quotes(customer_phone);
CREATE INDEX IF NOT EXISTS idx_quotes_created_at ON quotes(created_at);

-- This project's default privileges don't auto-grant to the API roles
-- (discovered live: PostgREST returned 42501 without this).
GRANT ALL ON public.quotes TO anon, authenticated, service_role;

ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Account members can manage quotes" ON quotes;
CREATE POLICY "Account members can manage quotes" ON quotes FOR ALL
  USING (account_id IN (
    SELECT account_id FROM profiles WHERE user_id = auth.uid()
  ));

-- ============================================================
-- quote-pdfs storage bucket — PRIVATE, PDF only.
-- 16 MB cap to match chat-media (Vercel route body cap of ~4.5 MB
-- is the practical limit anyway; oversized PDFs log a row with no
-- file rather than failing the ingest).
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'quote-pdfs',
  'quote-pdfs',
  FALSE,
  16777216,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Reads: account members only (signed URLs from the dashboard).
-- Writes: none for regular users — the ingest endpoint uses the
-- service role, which bypasses RLS.
DROP POLICY IF EXISTS "Members can read quote pdfs" ON storage.objects;
CREATE POLICY "Members can read quote pdfs"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'quote-pdfs'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND ('account-' || p.account_id::text) = (storage.foldername(name))[1]
    )
  );
