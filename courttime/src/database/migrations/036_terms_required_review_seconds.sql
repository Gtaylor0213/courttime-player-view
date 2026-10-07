ALTER TABLE facility_terms_conditions_versions
    ADD COLUMN IF NOT EXISTS required_review_seconds INTEGER NOT NULL DEFAULT 0;

ALTER TABLE facility_terms_conditions_versions
    DROP CONSTRAINT IF EXISTS facility_terms_conditions_versions_required_review_seconds_check;

ALTER TABLE facility_terms_conditions_versions
    ADD CONSTRAINT facility_terms_conditions_versions_required_review_seconds_check
    CHECK (required_review_seconds >= 0);
