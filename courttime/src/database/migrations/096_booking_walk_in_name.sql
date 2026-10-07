-- Walk-in/custom-name bookings still need a real users.id in bookings.user_id
-- (the admin who created it, since walk-ins have no account), so store the
-- guest's actual name here instead of smuggling it into the notes field --
-- lets "Reserved By" show the guest, not the admin who booked on their behalf.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS walk_in_name TEXT;
