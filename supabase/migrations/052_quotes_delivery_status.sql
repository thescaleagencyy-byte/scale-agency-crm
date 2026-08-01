-- ============================================================
-- 051_quotes_delivery_status.sql
--
-- Adds real delivery-truth tracking to the quotes log. Until now
-- `status = 'sent'` only meant "Meta's synchronous API call returned
-- accepted" — it said nothing about whether the message actually
-- reached the customer. A send can be accepted and then fail
-- asynchronously (e.g. error 131042, payment issue) with no change
-- to this row. The dashboard "Delivered on WhatsApp" tile was reading
-- that fake signal.
--
-- delivery_status is populated by the async Meta status webhook
-- (forwarded from the "AshWheelz FINAL V5" n8n workflow, which owns
-- the WABA's one webhook callback) via POST /api/n8n/quote/status,
-- keyed on wa_message_id. Values mirror Meta's webhook `status` field:
--   sent      — Meta accepted it for delivery
--   delivered — reached the customer's device
--   read      — customer opened it
--   failed    — async delivery failure (e.g. 131042)
-- NULL means no webhook has arrived yet for this message.
--
-- Idempotent — safe to re-run.
-- ============================================================

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS delivery_status TEXT
  CHECK (delivery_status IN ('sent', 'delivered', 'read', 'failed'));
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS delivery_status_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_quotes_wa_message_id ON quotes(wa_message_id);
