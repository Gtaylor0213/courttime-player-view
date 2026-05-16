-- Migration 044: Add payment lockout to facility_memberships
-- When is_payment_locked is true, the member is blocked from all app access
-- until payment is completed and an admin clears the lockout.

ALTER TABLE facility_memberships
  ADD COLUMN IF NOT EXISTS is_payment_locked BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS payment_locked_at TIMESTAMP;
