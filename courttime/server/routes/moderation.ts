/**
 * Moderation API Routes
 * Blocking members and reporting offensive content (App Store Guideline 1.2).
 */

import express from 'express';
import {
  ModerationError,
  blockUser,
  createContentReport,
  facilityIdForReport,
  listBlockedUsers,
  listContentReports,
  resolveContentReport,
  unblockUser,
} from '../../src/services/moderationService';
import { isFacilityAdminUser } from '../middleware/facilityAdmin';

const router = express.Router();

function handleError(res: express.Response, error: any, context: string) {
  if (error instanceof ModerationError) {
    return res.status(error.status).json({ success: false, error: error.message });
  }
  console.error(`[Moderation] ${context}:`, error);
  return res.status(500).json({ success: false, error: 'Something went wrong. Please try again.' });
}

/**
 * GET /api/moderation/blocks
 * Members the caller has blocked.
 */
router.get('/blocks', async (req, res) => {
  try {
    const blockedUsers = await listBlockedUsers(req.user!.userId);
    res.json({ success: true, data: { blockedUsers } });
  } catch (error) {
    handleError(res, error, 'list blocks');
  }
});

/**
 * POST /api/moderation/blocks
 * Body: { userId }
 */
router.post('/blocks', async (req, res) => {
  try {
    await blockUser(req.user!.userId, req.body?.userId);
    res.json({ success: true });
  } catch (error) {
    handleError(res, error, 'block user');
  }
});

/**
 * DELETE /api/moderation/blocks/:userId
 */
router.delete('/blocks/:userId', async (req, res) => {
  try {
    await unblockUser(req.user!.userId, req.params.userId);
    res.json({ success: true });
  } catch (error) {
    handleError(res, error, 'unblock user');
  }
});

/**
 * POST /api/moderation/reports
 * Body: { contentType, contentId, reason, details?, facilityId? }
 */
router.post('/reports', async (req, res) => {
  try {
    const body = req.body || {};
    const reportId = await createContentReport({
      reporterId: req.user!.userId,
      contentType: body.contentType,
      contentId: body.contentId,
      reason: body.reason,
      details: body.details,
      facilityId: body.facilityId,
    });
    res.status(201).json({ success: true, data: { reportId } });
  } catch (error) {
    handleError(res, error, 'create report');
  }
});

/**
 * GET /api/moderation/reports/facility/:facilityId?status=open|closed
 * A club admin's review queue: reported bulletin and hitting-partner posts at
 * their club. Reported private messages go to the CourtTime team instead.
 */
router.get('/reports/facility/:facilityId', async (req, res) => {
  try {
    const { facilityId } = req.params;
    if (!(await isFacilityAdminUser(facilityId, req.user!.userId))) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    const reports = await listContentReports({
      facilityId,
      status: req.query.status === 'closed' ? 'closed' : 'open',
    });
    res.json({ success: true, data: { reports } });
  } catch (error) {
    handleError(res, error, 'list reports');
  }
});

/**
 * POST /api/moderation/reports/:reportId/resolve
 * Body: { action: 'remove' | 'dismiss' }
 */
router.post('/reports/:reportId/resolve', async (req, res) => {
  try {
    const { reportId } = req.params;
    const facilityId = await facilityIdForReport(reportId);
    if (!facilityId || !(await isFacilityAdminUser(facilityId, req.user!.userId))) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    await resolveContentReport({
      reportId,
      action: req.body?.action,
      resolvedBy: req.user!.userId,
      restrictToFacilityId: facilityId,
    });
    res.json({ success: true });
  } catch (error) {
    handleError(res, error, 'resolve report');
  }
});

export default router;
