-- Migration 015: Add Stripe subscription columns for recurring billing

-- Add subscription tracking columns to facility_subscriptions
ALTER TABLE facility_subscriptions ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(255);
ALTER TABLE facility_subscriptions ADD COLUMN IF NOT EXISTS stripe_price_id VARCHAR(255);
ALTER TABLE facility_subscriptions ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN DEFAULT false;
ALTER TABLE facility_subscriptions ADD COLUMN IF NOT EXISTS current_period_start TIMESTAMP;
ALTER TABLE facility_subscriptions ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMP;

-- Add is_internal flag to promo_codes (marks codes like COURTTIME-INTERNAL that need forever coupons)
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS is_internal BOOLEAN DEFAULT false;

-- Mark existing internal promo code
UPDATE promo_codes SET is_internal = true WHERE LOWER(TRIM(code)) = 'courttime-internal';

-- Index for Stripe subscription lookup
CREATE INDEX IF NOT EXISTS idx_facility_subscriptions_stripe_sub ON facility_subscriptions(stripe_subscription_id);
