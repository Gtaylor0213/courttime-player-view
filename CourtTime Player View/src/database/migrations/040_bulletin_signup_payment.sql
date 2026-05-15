-- Migration 040: Require card payment on bulletin event signup (Stripe Connect)

ALTER TABLE bulletin_posts
  ADD COLUMN IF NOT EXISTS require_payment BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS signup_amount_cents INTEGER
    CHECK (signup_amount_cents IS NULL OR signup_amount_cents > 0);

ALTER TABLE bulletin_drill_signups
  ADD COLUMN IF NOT EXISTS connect_payment_id VARCHAR(64) REFERENCES connect_payments(id) ON DELETE SET NULL;

-- Signup payments are one-off checkouts tied to a bulletin post, not a catalog item.
ALTER TABLE connect_payments
  ALTER COLUMN payment_item_id DROP NOT NULL;

ALTER TABLE connect_payments
  ADD COLUMN IF NOT EXISTS bulletin_post_id UUID REFERENCES bulletin_posts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_connect_payments_bulletin_post
  ON connect_payments(bulletin_post_id)
  WHERE bulletin_post_id IS NOT NULL;
