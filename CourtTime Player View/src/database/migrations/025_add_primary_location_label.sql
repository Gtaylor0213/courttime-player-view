-- Add optional label for a facility's primary address (e.g. "Main Campus")
ALTER TABLE facilities
ADD COLUMN IF NOT EXISTS primary_location_label VARCHAR(255);

COMMENT ON COLUMN facilities.primary_location_label IS 'Optional display label for the facility primary address';
