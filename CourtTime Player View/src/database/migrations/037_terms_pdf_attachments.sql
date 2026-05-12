ALTER TABLE facility_terms_conditions_versions
    ADD COLUMN IF NOT EXISTS attachments_json JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE facility_terms_conditions_versions
    DROP CONSTRAINT IF EXISTS facility_terms_conditions_versions_attachments_json_array_check;

ALTER TABLE facility_terms_conditions_versions
    ADD CONSTRAINT facility_terms_conditions_versions_attachments_json_array_check
    CHECK (jsonb_typeof(attachments_json) = 'array');
