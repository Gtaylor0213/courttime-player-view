-- Migration: Add contact and address information to users
-- This adds phone number and address fields collected during registration

-- Add phone number to users table
ALTER TABLE users
ADD COLUMN IF NOT EXISTS phone VARCHAR(20);

-- Add address fields to user_preferences table (or create separate address table)
-- Using user_preferences for simplicity since it's already 1:1 with users
ALTER TABLE user_preferences
ADD COLUMN IF NOT EXISTS street_address TEXT,
ADD COLUMN IF NOT EXISTS city VARCHAR(100),
ADD COLUMN IF NOT EXISTS state VARCHAR(50),
ADD COLUMN IF NOT EXISTS zip_code VARCHAR(10);

-- Add notification preference fields
ALTER TABLE user_preferences
ADD COLUMN IF NOT EXISTS email_booking_confirmations BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS sms_reminders BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS promotional_emails BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS weekly_digest BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS maintenance_updates BOOLEAN DEFAULT true;

-- Add index for phone number lookups
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);

-- Add comments
COMMENT ON COLUMN users.phone IS 'User contact phone number';
COMMENT ON COLUMN user_preferences.street_address IS 'Street address from registration';
COMMENT ON COLUMN user_preferences.city IS 'City from registration';
COMMENT ON COLUMN user_preferences.state IS 'State from registration';
COMMENT ON COLUMN user_preferences.zip_code IS 'ZIP code from registration';
COMMENT ON COLUMN user_preferences.email_booking_confirmations IS 'Email notification for booking confirmations';
COMMENT ON COLUMN user_preferences.sms_reminders IS 'SMS notification for court time reminders';
COMMENT ON COLUMN user_preferences.promotional_emails IS 'Promotional emails from facilities';
COMMENT ON COLUMN user_preferences.weekly_digest IS 'Weekly activity digest email';
COMMENT ON COLUMN user_preferences.maintenance_updates IS 'Court closure and maintenance notifications';
