-- Migration 059: CourtTime-Pickle player profiles, visits, campaigns (Phase 6)
-- Additive only. Classic player_profiles / tennis fields unchanged.

CREATE TABLE IF NOT EXISTS pickle_player_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id VARCHAR(64) REFERENCES franchise_organizations(id) ON DELETE CASCADE,
  dupr_rating NUMERIC(4, 2) CHECK (dupr_rating IS NULL OR (dupr_rating >= 0 AND dupr_rating <= 8)),
  birthdate DATE,
  primary_goals TEXT[] NOT NULL DEFAULT '{}',
  preferred_formats TEXT[] NOT NULL DEFAULT '{}',
  preferred_programs TEXT[] NOT NULL DEFAULT '{}',
  availability_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  equipment_brands JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, org_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pickle_player_profiles_user_global
  ON pickle_player_profiles(user_id)
  WHERE org_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_pickle_player_profiles_user ON pickle_player_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_pickle_player_profiles_org ON pickle_player_profiles(org_id)
  WHERE org_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS player_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  facility_id VARCHAR(50) NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  org_id VARCHAR(64) NOT NULL REFERENCES franchise_organizations(id) ON DELETE CASCADE,
  visit_type VARCHAR(30) NOT NULL DEFAULT 'drop_in'
    CHECK (visit_type IN ('drop_in', 'open_play', 'clinic', 'league', 'tournament', 'court_booking', 'pro_shop', 'other')),
  visited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_player_visits_user ON player_visits(user_id);
CREATE INDEX IF NOT EXISTS idx_player_visits_org ON player_visits(org_id);
CREATE INDEX IF NOT EXISTS idx_player_visits_facility ON player_visits(facility_id);
CREATE INDEX IF NOT EXISTS idx_player_visits_visited_at ON player_visits(org_id, visited_at DESC);
CREATE INDEX IF NOT EXISTS idx_player_visits_user_org ON player_visits(user_id, org_id, visited_at DESC);

CREATE TABLE IF NOT EXISTS pickle_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id VARCHAR(64) NOT NULL REFERENCES franchise_organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  segment_filter JSONB NOT NULL DEFAULT '{}'::jsonb,
  channel VARCHAR(10) NOT NULL DEFAULT 'email'
    CHECK (channel IN ('email', 'push', 'sms')),
  template_body TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'canceled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pickle_campaigns_org ON pickle_campaigns(org_id);
CREATE INDEX IF NOT EXISTS idx_pickle_campaigns_status ON pickle_campaigns(org_id, status);

CREATE TABLE IF NOT EXISTS pickle_campaign_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES pickle_campaigns(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sent_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_pickle_campaign_sends_campaign ON pickle_campaign_sends(campaign_id);
CREATE INDEX IF NOT EXISTS idx_pickle_campaign_sends_user ON pickle_campaign_sends(user_id);

COMMENT ON TABLE pickle_player_profiles IS 'Pickle-specific player profile extension (DUPR, goals, availability) — separate from classic tennis profile';
COMMENT ON TABLE player_visits IS 'Facility visit log for pickle lifecycle and milestone tracking';
COMMENT ON TABLE pickle_campaigns IS 'Org marketing campaigns with JSON segment filters';
COMMENT ON TABLE pickle_campaign_sends IS 'Per-recipient send log for pickle campaigns';
