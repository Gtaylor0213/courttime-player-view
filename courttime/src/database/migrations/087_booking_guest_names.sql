-- Guest names for the "bring a guest" flow (capped at 3 in the UI) so
-- facility admins can see who a member's guests are.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS guest_names TEXT[];
