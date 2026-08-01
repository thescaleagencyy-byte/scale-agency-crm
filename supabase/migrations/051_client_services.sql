-- ============================================================
-- 051 — Client services catalog with availability toggles.
--
-- Mirrors the Sultan dashboard "menu items" pattern: the client
-- lists what they offer, grouped by category, and flips items
-- available/unavailable from the dashboard. n8n reads the list
-- via /api/n8n/services so the WhatsApp bot only offers what is
-- actually rentable right now.
--
-- RLS: every member can read; admin+ mutates (matches the
-- "owner & support team manage it" requirement — client staff
-- with agent/viewer roles see it read-only).
-- ============================================================

CREATE TABLE IF NOT EXISTS client_services (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  category    TEXT NOT NULL,
  name        TEXT NOT NULL,
  spec        TEXT,
  available   BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_services_account
  ON client_services(account_id, category, sort_order);

DROP TRIGGER IF EXISTS set_updated_at ON client_services;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON client_services
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS governs row visibility, but the roles still need table-level
-- privileges (bit us on first deploy: "permission denied for table").
GRANT SELECT, INSERT, UPDATE, DELETE ON client_services TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON client_services TO service_role;

ALTER TABLE client_services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_services_select ON client_services;
CREATE POLICY client_services_select ON client_services FOR SELECT
  USING (is_account_member(account_id, 'viewer'));

DROP POLICY IF EXISTS client_services_insert ON client_services;
CREATE POLICY client_services_insert ON client_services FOR INSERT
  WITH CHECK (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS client_services_update ON client_services;
CREATE POLICY client_services_update ON client_services FOR UPDATE
  USING (is_account_member(account_id, 'admin'))
  WITH CHECK (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS client_services_delete ON client_services;
CREATE POLICY client_services_delete ON client_services FOR DELETE
  USING (is_account_member(account_id, 'admin'));
