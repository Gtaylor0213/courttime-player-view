-- Padel Social Play: Americano/Mexicano sessions. A session is the event
-- shell (format, player target, courts); padel_social_players is the roster
-- players join before rounds are generated (open enrollment = fill-a-spot
-- for Social Play specifically, distinct from the generic booking claim flow
-- added in 090_booking_open_spot_claims.sql).
CREATE TABLE IF NOT EXISTS padel_social_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  facility_id VARCHAR(50) NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  format VARCHAR(20) NOT NULL CHECK (format IN ('americano', 'mexicano')),
  session_date DATE NOT NULL,
  start_time TIME NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  player_count INTEGER NOT NULL CHECK (player_count > 0 AND player_count % 4 = 0),
  rounds_count INTEGER NOT NULL DEFAULT 5 CHECK (rounds_count > 0),
  court_ids UUID[] NOT NULL DEFAULT '{}',
  status VARCHAR(20) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'full', 'in_progress', 'completed', 'cancelled')),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_padel_social_sessions_facility_date
  ON padel_social_sessions (facility_id, session_date, status);

COMMENT ON COLUMN padel_social_sessions.court_ids IS 'Ordered list of courts assigned to this session at start time; index into this array is the "court group index" used by round generation and padel_social_players.group_court_index.';

-- One booking row per court the session uses, so it blocks the calendar the
-- same way any other reservation does. bookings.notes/booking_type stay
-- generic ('social'); this column is the only Social-Play-specific link.
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS padel_session_id UUID REFERENCES padel_social_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_padel_session
  ON bookings (padel_session_id) WHERE padel_session_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS padel_social_players (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES padel_social_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_host BOOLEAN NOT NULL DEFAULT false,
  seed_skill NUMERIC(3, 1),
  group_court_index INTEGER,
  group_slot INTEGER CHECK (group_slot IS NULL OR group_slot BETWEEN 1 AND 4),
  joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (session_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_padel_social_players_session ON padel_social_players (session_id);
CREATE INDEX IF NOT EXISTS idx_padel_social_players_user ON padel_social_players (user_id);

COMMENT ON COLUMN padel_social_players.seed_skill IS 'Snapshot of padel_skill_level (parsed numeric) at join time, so later profile edits do not retroactively change a running session''s seeding.';
COMMENT ON COLUMN padel_social_players.group_court_index IS 'Which court group (0-based) this player belongs to for the current Americano cycle; recomputed at each cycle boundary. Unused (overwritten every round) for Mexicano.';
COMMENT ON COLUMN padel_social_players.group_slot IS 'Fixed P1-P4 slot within the Americano group, used to derive each round''s partner pairing for the current cycle.';

ALTER TABLE IF EXISTS public.padel_social_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.padel_social_players ENABLE ROW LEVEL SECURITY;
