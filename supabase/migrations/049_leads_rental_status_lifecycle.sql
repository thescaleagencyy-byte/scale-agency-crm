-- ============================================================
-- Leads status lifecycle: widen to support rental-specific stages
-- alongside the generic ones.
--
-- The generic new/called/won/lost pipeline collapses "quote sent"
-- and "customer confirmed and equipment is out on site" into a
-- single 'won' bucket — a rental business needs that distinction
-- (an active on-site rental behaves very differently from a closed
-- deal). Values are additive, not a replacement: 'called'/'won'
-- stay valid so any other deployment of this template keeps working
-- unchanged. `src/app/(dashboard)/leads/page.tsx` picks which subset
-- to show based on NEXT_PUBLIC_CLIENT_INDUSTRY.
--
-- Existing AshWheelz rows are backfilled so the deployment actually
-- switches onto the new stages instead of sitting on stale values:
--   called -> quoted    (agent made contact, gave a quote)
--   won    -> confirmed (customer accepted; not necessarily
--                         returned yet)
-- ============================================================

ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_status_check;

ALTER TABLE leads ADD CONSTRAINT leads_status_check
  CHECK (status IN ('new', 'called', 'quoted', 'confirmed', 'on_rent', 'returned', 'won', 'lost'));

-- Deployment-specific backfill — safe no-op on any install that has
-- no 'called'/'won' rows using the rental industry branch.
UPDATE leads SET status = 'quoted'    WHERE status = 'called';
UPDATE leads SET status = 'confirmed' WHERE status = 'won';
