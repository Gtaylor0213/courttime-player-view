/**
 * Ball Machine routes (st_marlow_ball_machine feature flag).
 *
 * Mounted at /api/ball-machine. A facility can configure one or more named
 * machines; members buy time-based passes here (scoped to one machine or to
 * "all machines"), and the per-machine hourly rate is charged through the normal
 * court-booking checkout.
 */

import express from 'express';
import { isFeatureEnabled } from '../../src/services/featureFlagService';
import { isFacilityAdmin } from '../../src/services/memberService';
import { query } from '../../src/database/connection';
import { FEATURE_FLAGS } from '../../shared/constants/featureFlags';
import {
  PASS_DURATIONS_MONTHS,
  canViewAccessCode,
  createMachine,
  deactivateMachine,
  getActivePassForMachine,
  getActivePasses,
  getMachine,
  getMemberPasses,
  getPassHolders,
  getPassProducts,
  grantPass,
  listMachines,
  reorderMachines,
  revokePass,
  updateMachine,
  upsertPassProduct,
} from '../../src/services/ballMachineService';
import {
  confirmBallMachinePassCheckout,
  createBallMachinePassCheckoutSession,
} from '../../src/services/stripeConnectService';

const router = express.Router();

/** False (and responds) when the facility doesn't have the feature turned on. */
async function checkFlag(facilityId: string, res: express.Response): Promise<boolean> {
  if (!(await isFeatureEnabled(facilityId, FEATURE_FLAGS.BALL_MACHINE))) {
    res.status(403).json({
      success: false,
      error: 'The ball machine is not enabled for this facility',
    });
    return false;
  }
  return true;
}

async function requireAdmin(
  facilityId: string,
  userId: string | undefined,
  res: express.Response
): Promise<boolean> {
  if (!userId) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return false;
  }
  const adminRow = await query(
    `SELECT 1 FROM facility_admins WHERE facility_id = $1 AND user_id = $2 AND status = 'active'`,
    [facilityId, userId]
  );
  if (adminRow.rows.length === 0 && !(await isFacilityAdmin(facilityId, userId))) {
    res.status(403).json({ success: false, error: 'Facility admin access required' });
    return false;
  }
  return true;
}

async function requireMember(
  facilityId: string,
  userId: string | undefined,
  res: express.Response
): Promise<boolean> {
  if (!userId) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return false;
  }
  const result = await query(
    `SELECT 1 FROM facility_memberships
      WHERE facility_id = $1 AND user_id = $2 AND status = 'active'`,
    [facilityId, userId]
  );
  if (result.rows.length === 0 && !(await isFacilityAdmin(facilityId, userId))) {
    res.status(403).json({ success: false, error: 'Not a member of this club' });
    return false;
  }
  return true;
}

function defaultAppUrl(): string {
  return process.env.NODE_ENV !== 'production'
    ? process.env.DEV_APP_URL || 'http://localhost:5173'
    : process.env.APP_URL || 'http://localhost:5173';
}

function parseMachineIdBody(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  return String(value);
}

// ---------------------------------------------------------------------------
// Member
// ---------------------------------------------------------------------------

/**
 * Everything the player tab needs. Deliberately omits access codes — those are
 * gated separately behind GET /access-code/:facilityId/:machineId.
 */
router.get('/status/:facilityId', async (req, res) => {
  try {
    const { facilityId } = req.params;
    if (!(await checkFlag(facilityId, res))) return;
    if (!(await requireMember(facilityId, req.user?.userId, res))) return;

    const userId = req.user!.userId;
    const [machines, products, activePasses, passes] = await Promise.all([
      listMachines(facilityId, { activeOnly: true }),
      getPassProducts(facilityId, { activeOnly: true }),
      getActivePasses(facilityId, userId),
      getMemberPasses(facilityId, userId),
    ]);

    res.json({
      success: true,
      data: {
        machines: machines.map((m) => ({
          id: m.id,
          name: m.name,
          isActive: m.isActive,
          hourlyFeeCents: m.hourlyFeeCents,
          machineCount: m.machineCount,
          hasAccessCode: Boolean(m.accessCode),
        })),
        products,
        activePasses,
        passes,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * The keypad code for one machine. Only for members who hold a covering pass or
 * who have a booking where they claimed that machine (i.e. they already paid).
 */
router.get('/access-code/:facilityId/:machineId', async (req, res) => {
  try {
    const { facilityId, machineId } = req.params;
    if (!(await checkFlag(facilityId, res))) return;
    if (!(await requireMember(facilityId, req.user?.userId, res))) return;

    const userId = req.user!.userId;
    const machine = await getMachine(facilityId, machineId);
    if (!machine || !machine.isActive) {
      return res.status(404).json({ success: false, error: 'That ball machine is not available' });
    }

    if (!(await canViewAccessCode(facilityId, userId, machineId))) {
      return res.status(403).json({
        success: false,
        error: 'Buy a ball machine pass or add the machine to a booking to see the code',
      });
    }

    if (!machine.accessCode) {
      return res.status(404).json({
        success: false,
        error: 'The club has not set an access code yet. Please ask the front desk.',
      });
    }

    const activePass = await getActivePassForMachine(facilityId, userId, machineId);
    res.json({
      success: true,
      data: {
        machineName: machine.name,
        accessCode: machine.accessCode,
        instructions: machine.instructions,
        activePass,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * MUST stay above POST /purchase/:facilityId — Express matches in registration
 * order, so the parameterised route would otherwise swallow this one and treat
 * "confirm" as a facility id (403, and the member is told their paid pass failed).
 */
router.post('/purchase/confirm', async (req, res) => {
  try {
    const sessionId = String(req.body?.sessionId || '');
    if (!sessionId) {
      return res.status(400).json({ success: false, error: 'sessionId is required' });
    }
    const result = await confirmBallMachinePassCheckout({
      sessionId,
      memberId: req.user!.userId,
    });
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/purchase/:facilityId', async (req, res) => {
  try {
    const { facilityId } = req.params;
    if (!(await checkFlag(facilityId, res))) return;
    if (!(await requireMember(facilityId, req.user?.userId, res))) return;

    const durationMonths = Number(req.body?.durationMonths);
    if (!PASS_DURATIONS_MONTHS.includes(durationMonths as any)) {
      return res.status(400).json({
        success: false,
        error: `durationMonths must be one of ${PASS_DURATIONS_MONTHS.join(', ')}`,
      });
    }
    const machineId = parseMachineIdBody(req.body?.machineId);
    if (machineId) {
      const machine = await getMachine(facilityId, machineId);
      if (!machine || !machine.isActive) {
        return res.status(400).json({ success: false, error: 'That ball machine is not available' });
      }
    }

    const base = defaultAppUrl();
    const { url } = await createBallMachinePassCheckoutSession({
      facilityId,
      memberId: req.user!.userId,
      machineId,
      durationMonths,
      successUrl:
        req.body?.successUrl ||
        `${base}/ball-machine?passPurchaseSuccess=1&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: req.body?.cancelUrl || `${base}/ball-machine?passPurchaseCancelled=1`,
    });

    res.json({ success: true, data: { url } });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ---------------------------------------------------------------------------
// Admin — machines
// ---------------------------------------------------------------------------

router.get('/admin/machines/:facilityId', async (req, res) => {
  try {
    const { facilityId } = req.params;
    if (!(await checkFlag(facilityId, res))) return;
    if (!(await requireAdmin(facilityId, req.user?.userId, res))) return;

    res.json({ success: true, data: await listMachines(facilityId) });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/admin/machines/:facilityId', async (req, res) => {
  try {
    const { facilityId } = req.params;
    if (!(await checkFlag(facilityId, res))) return;
    if (!(await requireAdmin(facilityId, req.user?.userId, res))) return;

    const { name, accessCode, instructions, hourlyFeeCents, machineCount } = req.body || {};
    const machine = await createMachine(
      facilityId,
      {
        name,
        accessCode: accessCode ?? null,
        instructions: instructions ?? null,
        hourlyFeeCents:
          hourlyFeeCents === null || hourlyFeeCents === undefined ? null : Number(hourlyFeeCents),
        machineCount: machineCount === undefined ? undefined : Number(machineCount),
      },
      req.user!.userId
    );
    res.status(201).json({ success: true, data: machine });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * MUST stay above PUT /admin/machines/:facilityId/:machineId — same route-order
 * pitfall as /purchase/confirm above: both paths have the same segment count, so
 * :machineId would otherwise swallow "reorder" as a machine id.
 */
router.put('/admin/machines/:facilityId/reorder', async (req, res) => {
  try {
    const { facilityId } = req.params;
    if (!(await checkFlag(facilityId, res))) return;
    if (!(await requireAdmin(facilityId, req.user?.userId, res))) return;

    const machineIds = req.body?.machineIds;
    if (!Array.isArray(machineIds) || machineIds.some((id) => typeof id !== 'string')) {
      return res.status(400).json({ success: false, error: 'machineIds must be an array of ids' });
    }

    await reorderMachines(facilityId, machineIds, req.user!.userId);
    res.json({ success: true, data: await listMachines(facilityId) });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.put('/admin/machines/:facilityId/:machineId', async (req, res) => {
  try {
    const { facilityId, machineId } = req.params;
    if (!(await checkFlag(facilityId, res))) return;
    if (!(await requireAdmin(facilityId, req.user?.userId, res))) return;

    const { name, accessCode, instructions, hourlyFeeCents, machineCount, isActive } = req.body || {};
    const machine = await updateMachine(
      facilityId,
      machineId,
      {
        ...(name !== undefined ? { name } : {}),
        ...(accessCode !== undefined ? { accessCode } : {}),
        ...(instructions !== undefined ? { instructions } : {}),
        ...(hourlyFeeCents !== undefined
          ? { hourlyFeeCents: hourlyFeeCents === null ? null : Number(hourlyFeeCents) }
          : {}),
        ...(machineCount !== undefined ? { machineCount: Number(machineCount) } : {}),
        ...(isActive !== undefined ? { isActive: isActive === true } : {}),
      },
      req.user!.userId
    );
    res.json({ success: true, data: machine });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/** Soft-delete only: bookings/passes/products may reference the machine historically. */
router.delete('/admin/machines/:facilityId/:machineId', async (req, res) => {
  try {
    const { facilityId, machineId } = req.params;
    if (!(await checkFlag(facilityId, res))) return;
    if (!(await requireAdmin(facilityId, req.user?.userId, res))) return;

    await deactivateMachine(facilityId, machineId, req.user!.userId);
    res.json({ success: true, data: await listMachines(facilityId) });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ---------------------------------------------------------------------------
// Admin — pricing
// ---------------------------------------------------------------------------

router.get('/admin/products/:facilityId', async (req, res) => {
  try {
    const { facilityId } = req.params;
    if (!(await checkFlag(facilityId, res))) return;
    if (!(await requireAdmin(facilityId, req.user?.userId, res))) return;

    res.json({ success: true, data: await getPassProducts(facilityId) });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/** Replaces the whole price list in one call — the admin form edits every row together. */
router.put('/admin/products/:facilityId', async (req, res) => {
  try {
    const { facilityId } = req.params;
    if (!(await checkFlag(facilityId, res))) return;
    if (!(await requireAdmin(facilityId, req.user?.userId, res))) return;

    const products = req.body?.products;
    if (!Array.isArray(products)) {
      return res.status(400).json({ success: false, error: 'products must be an array' });
    }

    for (const p of products) {
      const machineId = parseMachineIdBody(p.machineId);
      if (machineId) {
        const machine = await getMachine(facilityId, machineId);
        if (!machine) {
          return res.status(400).json({ success: false, error: 'One of those machines was not found' });
        }
      }
      await upsertPassProduct(
        facilityId,
        machineId,
        Number(p.durationMonths),
        Number(p.priceCents),
        p.isActive === true
      );
    }

    res.json({ success: true, data: await getPassProducts(facilityId) });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ---------------------------------------------------------------------------
// Admin — passes
// ---------------------------------------------------------------------------

router.get('/admin/passes/:facilityId', async (req, res) => {
  try {
    const { facilityId } = req.params;
    if (!(await checkFlag(facilityId, res))) return;
    if (!(await requireAdmin(facilityId, req.user?.userId, res))) return;

    res.json({ success: true, data: await getPassHolders(facilityId) });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/** Comp a pass — no charge. Used for staff, trades, and service recovery. */
router.post('/admin/passes/:facilityId', async (req, res) => {
  try {
    const { facilityId } = req.params;
    if (!(await checkFlag(facilityId, res))) return;
    if (!(await requireAdmin(facilityId, req.user?.userId, res))) return;

    const { userId, durationMonths } = req.body || {};
    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId is required' });
    }
    if (!PASS_DURATIONS_MONTHS.includes(Number(durationMonths) as any)) {
      return res.status(400).json({
        success: false,
        error: `durationMonths must be one of ${PASS_DURATIONS_MONTHS.join(', ')}`,
      });
    }
    const machineId = parseMachineIdBody(req.body?.machineId);
    if (machineId) {
      const machine = await getMachine(facilityId, machineId);
      if (!machine) {
        return res.status(400).json({ success: false, error: 'That ball machine was not found' });
      }
    }

    const memberCheck = await query(
      `SELECT 1 FROM facility_memberships WHERE facility_id = $1 AND user_id = $2`,
      [facilityId, userId]
    );
    if (memberCheck.rows.length === 0) {
      return res.status(400).json({ success: false, error: 'That user is not a member of this club' });
    }

    const pass = await grantPass({
      facilityId,
      machineId,
      userId,
      durationMonths: Number(durationMonths),
      grantedBy: req.user!.userId,
    });
    res.status(201).json({ success: true, data: pass });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.delete('/admin/passes/:facilityId/:passId', async (req, res) => {
  try {
    const { facilityId, passId } = req.params;
    if (!(await checkFlag(facilityId, res))) return;
    if (!(await requireAdmin(facilityId, req.user?.userId, res))) return;

    const { revoked, count } = await revokePass(passId, facilityId);
    if (!revoked) {
      return res.status(404).json({ success: false, error: 'No active pass found to revoke' });
    }
    res.json({ success: true, data: { count } });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

export default router;
