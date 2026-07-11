-- Migration: Per-court waiver versioning + member acceptance tracking
-- Admins can attach a waiver to a specific court (e.g. a custom paid court);
-- members must accept the current waiver version before booking that court.

CREATE TABLE IF NOT EXISTS court_waiver_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    court_id UUID NOT NULL REFERENCES courts(id) ON DELETE CASCADE,
    facility_id VARCHAR(50) NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    content_html TEXT NOT NULL,
    -- Latest version is the active waiver; is_active=false on the latest
    -- version means the waiver was removed from the court.
    is_active BOOLEAN NOT NULL DEFAULT true,
    published_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (court_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_court_waiver_versions_court
    ON court_waiver_versions (court_id, version_number DESC);

CREATE INDEX IF NOT EXISTS idx_court_waiver_versions_facility
    ON court_waiver_versions (facility_id);

CREATE TRIGGER update_court_waiver_versions_updated_at
BEFORE UPDATE ON court_waiver_versions
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS member_court_waiver_acceptances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    court_id UUID NOT NULL REFERENCES courts(id) ON DELETE CASCADE,
    waiver_version_id UUID NOT NULL REFERENCES court_waiver_versions(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    accepted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ip_address VARCHAR(64),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, court_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_member_court_waiver_acceptances_user_court
    ON member_court_waiver_acceptances (user_id, court_id, version_number DESC);

CREATE INDEX IF NOT EXISTS idx_member_court_waiver_acceptances_court_version
    ON member_court_waiver_acceptances (court_id, version_number);

-- Match 070_enable_rls.sql: backend connects as postgres (BYPASSRLS); enabling
-- RLS with no policies closes the unused PostgREST surface.
ALTER TABLE IF EXISTS public.court_waiver_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.member_court_waiver_acceptances ENABLE ROW LEVEL SECURITY;
