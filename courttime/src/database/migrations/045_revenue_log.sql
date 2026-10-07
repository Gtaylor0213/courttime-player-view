-- Migration 045: Facility revenue log
-- Tracks every successful payment (member→club via Stripe Connect and platform subscriptions)
-- so the admin dashboard can show real revenue totals.

CREATE TABLE IF NOT EXISTS facility_revenue_log (
  id            VARCHAR(64) PRIMARY KEY DEFAULT replace(gen_random_uuid()::text, '-', ''),
  facility_id   VARCHAR(50) NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  amount_cents  INTEGER NOT NULL CHECK (amount_cents >= 0),
  payment_type  VARCHAR(30) NOT NULL CHECK (payment_type IN (
                  'COURT_BOOKING', 'BULLETIN_SIGNUP', 'PAYMENT_ITEM',
                  'GUEST_FEE', 'PLATFORM_SUBSCRIPTION'
                )),
  source_id     VARCHAR(255),
  source_type   VARCHAR(30) NOT NULL CHECK (source_type IN ('connect_payment', 'platform_invoice')),
  member_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  paid_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_revenue_log_facility_paid
  ON facility_revenue_log(facility_id, paid_at DESC);

CREATE INDEX IF NOT EXISTS idx_revenue_log_source
  ON facility_revenue_log(source_id, source_type);
