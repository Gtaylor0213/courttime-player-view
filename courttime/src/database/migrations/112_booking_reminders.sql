-- Booking reminders: a notification about an hour before a reservation starts.
--
-- reminder_sent_at is the claim marker. The reminder sweep sets it in the same
-- statement that selects due bookings, so two server instances can never send
-- the same reminder twice, and a restart never re-sends one.

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMP;

COMMENT ON COLUMN bookings.reminder_sent_at IS
  'When the "starting soon" reminder for this booking was sent. NULL means not sent (yet).';

-- The sweep runs every minute and only ever looks at confirmed, un-reminded
-- bookings in a three-day window, so keep that lookup off the full table.
CREATE INDEX IF NOT EXISTS idx_bookings_reminder_due
  ON bookings (booking_date)
  WHERE status = 'confirmed' AND reminder_sent_at IS NULL;
