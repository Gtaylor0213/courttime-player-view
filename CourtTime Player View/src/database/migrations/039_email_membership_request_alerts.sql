-- Separate preference for admin emails when someone requests facility membership
ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS email_membership_request_alerts BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN user_preferences.email_membership_request_alerts IS 'When true (default), facility admins receive email when a player requests to join';
