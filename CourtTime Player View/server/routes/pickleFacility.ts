import express from 'express';
import { requireAuth } from '../middleware/auth';
import {
  completeFranchiseSetup,
  getFacilitySummary,
  isOrgAdmin,
} from '../../src/services/pickle/pickleOrgService';
import { isFacilityAdmin } from '../../src/services/memberService';

const router = express.Router();

async function canViewFacilitySummary(userId: string, facilityId: string): Promise<boolean> {
  if (await isFacilityAdmin(facilityId, userId)) return true;
  const summary = await getFacilitySummary(facilityId);
  if (summary?.orgId && (await isOrgAdmin(userId, summary.orgId))) return true;
  return false;
}

/**
 * GET /api/pickle/facilities/:facilityId/summary
 */
router.get('/facilities/:facilityId/summary', requireAuth, async (req, res, next) => {
  try {
    const { facilityId } = req.params;
    const allowed = await canViewFacilitySummary(req.user!.userId, facilityId);
    if (!allowed) {
      return res.status(403).json({ success: false, error: 'Not authorized for this location' });
    }

    const summary = await getFacilitySummary(facilityId);
    if (!summary) {
      return res.status(404).json({ success: false, error: 'Facility not found' });
    }

    res.json({ success: true, data: summary });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/pickle/facilities/:facilityId/complete-setup
 */
router.post('/facilities/:facilityId/complete-setup', requireAuth, async (req, res, next) => {
  try {
    const { facilityId } = req.params;
    const {
      streetAddress,
      city,
      state,
      zipCode,
      phone,
      courtCount,
      operatingHours,
    } = req.body;

    if (!streetAddress || !city || !state || !zipCode || !operatingHours) {
      return res.status(400).json({ success: false, error: 'Missing required setup fields' });
    }

    const result = await completeFranchiseSetup(facilityId, req.user!.userId, {
      streetAddress,
      city,
      state,
      zipCode,
      phone,
      courtCount: courtCount || 4,
      operatingHours,
    });

    res.json({ success: true, data: result });
  } catch (err: any) {
    const message = err.message || 'Failed to complete setup';
    const status = message.includes('Not authorized') ? 403 : 400;
    return res.status(status).json({ success: false, error: message });
  }
});

export default router;
