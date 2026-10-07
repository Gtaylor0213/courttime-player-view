-- Migration 016: Add trial_months to promo_codes and seed monthly trial codes

-- Add trial_months column (NULL means use existing discount logic, 0 = no trial)
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS trial_months INTEGER DEFAULT NULL;

-- Seed monthly free trial promo codes (1-12 months)
INSERT INTO promo_codes (code, description, discount_type, discount_value, trial_months, is_active)
VALUES
  ('TRIAL1MONTH', '1 month free trial', 'full', 0, 1, true),
  ('TRIAL2MONTHS', '2 months free trial', 'full', 0, 2, true),
  ('TRIAL3MONTHS', '3 months free trial', 'full', 0, 3, true),
  ('TRIAL4MONTHS', '4 months free trial', 'full', 0, 4, true),
  ('TRIAL5MONTHS', '5 months free trial', 'full', 0, 5, true),
  ('TRIAL6MONTHS', '6 months free trial', 'full', 0, 6, true),
  ('TRIAL7MONTHS', '7 months free trial', 'full', 0, 7, true),
  ('TRIAL8MONTHS', '8 months free trial', 'full', 0, 8, true),
  ('TRIAL9MONTHS', '9 months free trial', 'full', 0, 9, true),
  ('TRIAL10MONTHS', '10 months free trial', 'full', 0, 10, true),
  ('TRIAL11MONTHS', '11 months free trial', 'full', 0, 11, true),
  ('TRIAL12MONTHS', '12 months free trial (1 year)', 'full', 0, 12, true)
ON CONFLICT (code) DO NOTHING;
