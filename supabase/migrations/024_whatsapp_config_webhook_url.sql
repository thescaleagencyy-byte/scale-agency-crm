-- Allow accounts to save a custom webhook callback URL.
-- When NULL the UI falls back to {origin}/api/whatsapp/webhook.
ALTER TABLE whatsapp_config
  ADD COLUMN IF NOT EXISTS webhook_url TEXT;
