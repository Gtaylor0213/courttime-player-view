-- Master toggle for transactional emails (booking, strikes, announcements, etc.)
ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS email_notifications_enabled BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN user_preferences.email_notifications_enabled IS 'When false, skip sending transactional emails to this user';
