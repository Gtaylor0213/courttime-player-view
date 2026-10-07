-- Migration 020: Add drill posts and signup/waitlist support to bulletin board

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS gender VARCHAR(20) CHECK (gender IN ('male', 'female', 'other', 'prefer_not_to_say'));

ALTER TABLE bulletin_posts
  ADD COLUMN IF NOT EXISTS drill_start_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS drill_court_id UUID REFERENCES courts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS drill_max_participants INTEGER CHECK (drill_max_participants > 0),
  ADD COLUMN IF NOT EXISTS drill_gender_restriction VARCHAR(20) DEFAULT 'any'
    CHECK (drill_gender_restriction IN ('any', 'male_only', 'female_only')),
  ADD COLUMN IF NOT EXISTS drill_show_participants BOOLEAN DEFAULT false;

CREATE TABLE IF NOT EXISTS bulletin_drill_signups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bulletin_post_id UUID NOT NULL REFERENCES bulletin_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL CHECK (status IN ('confirmed', 'waitlist')),
  waitlist_position INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (bulletin_post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_bulletin_drill_signups_post
  ON bulletin_drill_signups (bulletin_post_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_bulletin_drill_signups_waitlist
  ON bulletin_drill_signups (bulletin_post_id, waitlist_position)
  WHERE status = 'waitlist';

DROP TRIGGER IF EXISTS update_bulletin_drill_signups_updated_at ON bulletin_drill_signups;
CREATE TRIGGER update_bulletin_drill_signups_updated_at
BEFORE UPDATE ON bulletin_drill_signups
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
