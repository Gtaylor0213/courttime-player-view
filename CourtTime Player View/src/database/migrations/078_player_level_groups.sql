-- Player level groups: facility admins sort members into ordered skill tiers
-- ("3.0", "3.5 Advanced", …) from the Messages section, then drag players
-- between tiers as their level changes. Gated behind the player_level_groups
-- feature flag (facility_features table).
--
-- Tiers are ordered strongest-first by sort_position, so "moving someone up"
-- means moving them to a lower sort_position.

CREATE TABLE IF NOT EXISTS player_level_groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    facility_id VARCHAR(50) NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
    name VARCHAR(80) NOT NULL,
    -- Display order, top (strongest) tier first. The reorder endpoint rewrites
    -- the whole sequence, so gaps are harmless.
    sort_position INTEGER NOT NULL DEFAULT 0,
    -- Off by default: a tier stays admin-only until the admin decides players
    -- should see which group they're in and who else is in it.
    is_visible_to_players BOOLEAN NOT NULL DEFAULT false,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_player_level_group_name UNIQUE (facility_id, name)
);

CREATE INDEX IF NOT EXISTS idx_player_level_groups_facility
    ON player_level_groups (facility_id, sort_position);

CREATE TRIGGER update_player_level_groups_updated_at
BEFORE UPDATE ON player_level_groups
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- A member belongs to at most one tier per facility -- dragging someone to
-- another tier is a move, not a copy. facility_id is denormalized here purely
-- so UNIQUE (facility_id, user_id) can enforce that at the database level.
CREATE TABLE IF NOT EXISTS player_level_group_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID NOT NULL REFERENCES player_level_groups(id) ON DELETE CASCADE,
    facility_id VARCHAR(50) NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sort_position INTEGER NOT NULL DEFAULT 0,
    added_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_player_level_assignment UNIQUE (facility_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_player_level_group_members_group
    ON player_level_group_members (group_id, sort_position);

CREATE INDEX IF NOT EXISTS idx_player_level_group_members_user
    ON player_level_group_members (user_id);

-- Match 070_enable_rls.sql: backend connects as postgres (BYPASSRLS); enabling
-- RLS with no policies closes the unused PostgREST surface.
ALTER TABLE IF EXISTS public.player_level_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.player_level_group_members ENABLE ROW LEVEL SECURITY;
