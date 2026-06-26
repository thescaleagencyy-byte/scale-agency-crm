-- 032_lead_source_attribution.sql
-- Track where leads and contacts came from.

alter table leads add column if not exists source text;
alter table contacts add column if not exists source text;

-- source values: 'whatsapp_link' | 'qr_code' | 'broadcast' | 'chatbot' | 'referral' | 'website' | 'manual' | 'other'
