-- Migration 060: CourtTime-Pickle leaderboards (Phase 7)
-- Denormalized player stats aggregated from player_visits + program_registrations.

CREATE TABLE IF NOT EXISTS player_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  facility_id VARCHAR(50) NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  org_id VARCHAR(64) NOT NULL REFERENCES franchise_organizations(id) ON DELETE CASCADE,
  all_time_visits INTEGER NOT NULL DEFAULT 0 CHECK (all_time_visits >= 0),
  month_visits INTEGER NOT NULL DEFAULT 0 CHECK (month_visits >= 0),
  year_visits INTEGER NOT NULL DEFAULT 0 CHECK (year_visits >= 0),
  programs_attended INTEGER NOT NULL DEFAULT 0 CHECK (programs_attended >= 0),
  dupr_rating_snapshot NUMERIC(4, 2)
    CHECK (dupr_rating_snapshot IS NULL OR (dupr_rating_snapshot >= 0 AND dupr_rating_snapshot <= 8)),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, facility_id)
);

CREATE INDEX IF NOT EXISTS idx_player_stats_facility
  ON player_stats(facility_id, all_time_visits DESC);

CREATE INDEX IF NOT EXISTS idx_player_stats_org
  ON player_stats(org_id, all_time_visits DESC);

CREATE INDEX IF NOT EXISTS idx_player_stats_user
  ON player_stats(user_id);

COMMENT ON TABLE player_stats IS 'Cached leaderboard metrics per player per pickle facility';
