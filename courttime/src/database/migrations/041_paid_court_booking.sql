-- Migration 041: Paid court booking (Stripe Connect, payment before booking)

ALTER TABLE courts
  ADD COLUMN IF NOT EXISTS require_payment BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS booking_amount_cents INTEGER
    CHECK (booking_amount_cents IS NULL OR booking_amount_cents > 0);

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS connect_payment_id VARCHAR(64) REFERENCES connect_payments(id) ON DELETE SET NULL;

ALTER TABLE connect_payments
  ADD COLUMN IF NOT EXISTS pending_booking JSONB,
  ADD COLUMN IF NOT EXISTS booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_connect_payments_booking
  ON connect_payments(booking_id)
  WHERE booking_id IS NOT NULL;
