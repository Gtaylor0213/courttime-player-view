-- Saved payment method per member per club (Stripe Connect customer on connected account)

ALTER TABLE facility_memberships
  ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS stripe_default_payment_method_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS card_brand VARCHAR(20),
  ADD COLUMN IF NOT EXISTS card_last4 VARCHAR(4),
  ADD COLUMN IF NOT EXISTS card_exp_month INTEGER,
  ADD COLUMN IF NOT EXISTS card_exp_year INTEGER;

CREATE INDEX IF NOT EXISTS idx_facility_memberships_stripe_customer
  ON facility_memberships(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;
