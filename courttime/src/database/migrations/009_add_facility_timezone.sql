-- Migration: Add timezone column to facilities table
ALTER TABLE facilities ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) DEFAULT 'America/New_York';
