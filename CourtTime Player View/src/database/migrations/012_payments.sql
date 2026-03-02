-- Migration 012: Payment system (Stripe integration, promo codes, subscriptions)

-- Promo codes table
CREATE TABLE IF NOT EXISTS promo_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) NOT NULL UNIQUE,
  description TEXT,
  discount_type VARCHAR(20) NOT NULL DEFAULT 'full',  -- 'full' (100% off), 'percent', 'fixed'
  discount_value NUMERIC(10,2) DEFAULT 0,              -- percent (e.g. 100) or fixed dollar amount
  max_uses INTEGER DEFAULT NULL,                        -- NULL = unlimited
  current_uses INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  valid_from TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  valid_until TIMESTAMP DEFAULT NULL,                   -- NULL = no expiration
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Facility subscriptions table
CREATE TABLE IF NOT EXISTS facility_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id VARCHAR(255) NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  stripe_customer_id VARCHAR(255),
  stripe_checkout_session_id VARCHAR(255),
  plan_type VARCHAR(50) NOT NULL DEFAULT 'standard',    -- 'standard', 'custom'
  status VARCHAR(50) NOT NULL DEFAULT 'pending',         -- 'active', 'pending_payment', 'waived', 'custom_pending'
  amount_cents INTEGER NOT NULL DEFAULT 37500,            -- $375.00
  currency VARCHAR(10) DEFAULT 'usd',
  promo_code_used VARCHAR(50),
  court_count INTEGER NOT NULL DEFAULT 0,
  billing_period_start TIMESTAMP,
  billing_period_end TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(facility_id)
);

-- Payment history table
CREATE TABLE IF NOT EXISTS payment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id VARCHAR(255) NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES facility_subscriptions(id),
  stripe_payment_intent_id VARCHAR(255),
  stripe_invoice_id VARCHAR(255),
  amount_cents INTEGER NOT NULL,
  currency VARCHAR(10) DEFAULT 'usd',
  status VARCHAR(50) NOT NULL,                            -- 'succeeded', 'failed', 'pending', 'refunded'
  description TEXT,
  payment_method_type VARCHAR(50),                        -- 'card', 'promo_code'
  promo_code_used VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add payment_status column to facilities table
ALTER TABLE facilities ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50) DEFAULT 'pending';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_promo_codes_code ON promo_codes(code);
CREATE INDEX IF NOT EXISTS idx_facility_subscriptions_facility ON facility_subscriptions(facility_id);
CREATE INDEX IF NOT EXISTS idx_facility_subscriptions_stripe ON facility_subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_payment_history_facility ON payment_history(facility_id);

-- Seed a test promo code
INSERT INTO promo_codes (code, description, discount_type, discount_value, is_active)
VALUES ('COURTTIME100', 'Full discount - 100% off annual fee', 'full', 0, true)
ON CONFLICT (code) DO NOTHING;

-- Updated_at trigger for promo_codes
CREATE OR REPLACE FUNCTION update_promo_codes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_promo_codes_timestamp ON promo_codes;
CREATE TRIGGER update_promo_codes_timestamp
  BEFORE UPDATE ON promo_codes
  FOR EACH ROW
  EXECUTE FUNCTION update_promo_codes_updated_at();

-- Updated_at trigger for facility_subscriptions
CREATE OR REPLACE FUNCTION update_facility_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_facility_subscriptions_timestamp ON facility_subscriptions;
CREATE TRIGGER update_facility_subscriptions_timestamp
  BEFORE UPDATE ON facility_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_facility_subscriptions_updated_at();
