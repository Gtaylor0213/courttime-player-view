-- Add contact information fields to users table
ALTER TABLE users
ADD COLUMN IF NOT EXISTS phone VARCHAR(20),
ADD COLUMN IF NOT EXISTS street_address TEXT,
ADD COLUMN IF NOT EXISTS city VARCHAR(100),
ADD COLUMN IF NOT EXISTS state VARCHAR(50),
ADD COLUMN IF NOT EXISTS zip_code VARCHAR(20);

-- Add notification preference fields to user_preferences table
ALTER TABLE user_preferences
ADD COLUMN IF NOT EXISTS email_booking_confirmations BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS sms_reminders BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS promotional_emails BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS weekly_digest BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS maintenance_updates BOOLEAN DEFAULT true;
