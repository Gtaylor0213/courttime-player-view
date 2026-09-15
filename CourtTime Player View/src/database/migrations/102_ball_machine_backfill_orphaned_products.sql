-- Follow-up to 101: some facilities sold ball machine passes/pricing without ever
-- saving a ball_machine_config row (the "Access" card and "Pass pricing" card were
-- independent admin actions), so 101's backfill — which only read from
-- ball_machine_config — missed them. Their pass_products/passes were left with
-- machine_id NULL, which 101 treats as "covers all machines," but since those
-- facilities now also have zero ball_machine_machines rows, resolveSelectedMachine
-- returns null and resolveBallMachineCoverage never even looks at machine_id —
-- their active pass holders would silently start being charged again.
--
-- Seed one machine for each such facility (same shape as 101's backfill, minus the
-- access code/instructions that only ever lived on the missing config row) and
-- repoint their orphaned products/passes at it.

INSERT INTO ball_machine_machines
  (facility_id, name, access_code, instructions, hourly_fee_cents, machine_count, is_active, sort_order, updated_at)
SELECT
  orphan.facility_id,
  'Ball Machine',
  NULL,
  NULL,
  (
    SELECT mode() WITHIN GROUP (ORDER BY co.ball_machine_fee_cents)
      FROM courts co
     WHERE co.facility_id = orphan.facility_id AND co.ball_machine_fee_cents IS NOT NULL
  ),
  1,
  true,
  0,
  NOW()
FROM (
  SELECT DISTINCT facility_id FROM ball_machine_pass_products WHERE machine_id IS NULL
  UNION
  SELECT DISTINCT facility_id FROM ball_machine_passes WHERE machine_id IS NULL
) orphan
WHERE NOT EXISTS (
  SELECT 1 FROM ball_machine_machines m WHERE m.facility_id = orphan.facility_id
);

UPDATE ball_machine_pass_products p
   SET machine_id = m.id
  FROM ball_machine_machines m
 WHERE m.facility_id = p.facility_id AND p.machine_id IS NULL;

UPDATE ball_machine_passes p
   SET machine_id = m.id
  FROM ball_machine_machines m
 WHERE m.facility_id = p.facility_id AND p.machine_id IS NULL;
