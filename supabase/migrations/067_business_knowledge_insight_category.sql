-- 067_business_knowledge_insight_category.sql
-- Adds 'insight' as a valid business_knowledge category — auto-
-- generated win/loss patterns (lead source win rate, service type
-- win rate) computed deterministically from real lead data, not
-- written by hand like the rest of business_knowledge. This is the
-- "AI learns continuously" gap, scoped honestly: a pattern-mining
-- job you trigger (button, not background training), not an
-- actual model that retrains itself.

alter table business_knowledge drop constraint if exists business_knowledge_category_check;
alter table business_knowledge add constraint business_knowledge_category_check
  check (category in ('pricing', 'sop', 'policy', 'tone', 'products', 'team', 'goals', 'general', 'insight'));

notify pgrst, 'reload schema';
