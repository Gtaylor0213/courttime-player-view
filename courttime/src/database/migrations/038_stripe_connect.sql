-- Migration 038: Stripe Connect for member-to-club payments
--
-- This is a NEW feature on top of the existing Stripe subscription billing.
-- It does NOT touch promo_codes, facility_subscriptions, or payment_history.
--
-- Note: This project uses raw SQL migrations (not Prisma). The "Club" concept
-- in the product spec maps to the existing "facilities" table here.

-- =====================================================
-- 1. Extend facilities (the "Club" model) with Connect fields
-- =====================================================
ALTER TABLE facilities
  ADD COLUMN IF NOT EXISTS stripe_account_id     VARCHAR(255),
  ADD COLUMN IF NOT EXISTS stripe_onboarded      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS platform_fee_percent  NUMERIC(5,2) NOT NULL DEFAULT 1.5;

CREATE INDEX IF NOT EXISTS idx_facilities_stripe_account
  ON facilities(stripe_account_id);

-- =====================================================
-- 2. PaymentItem — things a club admin lets members pay for
--    (ball machine time, clinics, drills, dues, etc.)
-- =====================================================
CREATE TABLE IF NOT EXISTS payment_items (
  id                  VARCHAR(64) PRIMARY KEY DEFAULT replace(gen_random_uuid()::text, '-', ''),
  club_id             VARCHAR(50) NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  name                VARCHAR(255) NOT NULL,
  description         TEXT,
  amount_cents        INTEGER NOT NULL CHECK (amount_cents > 0),
  category            VARCHAR(20) NOT NULL CHECK (category IN ('BALL_MACHINE','CLINIC','DRILL','DUES','OTHER')),
  is_recurring        BOOLEAN NOT NULL DEFAULT false,
  recurring_interval  VARCHAR(10) CHECK (recurring_interval IN ('month','year')),
  stripe_price_id     VARCHAR(255),
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT recurring_requires_interval
    CHECK (is_recurring = false OR recurring_interval IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_payment_items_club_active
  ON payment_items(club_id, is_active);

CREATE TRIGGER update_payment_items_updated_at
  BEFORE UPDATE ON payment_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 3. Payment — a single member-to-club transaction recorded via Connect
--    (kept fully separate from existing payment_history table, which is for
--    the platform's annual subscription billing.)
-- =====================================================
CREATE TABLE IF NOT EXISTS connect_payments (
  id                            VARCHAR(64) PRIMARY KEY DEFAULT replace(gen_random_uuid()::text, '-', ''),
  club_id                       VARCHAR(50) NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  member_id                     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payment_item_id               VARCHAR(64) NOT NULL REFERENCES payment_items(id) ON DELETE RESTRICT,
  amount_cents                  INTEGER NOT NULL,
  platform_fee_cents            INTEGER NOT NULL DEFAULT 0,
  status                        VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                                  CHECK (status IN ('PENDING','PAID','FAILED','REFUNDED')),
  stripe_payment_intent_id      VARCHAR(255),
  stripe_checkout_session_id    VARCHAR(255),
  paid_at                       TIMESTAMP,
  created_at                    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_connect_payments_club ON connect_payments(club_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_connect_payments_member ON connect_payments(member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_connect_payments_session
  ON connect_payments(stripe_checkout_session_id);
