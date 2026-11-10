-- Newsletters written and sent from the support console (Newsletter page):
-- one row per issue, plus one row per email address it was sent to.
--
-- As with app_launch_email_sends, each address is claimed (status 'sending')
-- before its email goes out and updated afterwards, so a deploy or restart
-- mid-send can be resumed without emailing anyone twice. A row left at
-- 'sending' means the server stopped during that one send; it is never
-- retried automatically.

CREATE TABLE IF NOT EXISTS newsletters (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject     TEXT NOT NULL,
  preheader   TEXT,
  body        TEXT NOT NULL,
  -- Club admins, players (any other account) or everyone in a club; all of
  -- them or the picked ones in target_ids (user ids, or facility ids for clubs).
  audience    TEXT NOT NULL CHECK (audience IN (
                'all_admins', 'selected_admins', 'all_players',
                'selected_players', 'all_clubs', 'selected_clubs')),
  target_ids  TEXT[] NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Set when Send is first pressed; the issue can't be edited after that.
  sent_at     TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS newsletter_sends (
  newsletter_id UUID NOT NULL REFERENCES newsletters(id) ON DELETE CASCADE,
  email         TEXT NOT NULL,             -- lower-cased
  user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  status        TEXT NOT NULL CHECK (status IN ('sending', 'sent', 'skipped', 'failed')),
  error         TEXT,
  resend_id     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (newsletter_id, email)
);

COMMENT ON TABLE newsletters IS
  'Newsletters from the support console. audience picks club admins, players or clubs, all or those in target_ids.';
COMMENT ON TABLE newsletter_sends IS
  'Who each newsletter was sent to. skipped = the member has email notifications off.';

-- The app connects as the postgres role (BYPASSRLS); RLS with no policies just
-- closes the unused PostgREST surface (see 104/107). 113 missed it for
-- app_launch_email_sends, so it's covered here too.
ALTER TABLE newsletters ENABLE ROW LEVEL SECURITY;
ALTER TABLE newsletter_sends ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS app_launch_email_sends ENABLE ROW LEVEL SECURITY;
