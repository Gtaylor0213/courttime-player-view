import express from 'express';
import { getFacilityLessonPosts } from '../../src/services/bulletinBoardService';
import { FEATURE_FLAGS } from '../../shared/constants/featureFlags';
import { hasActiveFacilityAdminRecord } from '../middleware/facilityAdmin';
import { requireFeatureFlag } from '../middleware/featureFlags';

const router = express.Router();

const checkFlag = requireFeatureFlag(FEATURE_FLAGS.LESSONS_TAB, 'Lessons are not enabled for this facility');

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
    if (scope === 'past' && !(await hasActiveFacilityAdminRecord(facilityId, req.user!.userId))) {
      return res.status(403).json({ success: false, error: 'Only facility admins can view past lessons' });
    }

    const posts = await getFacilityLessonPosts(facilityId, req.user?.userId, scope);
    res.json({ success: true, posts });
  } catch (error) {
    next(error);
  }
});

export default router;
