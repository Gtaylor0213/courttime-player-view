-- Migration: Simplify user profile to include only essential fields
-- Date: 2025-11-17
-- Description: Updates users and player_profiles tables to store only:
-- first_name, last_name, email, address, bio (optional), profile_image, skill_level

-- Step 1: Add new columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS street_address TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS city VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS state VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS zip_code VARCHAR(20);

-- Step 2: Migrate existing full_name to first_name and last_name
UPDATE users
SET
  first_name = SPLIT_PART(full_name, ' ', 1),
  last_name = CASE
    WHEN array_length(string_to_array(full_name, ' '), 1) > 1
    THEN substring(full_name from position(' ' in full_name) + 1)
    ELSE ''
  END
WHERE first_name IS NULL;

-- Step 3: Simplify player_profiles table - remove unnecessary columns
ALTER TABLE player_profiles DROP COLUMN IF EXISTS ntrp_rating;
ALTER TABLE player_profiles DROP COLUMN IF EXISTS playing_hand;
ALTER TABLE player_profiles DROP COLUMN IF EXISTS playing_style;
ALTER TABLE player_profiles DROP COLUMN IF EXISTS preferred_court_surface;
ALTER TABLE player_profiles DROP COLUMN IF EXISTS years_playing;

-- Ensure player_profiles has the essential columns
ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS skill_level VARCHAR(50);
ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS profile_image_url TEXT;

-- Step 4: Create or update user_preferences table to store notification settings
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS email_booking_confirmations BOOLEAN DEFAULT true;
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS sms_reminders BOOLEAN DEFAULT true;
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS promotional_emails BOOLEAN DEFAULT false;
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS weekly_digest BOOLEAN DEFAULT true;
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS maintenance_updates BOOLEAN DEFAULT true;

-- Add comments
COMMENT ON COLUMN users.first_name IS 'User first name';
COMMENT ON COLUMN users.last_name IS 'User last name';
COMMENT ON COLUMN users.address IS 'User full address (deprecated - use street_address, city, state, zip_code)';
COMMENT ON COLUMN users.street_address IS 'User street address';
COMMENT ON COLUMN users.city IS 'User city';
COMMENT ON COLUMN users.state IS 'User state';
COMMENT ON COLUMN users.zip_code IS 'User zip/postal code';
COMMENT ON COLUMN player_profiles.skill_level IS 'Player skill level: Beginner, Intermediate, Advanced, Professional';
COMMENT ON COLUMN player_profiles.bio IS 'Player biography (optional)';
COMMENT ON COLUMN player_profiles.profile_image_url IS 'URL to player profile image';
