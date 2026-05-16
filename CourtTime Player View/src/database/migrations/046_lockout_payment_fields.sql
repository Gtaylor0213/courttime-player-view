-- Migration 046: Add payment amount/description to lockout so the member can see what they owe
-- and the server can generate a Stripe checkout session for it.

ALTER TABLE facility_memberships
  ADD COLUMN IF NOT EXISTS lockout_amount_cents INTEGER CHECK (lockout_amount_cents IS NULL OR lockout_amount_cents > 0),
  ADD COLUMN IF NOT EXISTS lockout_description  TEXT;
