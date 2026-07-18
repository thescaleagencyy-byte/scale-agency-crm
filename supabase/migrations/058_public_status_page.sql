-- ============================================================
-- 058_public_status_page.sql — Public status page (no auth)
--
-- SECURITY DEFINER RPC, same shape as peek_invitation (migration
-- referenced in src/app/api/invitations/[token]/peek/route.ts):
-- bypasses RLS deliberately, but returns a FIXED set of non-
-- sensitive fields only — never access_token, verify_token,
-- last_registration_error, or anything conversation/contact-level.
-- Anonymous callers get exactly this shape and nothing else.
-- ============================================================

CREATE OR REPLACE FUNCTION get_public_status(p_account_id UUID)
RETURNS JSON
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT json_build_object(
    'account_name', a.name,
    'whatsapp_connected', COALESCE(wc.status = 'connected', false),
    'quality_rating', wq.quality_rating,
    'last_activity_at', (
      SELECT MAX(c.last_message_at) FROM conversations c WHERE c.account_id = a.id
    )
  )
  FROM accounts a
  LEFT JOIN whatsapp_config wc ON wc.account_id = a.id
  LEFT JOIN LATERAL (
    SELECT quality_rating FROM wa_quality_history
    WHERE account_id = a.id
    ORDER BY recorded_at DESC
    LIMIT 1
  ) wq ON true
  WHERE a.id = p_account_id;
$$;

GRANT EXECUTE ON FUNCTION get_public_status(UUID) TO anon, authenticated;
