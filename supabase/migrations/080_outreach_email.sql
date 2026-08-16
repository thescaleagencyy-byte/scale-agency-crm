-- 080_outreach_email.sql
-- Cold email outreach: prospect list + multi-step send sequences,
-- rate-limited and sent via the account's own connected Gmail
-- (see integrations table, service='gmail'). Mirrors the
-- drip_campaigns/drip_steps/drip_enrollments shape from 030 almost
-- 1:1 (same next_send_at-driven cron-drain pattern), swapping a
-- WhatsApp template send for an email send, plus the extras cold
-- email actually needs that WhatsApp drip doesn't: a suppression
-- list (unsubscribe/bounce) checked before every send, and a send
-- log used both as an audit trail and as the source of truth for
-- each sequence's daily send cap.
--
-- Deliberately NOT built on leads/contacts: leads.email doesn't
-- exist (leads are WhatsApp-only) and contacts.email is unenforced.
-- Cold-email prospects are new, uncontacted people, not existing
-- WhatsApp contacts — keeping them in their own table means this
-- migration touches zero existing rows/tables.

CREATE TABLE IF NOT EXISTS outreach_prospects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  company TEXT,
  source TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'unsubscribed', 'bounced')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- email is stored already-lowercased by every write path (app layer) so
-- this can be a plain column index, not an expression index — a plain
-- unique constraint is what upsert(...).onConflict('account_id,email')
-- requires to target ON CONFLICT correctly.
CREATE UNIQUE INDEX IF NOT EXISTS idx_outreach_prospects_account_email ON outreach_prospects(account_id, email);
CREATE INDEX IF NOT EXISTS idx_outreach_prospects_account ON outreach_prospects(account_id);

ALTER TABLE outreach_prospects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Account members can manage outreach prospects" ON outreach_prospects;
CREATE POLICY "Account members can manage outreach prospects" ON outreach_prospects FOR ALL
  USING (account_id IN (SELECT account_id FROM profiles WHERE user_id = auth.uid()));

DROP TRIGGER IF EXISTS set_updated_at ON outreach_prospects;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON outreach_prospects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Sequences: cap/send-window live per-sequence, mirrors drip_campaigns
-- being self-contained.
CREATE TABLE IF NOT EXISTS outreach_sequences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'archived')),
  daily_cap INTEGER NOT NULL DEFAULT 30,
  send_window_start_hour INTEGER NOT NULL DEFAULT 9,
  send_window_end_hour INTEGER NOT NULL DEFAULT 18,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outreach_sequences_account ON outreach_sequences(account_id);

ALTER TABLE outreach_sequences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Account members can manage outreach sequences" ON outreach_sequences;
CREATE POLICY "Account members can manage outreach sequences" ON outreach_sequences FOR ALL
  USING (account_id IN (SELECT account_id FROM profiles WHERE user_id = auth.uid()));

DROP TRIGGER IF EXISTS set_updated_at ON outreach_sequences;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON outreach_sequences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Steps within a sequence
CREATE TABLE IF NOT EXISTS outreach_steps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sequence_id UUID NOT NULL REFERENCES outreach_sequences(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  delay_days INTEGER NOT NULL DEFAULT 0,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(sequence_id, position)
);

CREATE INDEX IF NOT EXISTS idx_outreach_steps_sequence ON outreach_steps(sequence_id, position);

ALTER TABLE outreach_steps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Account members can manage outreach steps" ON outreach_steps;
CREATE POLICY "Account members can manage outreach steps" ON outreach_steps FOR ALL
  USING (sequence_id IN (
    SELECT id FROM outreach_sequences
    WHERE account_id IN (SELECT account_id FROM profiles WHERE user_id = auth.uid())
  ));

-- Enrollments: one row per prospect per sequence
CREATE TABLE IF NOT EXISTS outreach_enrollments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sequence_id UUID NOT NULL REFERENCES outreach_sequences(id) ON DELETE CASCADE,
  prospect_id UUID NOT NULL REFERENCES outreach_prospects(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  current_step INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'unsubscribed', 'bounced', 'replied', 'failed')),
  enrolled_at TIMESTAMPTZ DEFAULT NOW(),
  next_send_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  UNIQUE(sequence_id, prospect_id)
);

CREATE INDEX IF NOT EXISTS idx_outreach_enrollments_next ON outreach_enrollments(next_send_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_outreach_enrollments_sequence ON outreach_enrollments(sequence_id);

ALTER TABLE outreach_enrollments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Account members can manage outreach enrollments" ON outreach_enrollments;
CREATE POLICY "Account members can manage outreach enrollments" ON outreach_enrollments FOR ALL
  USING (account_id IN (SELECT account_id FROM profiles WHERE user_id = auth.uid()));

-- Send log: audit trail + source of truth for each sequence's daily cap
-- (count sends today per account/sequence rather than trusting an
-- in-memory counter, since the cron can run as multiple invocations).
CREATE TABLE IF NOT EXISTS outreach_sends (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  enrollment_id UUID NOT NULL REFERENCES outreach_enrollments(id) ON DELETE CASCADE,
  step_id UUID REFERENCES outreach_steps(id) ON DELETE SET NULL,
  prospect_id UUID NOT NULL REFERENCES outreach_prospects(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  sequence_id UUID NOT NULL REFERENCES outreach_sequences(id) ON DELETE CASCADE,
  subject TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed')),
  error_message TEXT,
  message_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outreach_sends_account_date ON outreach_sends(account_id, sequence_id, sent_at);

ALTER TABLE outreach_sends ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Account members can manage outreach sends" ON outreach_sends;
CREATE POLICY "Account members can manage outreach sends" ON outreach_sends FOR ALL
  USING (account_id IN (SELECT account_id FROM profiles WHERE user_id = auth.uid()));

-- Suppression list: unsubscribes/bounces/complaints, checked before
-- every send regardless of enrollment status (a prospect can be
-- suppressed globally without touching every enrollment row).
CREATE TABLE IF NOT EXISTS outreach_suppressions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('unsubscribed', 'bounced', 'complained', 'manual')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- plain column index, same reasoning as outreach_prospects above.
CREATE UNIQUE INDEX IF NOT EXISTS idx_outreach_suppressions_account_email ON outreach_suppressions(account_id, email);

ALTER TABLE outreach_suppressions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Account members can manage outreach suppressions" ON outreach_suppressions;
CREATE POLICY "Account members can manage outreach suppressions" ON outreach_suppressions FOR ALL
  USING (account_id IN (SELECT account_id FROM profiles WHERE user_id = auth.uid()));
