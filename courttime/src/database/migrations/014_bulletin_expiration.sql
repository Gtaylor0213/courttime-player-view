-- Migration 014: Add auto-expiration and status to bulletin posts
-- Allows posts to expire automatically after a set number of days

ALTER TABLE bulletin_posts ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP;
ALTER TABLE bulletin_posts ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';

-- Index for efficiently finding expired posts
CREATE INDEX IF NOT EXISTS idx_bulletin_posts_expires ON bulletin_posts (expires_at) WHERE status = 'active';
