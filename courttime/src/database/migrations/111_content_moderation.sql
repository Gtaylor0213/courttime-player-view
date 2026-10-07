-- Content moderation (Apple Guideline 1.2, user-generated content).
--
-- Members can message each other and post to the bulletin board and the
-- hitting-partner board. The App Store requires that they can block an abusive
-- member and report offensive content, and that reports get a timely response.

-- One row per "A has blocked B". A block hides B's messages and posts from A
-- and stops direct messages between the two in either direction.
CREATE TABLE IF NOT EXISTS user_blocks (
    blocker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (blocker_id, blocked_id),
    CHECK (blocker_id <> blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked ON user_blocks (blocked_id);

-- A member's report of a message, post or another member. content_snapshot
-- keeps the reported text as it was, so a report can still be judged after the
-- author edits or deletes the original. Reports are abuse records and are kept
-- when either account is deleted (see legal/ACCOUNT_DELETION.md).
CREATE TABLE IF NOT EXISTS content_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reported_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    facility_id VARCHAR(50) REFERENCES facilities(id) ON DELETE SET NULL,
    content_type VARCHAR(30) NOT NULL
        CHECK (content_type IN ('message', 'bulletin_post', 'hitting_partner_post', 'user')),
    content_id TEXT NOT NULL,
    reason VARCHAR(30) NOT NULL
        CHECK (reason IN ('spam', 'harassment', 'inappropriate', 'other')),
    details TEXT,
    content_snapshot TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'resolved', 'dismissed')),
    resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    resolved_at TIMESTAMP,
    resolution_note TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Reporting the same thing twice is a no-op rather than a second ticket.
    UNIQUE (reporter_id, content_type, content_id)
);

CREATE INDEX IF NOT EXISTS idx_content_reports_open
    ON content_reports (created_at DESC)
    WHERE status = 'open';

-- Same rationale as 070/082/104/107: the app connects as a BYPASSRLS role, so
-- enabling RLS with no policies only closes the unused public PostgREST surface.
ALTER TABLE user_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_reports ENABLE ROW LEVEL SECURITY;
