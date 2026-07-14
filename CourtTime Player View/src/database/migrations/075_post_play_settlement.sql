-- Post-play settlement: reserve now, staff close-out charges members after play.
-- Gated by facility feature flag post_play_settlement (default OFF).

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS settlement_status VARCHAR(30) NOT NULL DEFAULT 'not_applicable'
    CHECK (settlement_status IN (
      'not_applicable',
      'unsettled',
      'settling',
      'settled',
      'cancelled_unpaid'
    )),
  ADD COLUMN IF NOT EXISTS settled_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS settled_by UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_settlement_status
  ON bookings(facility_id, settlement_status)
  WHERE settlement_status IN ('unsettled', 'settling');

CREATE TABLE IF NOT EXISTS booking_participants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_by UUID REFERENCES users(id) ON DELETE SET NULL,
  added_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (booking_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_booking_participants_booking
  ON booking_participants(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_participants_user
  ON booking_participants(user_id);

CREATE TABLE IF NOT EXISTS booking_settlement_charges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'charged', 'failed', 'cash', 'waived')),
  stripe_payment_intent_id VARCHAR(255),
  error_message TEXT,
  resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (booking_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_booking_settlement_charges_booking
  ON booking_settlement_charges(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_settlement_charges_status
  ON booking_settlement_charges(booking_id, status);

ALTER TABLE IF EXISTS public.booking_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.booking_settlement_charges ENABLE ROW LEVEL SECURITY;
