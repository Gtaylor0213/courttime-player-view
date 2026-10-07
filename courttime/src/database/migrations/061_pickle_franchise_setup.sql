-- Migration 061: Franchise location setup status for CourtTime-Pickle operators

ALTER TABLE facilities
  ADD COLUMN IF NOT EXISTS setup_status VARCHAR(30) NOT NULL DEFAULT 'complete'
    CHECK (setup_status IN ('pending_setup', 'complete'));

CREATE INDEX IF NOT EXISTS idx_facilities_setup_status ON facilities(setup_status);

COMMENT ON COLUMN facilities.setup_status IS 'pending_setup = operator must complete franchise setup wizard; complete = location is operational';
