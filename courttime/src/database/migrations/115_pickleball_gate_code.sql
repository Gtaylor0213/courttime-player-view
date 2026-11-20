-- Migration: per-facility pickleball gate code for booking confirmation emails.
-- Gated behind the 'glen_abbey_pickleball_gate_code' feature flag (facility_features).
-- When the flag is on and a code is set, the booking confirmation email shows a
-- "Gate Code:" line directly under the Court line.

ALTER TABLE facilities
    ADD COLUMN IF NOT EXISTS pickleball_gate_code VARCHAR(64);
