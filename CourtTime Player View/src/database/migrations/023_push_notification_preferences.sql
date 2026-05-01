-- Migration: Per-category push notification preferences
-- Lets a player opt out of specific push notification types from their device.

ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS push_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS push_booking_updates BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS push_booking_reminders BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS push_strikes BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS push_announcements BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS push_weather BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN user_preferences.push_enabled IS 'Master toggle for push notifications';
COMMENT ON COLUMN user_preferences.push_booking_updates IS 'Push for booking_confirmed, booking_cancelled, court_change';
COMMENT ON COLUMN user_preferences.push_booking_reminders IS 'Push for upcoming booking reminders';
COMMENT ON COLUMN user_preferences.push_strikes IS 'Push for strike_issued, strike_revoked, account_lockout';
COMMENT ON COLUMN user_preferences.push_announcements IS 'Push for facility_announcement';
COMMENT ON COLUMN user_preferences.push_weather IS 'Push for weather_alert';
