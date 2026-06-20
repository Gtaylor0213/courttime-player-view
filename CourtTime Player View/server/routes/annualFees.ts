import express from 'express';
import { query } from '../../src/database/connection';
import { isFeatureEnabled } from '../../src/services/featureFlagService';
import { isFacilityAdmin } from '../../src/services/memberService';
import {
  getAnnualFeeTiers,
  createAnnualFeeTier,
  updateAnnualFeeTier,
  deleteAnnualFeeTier,
  getAnnualFeeConfig,
  upsertAnnualFeeConfig,
  assignMemberTier,
  getMembersWithTiers,
  previewBillingRun,
  runAnnualBilling,
  getBillingRuns,
  getBillingRunRecords,
} from '../../src/services/annualFeeService';

const router = express.Router();
const FLAG = 'annual_membership_fees';

async function requireAdmin(facilityId: string, userId: string | undefined, res: express.Response): Promise<boolean> {
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

async function checkFlag(facilityId: string, res: express.Response): Promise<boolean> {
  const enabled = await isFeatureEnabled(facilityId, FLAG);
  if (!enabled) {
    res.status(403).json({ success: false, error: 'Annual Membership Fees is not enabled for this facility' });
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Billing config
// ---------------------------------------------------------------------------

router.get('/config/:facilityId', async (req, res) => {
  try {
    const { facilityId } = req.params;
    if (!await checkFlag(facilityId, res)) return;
    if (!await requireAdmin(facilityId, req.user?.userId, res)) return;
    const config = await getAnnualFeeConfig(facilityId);
    res.json({ success: true, data: config });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/config/:facilityId', async (req, res) => {
  try {
    const { facilityId } = req.params;
    if (!await checkFlag(facilityId, res)) return;
    if (!await requireAdmin(facilityId, req.user?.userId, res)) return;
    const { billingMonth, billingDay } = req.body;
    if (!billingMonth || !billingDay) {
      return res.status(400).json({ success: false, error: 'billingMonth and billingDay are required' });
    }
    const config = await upsertAnnualFeeConfig(facilityId, Number(billingMonth), Number(billingDay));
    res.json({ success: true, data: config });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ---------------------------------------------------------------------------
// Tiers
// ---------------------------------------------------------------------------

router.get('/tiers/:facilityId', async (req, res) => {
  try {
    const { facilityId } = req.params;
    if (!await checkFlag(facilityId, res)) return;
    if (!await requireAdmin(facilityId, req.user?.userId, res)) return;
    const tiers = await getAnnualFeeTiers(facilityId);
    res.json({ success: true, data: tiers });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/tiers/:facilityId', async (req, res) => {
  try {
    const { facilityId } = req.params;
    if (!await checkFlag(facilityId, res)) return;
    if (!await requireAdmin(facilityId, req.user?.userId, res)) return;
    const { name, amountCents, description } = req.body;
    if (!name || amountCents === undefined) {
      return res.status(400).json({ success: false, error: 'name and amountCents are required' });
    }
    const tier = await createAnnualFeeTier(facilityId, name, Number(amountCents), description);
    res.status(201).json({ success: true, data: tier });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.patch('/tiers/:facilityId/:tierId', async (req, res) => {
  try {
    const { facilityId, tierId } = req.params;
    if (!await checkFlag(facilityId, res)) return;
    if (!await requireAdmin(facilityId, req.user?.userId, res)) return;
    const { name, amountCents, description, isActive } = req.body;
    const tier = await updateAnnualFeeTier(tierId, facilityId, {
      name,
      amountCents: amountCents !== undefined ? Number(amountCents) : undefined,
      description,
      isActive,
    });
    res.json({ success: true, data: tier });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/tiers/:facilityId/:tierId', async (req, res) => {
  try {
    const { facilityId, tierId } = req.params;
    if (!await checkFlag(facilityId, res)) return;
    if (!await requireAdmin(facilityId, req.user?.userId, res)) return;
    await deleteAnnualFeeTier(tierId, facilityId);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ---------------------------------------------------------------------------
// Members + tier assignment
// ---------------------------------------------------------------------------

router.get('/members/:facilityId', async (req, res) => {
  try {
    const { facilityId } = req.params;
    if (!await checkFlag(facilityId, res)) return;
    if (!await requireAdmin(facilityId, req.user?.userId, res)) return;
    const members = await getMembersWithTiers(facilityId);
    res.json({ success: true, data: members });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.patch('/members/:facilityId/:userId/tier', async (req, res) => {
  try {
    const { facilityId, userId } = req.params;
    if (!await checkFlag(facilityId, res)) return;
    if (!await requireAdmin(facilityId, req.user?.userId, res)) return;
    const { tierId } = req.body;
    await assignMemberTier(facilityId, userId, tierId ?? null);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ---------------------------------------------------------------------------
// Billing
// ---------------------------------------------------------------------------

router.get('/billing/preview/:facilityId', async (req, res) => {
  try {
    const { facilityId } = req.params;
    if (!await checkFlag(facilityId, res)) return;
    if (!await requireAdmin(facilityId, req.user?.userId, res)) return;
    const preview = await previewBillingRun(facilityId);
    res.json({ success: true, data: preview });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/billing/run/:facilityId', async (req, res) => {
  try {
    const { facilityId } = req.params;
    if (!await checkFlag(facilityId, res)) return;
    if (!await requireAdmin(facilityId, req.user?.userId, res)) return;
    const result = await runAnnualBilling(facilityId, req.user!.userId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/billing/history/:facilityId', async (req, res) => {
  try {
    const { facilityId } = req.params;
    if (!await checkFlag(facilityId, res)) return;
    if (!await requireAdmin(facilityId, req.user?.userId, res)) return;
    const runs = await getBillingRuns(facilityId);
    res.json({ success: true, data: runs });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/billing/runs/:runId/:facilityId', async (req, res) => {
  try {
    const { runId, facilityId } = req.params;
    if (!await checkFlag(facilityId, res)) return;
    if (!await requireAdmin(facilityId, req.user?.userId, res)) return;
    const records = await getBillingRunRecords(runId, facilityId);
    res.json({ success: true, data: records });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
