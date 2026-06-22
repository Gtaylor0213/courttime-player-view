-- Migration 058: CourtTime-Pickle org reporting revenue events
-- Categorizes franchise revenue for corporate dashboards (Phase 5).

CREATE TABLE IF NOT EXISTS pickle_revenue_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id VARCHAR(64) NOT NULL REFERENCES franchise_organizations(id) ON DELETE CASCADE,
  facility_id VARCHAR(50) REFERENCES facilities(id) ON DELETE SET NULL,
  category VARCHAR(30) NOT NULL CHECK (category IN (
    'memberships', 'pro_shop', 'academy', 'drop_in', 'private_events', 'sponsorships'
  )),
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  source_type VARCHAR(50),
  source_id VARCHAR(255),
  description TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pickle_revenue_events_org_occurred
  ON pickle_revenue_events(org_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_pickle_revenue_events_org_category
  ON pickle_revenue_events(org_id, category, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_pickle_revenue_events_facility
  ON pickle_revenue_events(facility_id, occurred_at DESC);

COMMENT ON TABLE pickle_revenue_events IS 'Org-level revenue ledger by category for CourtTime-Pickle reporting';
