-- Tracks the admin/staff member who created a booking on behalf of another
-- member or a walk-in guest, so admin-created reservations can be attributed
-- to the actual staff member instead of only the member/guest they're for.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booked_by_staff_id UUID REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_booked_by_staff ON bookings(booked_by_staff_id);
