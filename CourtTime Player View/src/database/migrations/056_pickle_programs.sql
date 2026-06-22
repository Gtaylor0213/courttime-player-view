-- Migration 056: CourtTime-Pickle programs platform (Phase 3)
-- Additive only. Classic facilities unchanged.

CREATE TABLE IF NOT EXISTS org_program_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  national_program_id VARCHAR(64),
  org_id VARCHAR(64) NOT NULL REFERENCES franchise_organizations(id) ON DELETE CASCADE,
  type VARCHAR(30) NOT NULL
    CHECK (type IN ('open_play', 'round_robin', 'kings_court', 'league', 'tournament', 'clinic', 'social')),
  name VARCHAR(255) NOT NULL,
  default_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_org_program_templates_org ON org_program_templates(org_id);
CREATE INDEX IF NOT EXISTS idx_org_program_templates_type ON org_program_templates(type);
CREATE INDEX IF NOT EXISTS idx_org_program_templates_national ON org_program_templates(national_program_id)
  WHERE national_program_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS org_program_rollouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id VARCHAR(64) NOT NULL REFERENCES franchise_organizations(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES org_program_templates(id) ON DELETE CASCADE,
  facility_id VARCHAR(50) NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, template_id, facility_id)
);

CREATE INDEX IF NOT EXISTS idx_org_program_rollouts_org ON org_program_rollouts(org_id);
CREATE INDEX IF NOT EXISTS idx_org_program_rollouts_facility ON org_program_rollouts(facility_id);

CREATE TABLE IF NOT EXISTS program_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES org_program_templates(id) ON DELETE RESTRICT,
  facility_id VARCHAR(50) NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  schedule JSONB NOT NULL DEFAULT '{}'::jsonb,
  capacity INTEGER NOT NULL DEFAULT 16 CHECK (capacity > 0 AND capacity <= 500),
  price_cents INTEGER NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'cancelled', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_program_instances_facility ON program_instances(facility_id);
CREATE INDEX IF NOT EXISTS idx_program_instances_template ON program_instances(template_id);
CREATE INDEX IF NOT EXISTS idx_program_instances_status ON program_instances(status);

CREATE TABLE IF NOT EXISTS program_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id UUID NOT NULL REFERENCES program_instances(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'registered'
    CHECK (status IN ('registered', 'waitlisted', 'cancelled', 'attended')),
  paid_at TIMESTAMPTZ,
  attended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(instance_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_program_registrations_instance ON program_registrations(instance_id);
CREATE INDEX IF NOT EXISTS idx_program_registrations_user ON program_registrations(user_id);

COMMENT ON TABLE org_program_templates IS 'Corporate program catalog templates for CourtTime-Pickle orgs';
COMMENT ON TABLE org_program_rollouts IS 'Which program templates are enabled at which franchise locations';
COMMENT ON TABLE program_instances IS 'Scheduled program sessions at a pickle facility';
COMMENT ON TABLE program_registrations IS 'Player sign-ups for program instances';
