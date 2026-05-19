-- Link bulletin activities to court bookings and store event duration

ALTER TABLE bulletin_posts
  ADD COLUMN IF NOT EXISTS drill_duration_minutes INTEGER DEFAULT 60
    CHECK (drill_duration_minutes > 0 AND drill_duration_minutes <= 480),
  ADD COLUMN IF NOT EXISTS booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bulletin_posts_booking
  ON bulletin_posts (booking_id)
  WHERE booking_id IS NOT NULL;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS bulletin_post_id UUID REFERENCES bulletin_posts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_bulletin_post
  ON bookings (bulletin_post_id)
  WHERE bulletin_post_id IS NOT NULL;
