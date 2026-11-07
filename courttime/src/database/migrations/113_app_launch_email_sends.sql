-- One row per email address for the one-time "CourtTime is in the app stores"
-- announcement (support console → App Launch Email).
--
-- The row is claimed (status 'sending') before the email goes out and updated
-- afterwards, so a deploy or restart mid-send can be resumed without emailing
-- anyone twice. A row left at 'sending' means the server stopped during that
-- one send; it is never retried automatically.

CREATE TABLE IF NOT EXISTS app_launch_email_sends (
  email      TEXT PRIMARY KEY,             -- lower-cased
  user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  status     TEXT NOT NULL CHECK (status IN ('sending', 'sent', 'skipped', 'failed')),
  error      TEXT,
  resend_id  TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE app_launch_email_sends IS
  'Who has been sent the one-time app launch email. skipped = the member has email notifications off.';
