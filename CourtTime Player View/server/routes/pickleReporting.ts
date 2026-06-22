import express from 'express';
import { requireAuth } from '../middleware/auth';
import { isOrgAdmin } from '../../src/services/pickle/pickleOrgService';
import {
  getOrgRevenueRollup,
  getProgramAnalytics,
  getPlayerLifecycleSegments,
} from '../../src/services/pickle/pickleReportingService';

const router = express.Router({ mergeParams: true });

async function requireOrgAdmin(req: express.Request, res: express.Response, orgId: string) {
  const admin = await isOrgAdmin(req.user!.userId, orgId);
  if (!admin) {
    res.status(403).json({ success: false, error: 'Not authorized for this organization' });
    return false;
  }
  return true;
}

/**
 * GET /api/pickle/orgs/:orgId/reports/revenue
 */
router.get('/revenue', requireAuth, async (req, res, next) => {
  try {
    const { orgId } = req.params;
    if (!(await requireOrgAdmin(req, res, orgId))) return;

    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;

    const report = await getOrgRevenueRollup(orgId, { startDate, endDate });
    res.json({ success: true, data: report });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/pickle/orgs/:orgId/reports/programs
 */
router.get('/programs', requireAuth, async (req, res, next) => {
  try {
    const { orgId } = req.params;
    if (!(await requireOrgAdmin(req, res, orgId))) return;

    const report = await getProgramAnalytics(orgId);
    res.json({ success: true, data: report });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/pickle/orgs/:orgId/reports/lifecycle
 */
router.get('/lifecycle', requireAuth, async (req, res, next) => {
  try {
    const { orgId } = req.params;
    if (!(await requireOrgAdmin(req, res, orgId))) return;

    const report = await getPlayerLifecycleSegments(orgId);
    res.json({ success: true, data: report });
  } catch (error) {
    next(error);
  }
});

export default router;
