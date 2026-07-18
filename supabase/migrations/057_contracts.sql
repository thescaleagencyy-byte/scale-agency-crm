-- ============================================================
-- 057_contracts.sql — Contract/e-sign plumbing
--
-- `contracts` tracks a document's lifecycle (draft → sent → signed
-- / declined) against a deal/contact. The file itself lives in a
-- new PRIVATE `contracts` Storage bucket — unlike flow-media/
-- chat-media (public, migrations 016/023), contracts carry signer
-- PII and a legal document, so reads go through a signed URL
-- (created server-side, short TTL) rather than a public URL.
--
-- No real e-signature provider is wired up (no DocuSign/Dropbox
-- Sign account exists yet) — `esign_provider`/`esign_document_id`
-- are nullable columns ready to receive that once Umer sets one up.
-- Until then, "signed" is set manually by whoever collects the
-- signature outside the app (e.g. a wet-ink scan uploaded back in).
-- ============================================================

CREATE TABLE IF NOT EXISTS contracts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  file_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'signed', 'declined')),
  signer_name TEXT,
  signer_email TEXT,
  esign_provider TEXT,
  esign_document_id TEXT,
  created_by UUID NOT NULL,
  sent_at TIMESTAMPTZ,
  signed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS contracts_policy ON contracts;
CREATE POLICY contracts_policy ON contracts FOR ALL
  USING (is_account_member(account_id));

CREATE INDEX IF NOT EXISTS idx_contracts_account ON contracts(account_id);
CREATE INDEX IF NOT EXISTS idx_contracts_deal ON contracts(deal_id);

-- ============================================================
-- STORAGE — private `contracts` bucket, account-scoped paths
-- (`account-<account_id>/...`, same convention as flow-media/
-- chat-media) but with `public = false`: no getPublicUrl reads,
-- only createSignedUrl through an authenticated API route.
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('contracts', 'contracts', false, 16777216)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Members can upload contracts" ON storage.objects;
CREATE POLICY "Members can upload contracts"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'contracts'
    AND is_account_member(replace(split_part(name, '/', 1), 'account-', '')::uuid)
  );

DROP POLICY IF EXISTS "Members can read their contracts" ON storage.objects;
CREATE POLICY "Members can read their contracts"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'contracts'
    AND is_account_member(replace(split_part(name, '/', 1), 'account-', '')::uuid)
  );

DROP POLICY IF EXISTS "Members can delete their contracts" ON storage.objects;
CREATE POLICY "Members can delete their contracts"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'contracts'
    AND is_account_member(replace(split_part(name, '/', 1), 'account-', '')::uuid)
  );
