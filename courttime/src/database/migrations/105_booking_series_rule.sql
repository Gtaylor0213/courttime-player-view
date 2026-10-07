-- Recurring reservations: store the rule, not just the resulting bookings.
--
-- 018_booking_series created booking_series as a bare grouping key (facility,
-- creator, title, notes). Everything the person actually chose when creating
-- the series -- which courts, which weekdays, the date range, the time, the
-- member it was booked for -- lived only in the individual bookings rows, so
-- there was nothing to load into an edit form and nothing to re-expand when a
-- date range changed. These columns make the series self-describing: the rule
-- here plus the instance rows in bookings are enough to reconcile any edit.
--
-- Instances can still drift from the rule on purpose (one date moved to
-- another court, one date dropped). The rule is the default the edit form
-- opens with and the basis for expanding a widened date range -- it is not a
-- constraint the instances are forced to match.

ALTER TABLE booking_series
  -- Whose reservation this is. created_by is left alone: for a staff-created
  -- series the two differ, and existing rows already carry the owner there.
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS booked_by_staff_id UUID REFERENCES users(id) ON DELETE SET NULL,
  -- Guest's real name when the series was booked for a walk-in (user_id is then
  -- the staff member who booked it, since the guest has no account).
  ADD COLUMN IF NOT EXISTS walk_in_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS court_ids UUID[],
  -- 0 = Sunday .. 6 = Saturday, matching JavaScript's Date#getDay so the shared
  -- expansion helper needs no translation layer.
  ADD COLUMN IF NOT EXISTS weekdays SMALLINT[],
  ADD COLUMN IF NOT EXISTS start_date DATE,
  ADD COLUMN IF NOT EXISTS end_date DATE,
  ADD COLUMN IF NOT EXISTS start_time TIME,
  ADD COLUMN IF NOT EXISTS end_time TIME,
  ADD COLUMN IF NOT EXISTS duration_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS booking_type VARCHAR(100),
  -- Per-instance capacity (4 on a padel court). Dropped on the floor before
  -- this migration: series inserts never carried it through.
  ADD COLUMN IF NOT EXISTS max_players INTEGER,
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active';

ALTER TABLE booking_series
  DROP CONSTRAINT IF EXISTS booking_series_status_check;
ALTER TABLE booking_series
  ADD CONSTRAINT booking_series_status_check
  CHECK (status IN ('active', 'cancelled'));

ALTER TABLE booking_series
  DROP CONSTRAINT IF EXISTS booking_series_weekdays_check;
ALTER TABLE booking_series
  ADD CONSTRAINT booking_series_weekdays_check
  CHECK (weekdays IS NULL OR (
    array_length(weekdays, 1) BETWEEN 1 AND 7
    AND weekdays <@ ARRAY[0,1,2,3,4,5,6]::SMALLINT[]
  ));

ALTER TABLE booking_series
  DROP CONSTRAINT IF EXISTS booking_series_date_range_check;
ALTER TABLE booking_series
  ADD CONSTRAINT booking_series_date_range_check
  CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date);

-- "Which series does this member own" powers the owner-or-admin authorization
-- on the series endpoints.
CREATE INDEX IF NOT EXISTS idx_booking_series_user ON booking_series(user_id);

COMMENT ON COLUMN booking_series.user_id IS 'Member the series is booked for (the owner). Differs from created_by when staff booked it on someone else''s behalf.';
COMMENT ON COLUMN booking_series.weekdays IS 'Days of week the rule repeats on, 0=Sunday..6=Saturday (JavaScript Date#getDay order).';
COMMENT ON COLUMN booking_series.court_ids IS 'Courts the rule books on each occurrence; one booking row per court per date.';
COMMENT ON COLUMN booking_series.status IS 'active, or cancelled once every instance has been cancelled.';

-- Backfill the rule for series created before this migration by reading it back
-- off their instances. Cancelled instances are ignored unless that is all there
-- is, so a partly-cancelled series still reports the rule it is running on.
WITH live AS (
  SELECT
    b.series_id,
    b.court_id,
    b.booking_date,
    b.start_time,
    b.end_time,
    b.duration_minutes,
    b.user_id,
    b.booked_by_staff_id,
    b.walk_in_name,
    b.booking_type,
    b.max_players,
    b.status,
    -- Prefer a live row as the representative instance for the scalar fields.
    ROW_NUMBER() OVER (
      PARTITION BY b.series_id
      ORDER BY (b.status = 'cancelled'), b.booking_date, b.start_time
    ) AS pick
  FROM bookings b
  WHERE b.series_id IS NOT NULL
),
rule AS (
  SELECT
    series_id,
    ARRAY(
      SELECT DISTINCT court_id FROM live l2
      WHERE l2.series_id = l.series_id AND (l2.status <> 'cancelled' OR NOT EXISTS (
        SELECT 1 FROM live l3 WHERE l3.series_id = l.series_id AND l3.status <> 'cancelled'
      ))
    ) AS court_ids,
    ARRAY(
      SELECT DISTINCT EXTRACT(DOW FROM booking_date)::SMALLINT FROM live l2
      WHERE l2.series_id = l.series_id AND (l2.status <> 'cancelled' OR NOT EXISTS (
        SELECT 1 FROM live l3 WHERE l3.series_id = l.series_id AND l3.status <> 'cancelled'
      ))
      ORDER BY 1
    ) AS weekdays,
    MIN(booking_date) AS start_date,
    MAX(booking_date) AS end_date
  FROM live l
  GROUP BY series_id
)
UPDATE booking_series s
SET
  user_id            = COALESCE(s.user_id, rep.user_id, s.created_by),
  booked_by_staff_id = COALESCE(s.booked_by_staff_id, rep.booked_by_staff_id),
  walk_in_name       = COALESCE(s.walk_in_name, rep.walk_in_name),
  court_ids          = COALESCE(s.court_ids, rule.court_ids),
  weekdays           = COALESCE(s.weekdays, NULLIF(rule.weekdays, '{}'::SMALLINT[])),
  start_date         = COALESCE(s.start_date, rule.start_date),
  end_date           = COALESCE(s.end_date, rule.end_date),
  start_time         = COALESCE(s.start_time, rep.start_time),
  end_time           = COALESCE(s.end_time, rep.end_time),
  duration_minutes   = COALESCE(s.duration_minutes, rep.duration_minutes),
  booking_type       = COALESCE(s.booking_type, rep.booking_type),
  max_players        = COALESCE(s.max_players, rep.max_players)
FROM rule
JOIN live rep ON rep.series_id = rule.series_id AND rep.pick = 1
WHERE s.id = rule.series_id;

-- Series whose instances were all hard-deleted by the old DELETE endpoint have
-- no rule to recover; mark them cancelled rather than leaving a half-null row
-- the edit form would choke on.
UPDATE booking_series s
SET status = 'cancelled'
WHERE s.start_date IS NULL
  AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.series_id = s.id);

-- A series whose instances were all hard-deleted never entered the backfill's
-- rule CTE, so it still has no owner. created_by is NOT NULL and was set to the
-- owner by the old create path, so it is the right fallback.
UPDATE booking_series SET user_id = created_by WHERE user_id IS NULL;

-- Owner is required going forward.
ALTER TABLE booking_series ALTER COLUMN user_id SET NOT NULL;
