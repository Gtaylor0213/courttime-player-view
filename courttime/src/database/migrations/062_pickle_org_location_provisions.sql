-- Migration 062: Audit trail for corporate-provisioned franchise locations

CREATE TABLE IF NOT EXISTS org_location_provisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id VARCHAR(64) NOT NULL REFERENCES franchise_organizations(id) ON DELETE CASCADE,
  facility_id VARCHAR(50) NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  operator_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  setup_mode VARCHAR(20) NOT NULL CHECK (setup_mode IN ('complete', 'quick')),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  welcome_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (facility_id)
);

CREATE INDEX IF NOT EXISTS idx_org_location_provisions_org ON org_location_provisions(org_id);
