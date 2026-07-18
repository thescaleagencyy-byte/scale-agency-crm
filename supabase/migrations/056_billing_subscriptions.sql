-- ============================================================
-- 050_billing_subscriptions.sql — Billing plumbing (Stripe-ready)
--
-- Adds `subscriptions` (one row per account — the account's current
-- plan) and `invoices` (billing history). No Stripe calls happen in
-- this migration; the stripe_* columns are nullable and populated
-- once real API keys are wired up in the app layer. Until then,
-- accounts read as "no subscription" (free/unset) rather than
-- erroring — same "gracefully degraded" pattern as OPENAI_API_KEY
-- being unset for AI features.
--
-- RLS mirrors brand_config (047): any account member can read/write
-- via is_account_member(); the API layer (requireRole('owner')) is
-- what actually restricts billing changes to the account owner, same
-- division of responsibility as the rest of the settings tables.
-- ============================================================

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
  plan_name TEXT NOT NULL DEFAULT 'free',
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  billing_interval TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_interval IN ('monthly', 'yearly')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('trialing', 'active', 'past_due', 'canceled')),
  current_period_end TIMESTAMPTZ,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS subscriptions_policy ON subscriptions;
CREATE POLICY subscriptions_policy ON subscriptions FOR ALL
  USING (is_account_member(account_id));

CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  amount NUMERIC(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('paid', 'pending', 'failed')),
  stripe_invoice_id TEXT,
  issued_at TIMESTAMPTZ DEFAULT NOW(),
  paid_at TIMESTAMPTZ
);
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS invoices_policy ON invoices;
CREATE POLICY invoices_policy ON invoices FOR ALL
  USING (is_account_member(account_id));

CREATE INDEX IF NOT EXISTS idx_invoices_account ON invoices(account_id);

-- One free-tier subscription row per existing account, so every
-- account has a row to read instead of the UI having to special-case
-- "no subscription yet" for accounts that predate this migration.
INSERT INTO subscriptions (account_id, plan_name, amount, status)
SELECT id, 'free', 0, 'active' FROM accounts
ON CONFLICT (account_id) DO NOTHING;
