-- Migration 026: Add bulletin min participants support and cancellation tracking

ALTER TABLE bulletin_posts
  ADD COLUMN IF NOT EXISTS min_participants INTEGER CHECK (min_participants > 0),
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS cancellation_notified_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_bulletin_posts_min_participants_due
  ON bulletin_posts (drill_start_at)
  WHERE status = 'active' AND min_participants IS NOT NULL;
