-- University club guest fee: let a member skip Stripe and pay a guest fee
-- (plus the rest of the booking total) at the front desk instead. Independent
-- of post-play settlement — no roster, no saved-card auto-charge, just a
-- manual "collected" flag staff can set once the fee is paid at the desk.
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS front_desk_amount_due_cents INTEGER,
  ADD COLUMN IF NOT EXISTS front_desk_collected_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS front_desk_collected_by UUID REFERENCES users(id);

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_payment_mode_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_payment_mode_check
  CHECK (payment_mode IN ('single_payer', 'split', 'front_desk'));

-- Explicitly seed the new flag as disabled for every existing club. New clubs
-- remain disabled because feature flags default to false when no row exists.
INSERT INTO facility_features (facility_id, feature_key, is_enabled, updated_at)
SELECT id, 'university_club_guest_fee', false, NOW()
FROM facilities
ON CONFLICT (facility_id, feature_key) DO NOTHING;
