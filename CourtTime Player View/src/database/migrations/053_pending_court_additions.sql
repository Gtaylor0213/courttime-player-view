-- Pending court additions awaiting one-time platform payment
CREATE TABLE IF NOT EXISTS pending_court_additions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id VARCHAR(255) NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  stripe_checkout_session_id TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PAID', 'EXPIRED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finalized_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pending_court_additions_facility
  ON pending_court_additions(facility_id);

CREATE INDEX IF NOT EXISTS idx_pending_court_additions_session
  ON pending_court_additions(stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;
