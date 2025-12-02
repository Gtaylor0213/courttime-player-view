-- Migration: Add facility_contacts table for secondary contacts
-- This allows facilities to have multiple contact persons

-- =====================================================
-- CREATE FACILITY_CONTACTS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS facility_contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    facility_id VARCHAR(50) NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    is_primary BOOLEAN DEFAULT false,
    role VARCHAR(100), -- e.g., 'Manager', 'Pro Shop', 'Maintenance', 'Events Coordinator'
    notes TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_facility_contacts_facility ON facility_contacts(facility_id);
CREATE INDEX IF NOT EXISTS idx_facility_contacts_primary ON facility_contacts(is_primary) WHERE is_primary = true;
CREATE INDEX IF NOT EXISTS idx_facility_contacts_active ON facility_contacts(is_active) WHERE is_active = true;

-- Add trigger for updated_at
CREATE TRIGGER update_facility_contacts_updated_at
BEFORE UPDATE ON facility_contacts
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE facility_contacts IS 'Stores contact information for facility staff and managers';
COMMENT ON COLUMN facility_contacts.is_primary IS 'True for the primary contact person (usually the admin who registered)';
COMMENT ON COLUMN facility_contacts.role IS 'Optional role description for the contact';
