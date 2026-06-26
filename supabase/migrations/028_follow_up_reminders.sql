-- Follow-up reminders for leads and contacts
CREATE TABLE IF NOT EXISTS follow_up_reminders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('lead', 'contact', 'deal')),
  entity_id UUID NOT NULL,
  due_at TIMESTAMPTZ NOT NULL,
  note TEXT,
  is_done BOOLEAN NOT NULL DEFAULT FALSE,
  done_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reminders_account ON follow_up_reminders(account_id, due_at) WHERE is_done = FALSE;
CREATE INDEX IF NOT EXISTS idx_reminders_user ON follow_up_reminders(user_id, due_at) WHERE is_done = FALSE;

ALTER TABLE follow_up_reminders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Account members can manage reminders" ON follow_up_reminders;
CREATE POLICY "Account members can manage reminders" ON follow_up_reminders FOR ALL
  USING (account_id IN (SELECT account_id FROM profiles WHERE user_id = auth.uid()));

DROP TRIGGER IF EXISTS set_updated_at ON follow_up_reminders;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON follow_up_reminders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
