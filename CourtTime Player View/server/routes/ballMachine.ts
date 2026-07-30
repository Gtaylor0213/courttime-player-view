/**
 * St. Marlow Ball Machine routes (st_marlow_ball_machine feature flag).
 *
 * Mounted at /api/ball-machine. Members buy time-based passes here; the per-hour
 * rate stays on courts.ball_machine_fee_cents and is charged through the normal
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
  getActivePass,
  getConfig,
  getMemberPasses,
  getPassHolders,
  getPassProducts,
  grantPass,
  revokePass,
  upsertConfig,
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

// ---------------------------------------------------------------------------
// Member
// ---------------------------------------------------------------------------

/**
 * Everything the player tab needs. Deliberately omits the access code — that is
 * gated separately behind GET /access-code/:facilityId.
 */
router.get('/status/:facilityId', async (req, res) => {
  try {
    const { facilityId } = req.params;
    if (!(await checkFlag(facilityId, res))) return;
    if (!(await requireMember(facilityId, req.user?.userId, res))) return;

    const userId = req.user!.userId;
    const [config, products, activePass, passes] = await Promise.all([
      getConfig(facilityId),
      getPassProducts(facilityId, { activeOnly: true }),
      getActivePass(facilityId, userId),
      getMemberPasses(facilityId, userId),
    ]);

    // The hourly rate lives per-court; surface the cheapest configured one as the
    // "from" price so the player tab can explain the pay-per-use alternative.
    const hourly = await query(
      `SELECT MIN(ball_machine_fee_cents) AS "hourlyFromCents"
         FROM courts
        WHERE facility_id = $1 AND ball_machine_fee_cents IS NOT NULL`,
      [facilityId]
    );

    res.json({
      success: true,
      data: {
        machineCount: config.machineCount,
        instructions: config.instructions,
        hasAccessCode: Boolean(config.accessCode),
        products,
        activePass,
        passes,
        hourlyFromCents: hourly.rows[0]?.hourlyFromCents ?? null,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * The keypad code. Only for members who hold a live pass or who have a booking
 * where they claimed the machine (i.e. they already paid one way or the other).
 */
router.get('/access-code/:facilityId', async (req, res) => {
  try {
    const { facilityId } = req.params;
    if (!(await checkFlag(facilityId, res))) return;
    if (!(await requireMember(facilityId, req.user?.userId, res))) return;

    const userId = req.user!.userId;
    if (!(await canViewAccessCode(facilityId, userId))) {
      return res.status(403).json({
        success: false,
        error: 'Buy a ball machine pass or add the machine to a booking to see the code',
      });
    }

    const config = await getConfig(facilityId);
    if (!config.accessCode) {
      return res.status(404).json({
        success: false,
        error: 'The club has not set an access code yet. Please ask the front desk.',
      });
    }

    const activePass = await getActivePass(facilityId, userId);
    res.json({
      success: true,
      data: {
        accessCode: config.accessCode,
        instructions: config.instructions,
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

    const base = defaultAppUrl();
    const { url } = await createBallMachinePassCheckoutSession({
      facilityId,
      memberId: req.user!.userId,
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
// Admin
// ---------------------------------------------------------------------------

router.get('/admin/config/:facilityId', async (req, res) => {
  try {
    const { facilityId } = req.params;
    if (!(await checkFlag(facilityId, res))) return;
    if (!(await requireAdmin(facilityId, req.user?.userId, res))) return;

    const [config, products] = await Promise.all([
      getConfig(facilityId),
      getPassProducts(facilityId),
    ]);
    res.json({ success: true, data: { config, products } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/admin/config/:facilityId', async (req, res) => {
  try {
    const { facilityId } = req.params;
    if (!(await checkFlag(facilityId, res))) return;
    if (!(await requireAdmin(facilityId, req.user?.userId, res))) return;

    const { accessCode, machineCount, instructions } = req.body || {};
    const config = await upsertConfig(
      facilityId,
      {
        ...(accessCode !== undefined ? { accessCode } : {}),
        ...(machineCount !== undefined ? { machineCount: Number(machineCount) } : {}),
        ...(instructions !== undefined ? { instructions } : {}),
      },
      req.user!.userId
    );
    res.json({ success: true, data: config });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/** Replaces the whole price list in one call — the admin form edits all four rows together. */
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
      await upsertPassProduct(
        facilityId,
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

    const memberCheck = await query(
      `SELECT 1 FROM facility_memberships WHERE facility_id = $1 AND user_id = $2`,
      [facilityId, userId]
    );
    if (memberCheck.rows.length === 0) {
      return res.status(400).json({ success: false, error: 'That user is not a member of this club' });
    }

    const pass = await grantPass({
      facilityId,
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
