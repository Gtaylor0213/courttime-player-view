-- Padel: general player-count column on bookings (usable by any booking type
-- going forward; only defaulted/enforced for padel courts and Social Play),
-- an "open to members" flag for the generic fill-a-spot flow, and a
-- padel-specific skill rating on player_profiles, independent of the
-- generic skill_level and pickleball's dupr_rating.
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS max_players INTEGER CHECK (max_players IS NULL OR max_players > 0),
  ADD COLUMN IF NOT EXISTS open_to_members BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE player_profiles
  ADD COLUMN IF NOT EXISTS padel_skill_level VARCHAR(50);

COMMENT ON COLUMN bookings.max_players IS 'General capacity for this booking (e.g. 4 for a padel court). Null = no cap tracked.';
COMMENT ON COLUMN bookings.open_to_members IS 'Host is advertising open spots on this booking to other club members (fill-a-spot).';
COMMENT ON COLUMN player_profiles.padel_skill_level IS 'Padel-specific self-reported or admin-assigned rating (e.g. 1-7 or Beginner..Advanced). Independent of skill_level and pickle dupr_rating.';

-- Explicitly seed the new flag as disabled for every existing club. New clubs
-- remain disabled because feature flags default to false when no row exists.
INSERT INTO facility_features (facility_id, feature_key, is_enabled, updated_at)
SELECT id, 'padel', false, NOW()
FROM facilities
ON CONFLICT (facility_id, feature_key) DO NOTHING;
