-- Migration 042: Guest fee per court
-- Clubs can charge a guest fee when a member brings a non-member guest.
-- guest_fee_cents is independent of require_payment (a free-booking court can still charge a guest fee).

ALTER TABLE courts
  ADD COLUMN IF NOT EXISTS guest_fee_cents INTEGER
    CHECK (guest_fee_cents IS NULL OR guest_fee_cents > 0);

-- Track whether the booking included a guest so admins can see it.
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS bring_guest BOOLEAN NOT NULL DEFAULT false;
