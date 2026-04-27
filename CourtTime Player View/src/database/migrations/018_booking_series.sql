-- Migration: Recurring Booking Series
-- Adds series metadata and links bookings to a series

CREATE TABLE IF NOT EXISTS booking_series (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    facility_id VARCHAR(50) NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_booking_series_facility ON booking_series(facility_id);

CREATE TRIGGER update_booking_series_updated_at
BEFORE UPDATE ON booking_series
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS series_id UUID REFERENCES booking_series(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_series_id ON bookings(series_id);

COMMENT ON TABLE booking_series IS 'Logical grouping for recurring booking instances';
COMMENT ON COLUMN bookings.series_id IS 'FK to booking_series for bookings created as part of a recurring series';
