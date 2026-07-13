import express from 'express';
import { query } from '../../src/database/connection';
import { isFeatureEnabled } from '../../src/services/featureFlagService';
import { getFacilityLessonPosts } from '../../src/services/bulletinBoardService';
import { FEATURE_FLAGS } from '../../shared/constants/featureFlags';

const router = express.Router();

async function checkFlag(facilityId: string, res: express.Response): Promise<boolean> {
  const enabled = await isFeatureEnabled(facilityId, FEATURE_FLAGS.LESSONS_TAB);
  if (!enabled) {
    res.status(403).json({ success: false, error: 'Lessons are not enabled for this facility' });
    return false;
  }
  return true;
}

async function userIsFacilityAdmin(userId: string, facilityId: string): Promise<boolean> {
  const result = await query(
    `SELECT 1 FROM facility_admins
     WHERE facility_id = $1 AND user_id = $2 AND status = 'active'
     LIMIT 1`,
    [facilityId, userId]
  );
  return result.rows.length > 0;
}

/**
 * GET /api/lessons/:facilityId?scope=upcoming|past
 * Lesson posts for the Lessons tab. Same underlying bulletin posts the
 * bulletin board and calendar serve. Past scope is admin-only (management view).
 */
router.get('/:facilityId', async (req, res, next) => {
  try {
    const { facilityId } = req.params;
    if (!(await checkFlag(facilityId, res))) return;

    const scope = req.query.scope === 'past' ? 'past' : 'upcoming';
    if (scope === 'past' && !(await userIsFacilityAdmin(req.user!.userId, facilityId))) {
      return res.status(403).json({ success: false, error: 'Only facility admins can view past lessons' });
    }

    const posts = await getFacilityLessonPosts(facilityId, req.user?.userId, scope);
    res.json({ success: true, posts });
  } catch (error) {
    next(error);
  }
});

export default router;
