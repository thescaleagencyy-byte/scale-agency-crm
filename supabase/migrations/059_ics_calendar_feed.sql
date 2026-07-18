-- ============================================================
-- 059_ics_calendar_feed.sql — ICS calendar subscribe feed
--
-- Adds `ics_feed_token` to accounts: a random, revocable secret
-- that gates GET /api/appointments/ics/[token] (a public endpoint
-- returning upcoming appointments as an .ics feed a client owner
-- can subscribe to from Google/Apple Calendar).
--
-- Unlike the public status page (058, keyed on account_id — an
-- unguessable UUID but not treated as a secret), this feed exposes
-- customer names + appointment times, so it's gated on a dedicated
-- token instead of the account_id itself. Rotatable via
-- POST /api/appointments/ics/regenerate (owner/admin) without
-- affecting anything else account-scoped.
-- ============================================================

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS ics_feed_token UUID NOT NULL DEFAULT uuid_generate_v4();

CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_ics_feed_token ON accounts(ics_feed_token);

-- SECURITY DEFINER so the public feed route can read appointment rows
-- (name, time, status) for the matching account without an
-- authenticated session — same shape as get_public_status (058) and
-- peek_invitation, gated on knowledge of the token rather than RLS
-- membership. Only returns confirmed/pending appointments in a
-- [-1 day, +90 days] window — a calendar feed for what's actually
-- upcoming, not a full historical export.
CREATE OR REPLACE FUNCTION get_ics_feed(p_token UUID)
RETURNS TABLE (
  id UUID,
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  status TEXT,
  service_name TEXT,
  contact_name TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    ap.id,
    bs.start_at,
    bs.end_at,
    ap.status,
    svc.name AS service_name,
    c.name AS contact_name
  FROM accounts a
  JOIN appointments ap ON ap.account_id = a.id
  JOIN booking_slots bs ON bs.id = ap.slot_id
  LEFT JOIN booking_services svc ON svc.id = ap.service_id
  LEFT JOIN contacts c ON c.id = ap.contact_id
  WHERE a.ics_feed_token = p_token
    AND ap.status NOT IN ('cancelled', 'declined')
    AND bs.start_at BETWEEN NOW() - INTERVAL '1 day' AND NOW() + INTERVAL '90 days'
  ORDER BY bs.start_at;
$$;

GRANT EXECUTE ON FUNCTION get_ics_feed(UUID) TO anon, authenticated;

-- Owner/admin-only rotate. SECURITY DEFINER isn't needed here (the
-- caller already has an authenticated session and RLS covers the
-- UPDATE), but the RPC gives the API route a single atomic
-- "generate + return the new token" call.
CREATE OR REPLACE FUNCTION regenerate_ics_feed_token(p_account_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  new_token UUID := uuid_generate_v4();
BEGIN
  UPDATE accounts SET ics_feed_token = new_token WHERE id = p_account_id;
  RETURN new_token;
END;
$$;

GRANT EXECUTE ON FUNCTION regenerate_ics_feed_token(UUID) TO authenticated;
