-- Split court payments: hold a paid reservation while each participating member pays.
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS payment_mode VARCHAR(20) NOT NULL DEFAULT 'single_payer'
    CHECK (payment_mode IN ('single_payer', 'split')),
  ADD COLUMN IF NOT EXISTS payment_deadline_at TIMESTAMP;

CREATE TABLE IF NOT EXISTS booking_payment_shares (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'failed', 'cancelled', 'refunded')),
  connect_payment_id UUID,
  stripe_checkout_session_id VARCHAR(255),
  paid_at TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (booking_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_booking_payment_shares_user_status
  ON booking_payment_shares(user_id, status);
CREATE INDEX IF NOT EXISTS idx_booking_payment_shares_booking
  ON booking_payment_shares(booking_id);

-- Explicitly seed the new flag as disabled for every existing club. New clubs
-- remain disabled because feature flags default to false when no row exists.
INSERT INTO facility_features (facility_id, feature_key, is_enabled, updated_at)
SELECT id, 'split_court_payments', false, NOW()
FROM facilities
ON CONFLICT (facility_id, feature_key) DO NOTHING;
