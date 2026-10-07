import express from 'express';
import { requireAuth } from '../middleware/auth';
import { getLeaderboard } from '../../src/services/pickle/pickleLeaderboardService';

const router = express.Router();

/**
 * GET /api/pickle/leaderboards/facilities/:facilityId
 * Club leaderboard for a pickle facility.
 */
router.get('/facilities/:facilityId', requireAuth, async (req, res, next) => {
  try {
    const { facilityId } = req.params;
    const metric = req.query.metric as string | undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;

    const leaderboard = await getLeaderboard({
      facilityId,
      metric,
      limit,
      currentUserId: req.user!.userId,
    });

    res.json({ success: true, data: { leaderboard } });
  } catch (err: any) {
    const status = err.message?.includes('not found') ? 404 : 400;
    return res.status(status).json({ success: false, error: err.message || 'Failed to load leaderboard' });
  }
});

/**
 * GET /api/pickle/leaderboards/orgs/:orgId
 * Org-wide leaderboard aggregated across pickle locations.
 */
router.get('/orgs/:orgId', requireAuth, async (req, res, next) => {
  try {
    const { orgId } = req.params;
    const metric = req.query.metric as string | undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;

    const leaderboard = await getLeaderboard({
      orgId,
      metric,
      limit,
      currentUserId: req.user!.userId,
    });

    res.json({ success: true, data: { leaderboard } });
  } catch (err: any) {
    const status = err.message?.includes('not found') ? 404 : 400;
    return res.status(status).json({ success: false, error: err.message || 'Failed to load leaderboard' });
  }
});

export default router;
