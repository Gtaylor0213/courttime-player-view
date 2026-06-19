-- Feature flags per facility. Missing row = feature is disabled (default OFF).
CREATE TABLE IF NOT EXISTS facility_features (
  facility_id  VARCHAR(50)   NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  feature_key  VARCHAR(100)  NOT NULL,
  is_enabled   BOOLEAN       NOT NULL DEFAULT false,
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_by   TEXT,
  PRIMARY KEY (facility_id, feature_key)
);

CREATE INDEX IF NOT EXISTS idx_facility_features_facility ON facility_features(facility_id);
