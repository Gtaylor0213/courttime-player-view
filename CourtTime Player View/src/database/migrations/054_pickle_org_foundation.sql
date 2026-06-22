-- Migration 054: CourtTime-Pickle org / franchise foundation
-- Additive only. Classic facilities keep product_line = 'classic' and org_id NULL.

CREATE TABLE IF NOT EXISTS franchise_organizations (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  branding_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_franchise_organizations_slug
  ON franchise_organizations(slug);

CREATE TABLE IF NOT EXISTS org_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id VARCHAR(64) NOT NULL REFERENCES franchise_organizations(id) ON DELETE CASCADE,
  role VARCHAR(30) NOT NULL DEFAULT 'owner'
    CHECK (role IN ('owner', 'ops', 'marketing', 'finance')),
  permissions JSONB NOT NULL DEFAULT '{"manage_locations": true, "manage_catalog": true, "manage_org_admins": true, "view_reports": true}'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'pending', 'suspended', 'removed')),
  invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, org_id)
);

CREATE INDEX IF NOT EXISTS idx_org_admins_user ON org_admins(user_id);
CREATE INDEX IF NOT EXISTS idx_org_admins_org ON org_admins(org_id);

CREATE TABLE IF NOT EXISTS org_location_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id VARCHAR(64) NOT NULL REFERENCES franchise_organizations(id) ON DELETE CASCADE,
  token VARCHAR(128) NOT NULL UNIQUE,
  invite_email VARCHAR(255) NOT NULL,
  location_name VARCHAR(255),
  facility_id VARCHAR(50) REFERENCES facilities(id) ON DELETE SET NULL,
  invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_org_location_invites_token ON org_location_invites(token);
CREATE INDEX IF NOT EXISTS idx_org_location_invites_org ON org_location_invites(org_id);

ALTER TABLE facilities
  ADD COLUMN IF NOT EXISTS org_id VARCHAR(64) REFERENCES franchise_organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS product_line VARCHAR(30) NOT NULL DEFAULT 'classic';

CREATE INDEX IF NOT EXISTS idx_facilities_org_id ON facilities(org_id);
CREATE INDEX IF NOT EXISTS idx_facilities_product_line ON facilities(product_line);

COMMENT ON COLUMN facilities.product_line IS 'classic = existing CourtTime tennis/HOA; pickle = CourtTime-Pickle franchise location';
COMMENT ON TABLE franchise_organizations IS 'Corporate / franchisor container for CourtTime-Pickle brands';
