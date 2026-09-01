-- n8n_message_dedupe (071) shipped with no RLS — the only table out
-- of ~65 missing it. Every access goes through /api/n8n/dedupe using
-- the service-role client, which bypasses RLS anyway, so this is a
-- direct-PostgREST-path lockdown, not a functional change: no
-- policies means only service_role can touch the table by default.
alter table n8n_message_dedupe enable row level security;
