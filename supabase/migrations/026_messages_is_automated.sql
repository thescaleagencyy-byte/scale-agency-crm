-- Flag messages sent by n8n automations so the inbox can badge them.
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS is_automated BOOLEAN NOT NULL DEFAULT FALSE;
