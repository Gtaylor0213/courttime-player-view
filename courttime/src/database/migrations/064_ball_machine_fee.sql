-- Migration 064: Ball machine fee per court
-- Clubs can charge an hourly ball machine fee when a member adds a ball machine to their booking.
-- ball_machine_fee_cents is independent of require_payment (a free-booking court can still charge for ball machine).

ALTER TABLE courts
  ADD COLUMN IF NOT EXISTS ball_machine_fee_cents INTEGER
    CHECK (ball_machine_fee_cents IS NULL OR ball_machine_fee_cents > 0);

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS add_ball_machine BOOLEAN NOT NULL DEFAULT false;
