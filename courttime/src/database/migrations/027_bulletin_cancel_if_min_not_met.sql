-- Migration 027: Optional auto-cancel switch when minimum is not met

ALTER TABLE bulletin_posts
  ADD COLUMN IF NOT EXISTS cancel_if_min_not_met BOOLEAN DEFAULT false;
