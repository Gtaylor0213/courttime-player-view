-- Migration: Terms and Conditions versioning + member acceptance tracking

CREATE TABLE IF NOT EXISTS facility_terms_conditions_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    facility_id VARCHAR(50) NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    content_html TEXT NOT NULL,
    published_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (facility_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_terms_versions_facility
    ON facility_terms_conditions_versions (facility_id, version_number DESC);

CREATE TRIGGER update_terms_versions_updated_at
BEFORE UPDATE ON facility_terms_conditions_versions
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE facility_memberships
    ADD COLUMN IF NOT EXISTS terms_reaccept_required BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_facility_memberships_terms_reaccept_required
    ON facility_memberships (facility_id, terms_reaccept_required);

CREATE TABLE IF NOT EXISTS member_terms_acceptances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    facility_id VARCHAR(50) NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
    terms_version_id UUID NOT NULL REFERENCES facility_terms_conditions_versions(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    accepted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ip_address VARCHAR(64),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, facility_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_member_terms_acceptances_user_facility
    ON member_terms_acceptances (user_id, facility_id, version_number DESC);

CREATE INDEX IF NOT EXISTS idx_member_terms_acceptances_facility_version
    ON member_terms_acceptances (facility_id, version_number);
