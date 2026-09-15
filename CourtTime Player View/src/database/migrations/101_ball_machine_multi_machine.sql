-- Multi-machine ball machine support (st_marlow_ball_machine feature flag).
-- Generalizes the old facility-wide singleton (ball_machine_config, one price list)
-- into named machines (e.g. "Tennis Ball Machine", "Pickleball Ball Machine"), each
-- with its own access code, instructions, hourly rate, and pass pricing.
--
-- ball_machine_config stays in place, unused by the app after this ships, as a
-- rollback/inspection safety net. A later cleanup migration can drop it.

CREATE TABLE IF NOT EXISTS ball_machine_machines (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id      VARCHAR(50) NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  name             VARCHAR(100) NOT NULL DEFAULT 'Ball Machine',
  access_code      VARCHAR(32),
  instructions     TEXT,
  hourly_fee_cents INTEGER CHECK (hourly_fee_cents IS NULL OR hourly_fee_cents > 0),
  machine_count    INTEGER NOT NULL DEFAULT 1 CHECK (machine_count >= 1),
  is_active        BOOLEAN NOT NULL DEFAULT true,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by       UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ball_machine_machines_facility
  ON ball_machine_machines(facility_id, is_active, sort_order);

-- Pass products: machine_id NULL means the pass covers every machine at the
-- facility; a non-null machine_id scopes it to one specific machine. A plain
-- UNIQUE(facility_id, duration_months) can't enforce "one row per duration" in
-- both cases at once (NULLs are distinct from each other under a normal unique
-- constraint), so two partial unique indexes replace the old constraint.
ALTER TABLE ball_machine_pass_products
  ADD COLUMN IF NOT EXISTS machine_id UUID REFERENCES ball_machine_machines(id) ON DELETE CASCADE;

ALTER TABLE ball_machine_pass_products
  DROP CONSTRAINT IF EXISTS unique_ball_machine_pass_duration;

CREATE UNIQUE INDEX IF NOT EXISTS uq_bm_pass_product_all_machines
  ON ball_machine_pass_products(facility_id, duration_months)
  WHERE machine_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_bm_pass_product_per_machine
  ON ball_machine_pass_products(facility_id, machine_id, duration_months)
  WHERE machine_id IS NOT NULL;

-- Passes: machine_id mirrors the product purchased (NULL = covers all machines).
-- A member may hold an all-machines pass and a machine-specific pass at once —
-- that's by design, not a bug.
ALTER TABLE ball_machine_passes
  ADD COLUMN IF NOT EXISTS machine_id UUID REFERENCES ball_machine_machines(id) ON DELETE SET NULL;

-- Every ball-machine booking claims exactly one physical machine, resolved
-- server-side (never trust the client machineId directly).
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS ball_machine_id UUID REFERENCES ball_machine_machines(id) ON DELETE SET NULL;

-- Machine-scoped overlap check for per-machine machine_count enforcement. The old
-- facility-wide idx_bookings_ball_machine_claims (migration 079) stays in place —
-- it's still the fallback lock for any facility with zero rows in the new table.
CREATE INDEX IF NOT EXISTS idx_bookings_ball_machine_machine_claims
  ON bookings(facility_id, ball_machine_id, booking_date)
  WHERE add_ball_machine = true;

-- Backfill: one machine per facility that already adopted the old singleton system,
-- carrying over its access code/instructions/concurrency so nothing changes for an
-- existing adopter (e.g. St. Marlow) post-migration. Hourly rate is seeded from the
-- most common non-null per-court rate at that facility — a best-effort default the
-- admin can adjust in the new UI, since the old rate was stored per court, not
-- per facility.
INSERT INTO ball_machine_machines
  (facility_id, name, access_code, instructions, hourly_fee_cents, machine_count, is_active, sort_order, updated_at, updated_by)
SELECT
  c.facility_id,
  'Ball Machine',
  c.access_code,
  c.instructions,
  (
    SELECT mode() WITHIN GROUP (ORDER BY co.ball_machine_fee_cents)
      FROM courts co
     WHERE co.facility_id = c.facility_id AND co.ball_machine_fee_cents IS NOT NULL
  ),
  c.machine_count,
  true,
  0,
  NOW(),
  c.updated_by
FROM ball_machine_config c;

-- Repoint existing pass products/passes at the seeded machine so pricing and
-- member coverage are unchanged (rather than silently becoming "all machines").
UPDATE ball_machine_pass_products p
   SET machine_id = m.id
  FROM ball_machine_machines m
 WHERE m.facility_id = p.facility_id AND p.machine_id IS NULL;

UPDATE ball_machine_passes p
   SET machine_id = m.id
  FROM ball_machine_machines m
 WHERE m.facility_id = p.facility_id AND p.machine_id IS NULL;

-- bookings.ball_machine_id stays NULL for pre-existing rows (handled explicitly in
-- ballMachineService.canViewAccessCode as a single-machine transition-window case).

ALTER TABLE IF EXISTS public.ball_machine_machines ENABLE ROW LEVEL SECURITY;
