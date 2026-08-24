-- Fast lookup for "open matches" browse: bookings a member can join because
-- the host marked them open and there's still room. Claims themselves reuse
-- the existing booking_participants table (from 075_post_play_settlement.sql)
-- as the ledger of who's on a booking, so no new table is needed here.
CREATE INDEX IF NOT EXISTS idx_bookings_open_to_members
  ON bookings (facility_id, booking_date, start_time)
  WHERE open_to_members = true AND status = 'confirmed';
