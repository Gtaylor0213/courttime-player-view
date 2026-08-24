-- Padel Social Play rounds/matches. One row per 4-player match; standings
-- are computed on read by summing team scores credited to each player
-- (no persisted standings table -- same "derive from source rows" pattern
-- used elsewhere in this codebase rather than a denormalized cache).
CREATE TABLE IF NOT EXISTS padel_social_rounds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES padel_social_sessions(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL CHECK (round_number > 0),
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'completed')),
  generated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (session_id, round_number)
);

CREATE TABLE IF NOT EXISTS padel_social_matches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  round_id UUID NOT NULL REFERENCES padel_social_rounds(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES padel_social_sessions(id) ON DELETE CASCADE,
  court_id UUID REFERENCES courts(id) ON DELETE SET NULL,
  team1_player1_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team1_player2_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team2_player1_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team2_player2_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team1_score INTEGER CHECK (team1_score IS NULL OR team1_score >= 0),
  team2_score INTEGER CHECK (team2_score IS NULL OR team2_score >= 0),
  recorded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  completed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_padel_social_rounds_session ON padel_social_rounds (session_id, round_number);
CREATE INDEX IF NOT EXISTS idx_padel_social_matches_round ON padel_social_matches (round_id);
CREATE INDEX IF NOT EXISTS idx_padel_social_matches_session ON padel_social_matches (session_id);

ALTER TABLE IF EXISTS public.padel_social_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.padel_social_matches ENABLE ROW LEVEL SECURITY;
