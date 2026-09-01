-- 079_leads_ai_triage.sql
-- The existing `score`/`score_factors` columns are a dumb points system
-- (has_name +10, has_company +25, etc) — confirmed during the 2026-08-16
-- audit to badly misjudge real leads: a lawyer who explicitly asked for
-- a callback scored the same 10 points as spam/prank messages, because
-- neither had a `company` value. Real intent only showed up by reading
-- the actual conversation text.
--
-- Adds AI-computed triage fields alongside (not replacing) the existing
-- score, so the CRM can show a real quality signal without losing the
-- deterministic scoring already in place. Nullable/one-way-fillable —
-- a lead a human hasn't triaged yet just shows nothing, not a fabricated
-- default.

alter table leads
  add column if not exists ai_quality text check (ai_quality in ('hot', 'warm', 'cold')),
  add column if not exists ai_summary text,
  add column if not exists ai_triaged_at timestamptz;
