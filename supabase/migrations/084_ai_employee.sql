-- ============================================================
-- 084_ai_employee.sql — AI Employee: self-serve ordering/booking agent
--
-- The actual product shift, not another alert on top of the CRM.
-- Every paying client (Sultan, Qissah, AshWheelz) needed the same
-- bespoke thing: an AI that handles the WHOLE WhatsApp conversation
-- end-to-end — answers questions, takes orders, confirms, escalates
-- only when it can't. This productizes that into a config any account
-- can turn on for itself, no developer required.
--
-- `catalog_items` — the menu/service list the agent sells from.
-- `ai_employee_config` — one row per account, opt-in (`enabled`),
-- mirrors every other feature's settings shape this week.
-- `bot_orders` — orders the agent itself confirmed. Status is
-- deliberately narrow (`confirmed`/`cancelled`) — there's no
-- `pending` state because the agent only ever writes a row once the
-- customer has actually confirmed; anything short of that stays as
-- plain conversation, not a half-order record.
--
-- Deliberately does NOT add an escalation column to `conversations` —
-- reuses the existing `status` CHECK ('open'/'pending'/'closed').
-- Setting it to 'pending' on escalate means a conversation the agent
-- can't handle shows up exactly where a human agent already looks for
-- "needs attention" conversations, and the agent simply stops
-- responding to any conversation that isn't 'open' — no new signal
-- to wire into the inbox UI.
-- ============================================================

CREATE TABLE IF NOT EXISTS catalog_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  category TEXT,
  available BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE catalog_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS catalog_items_policy ON catalog_items;
CREATE POLICY catalog_items_policy ON catalog_items FOR ALL
  USING (is_account_member(account_id));
CREATE INDEX IF NOT EXISTS idx_catalog_items_account ON catalog_items(account_id);

CREATE TABLE IF NOT EXISTS ai_employee_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  business_type TEXT NOT NULL DEFAULT 'general' CHECK (business_type IN ('restaurant', 'clinic', 'retail', 'services', 'general')),
  greeting_message TEXT,
  policies TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE ai_employee_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_employee_config_policy ON ai_employee_config;
CREATE POLICY ai_employee_config_policy ON ai_employee_config FOR ALL
  USING (is_account_member(account_id));

CREATE TABLE IF NOT EXISTS bot_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  items JSONB NOT NULL,
  total NUMERIC(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE bot_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bot_orders_policy ON bot_orders;
CREATE POLICY bot_orders_policy ON bot_orders FOR ALL
  USING (is_account_member(account_id));
CREATE INDEX IF NOT EXISTS idx_bot_orders_account ON bot_orders(account_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON catalog_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ai_employee_config TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON bot_orders TO authenticated;

NOTIFY pgrst, 'reload schema';
