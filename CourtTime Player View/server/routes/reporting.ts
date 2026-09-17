import express from 'express';
import { getTransactionReport } from '../../src/services/reportingService';
import { isFacilityAdminRecordOrMembership } from '../middleware/facilityAdmin';

const router = express.Router();

/**
 * GET /api/reports/transactions/:facilityId
 * Query params: start (YYYY-MM-DD), end (YYYY-MM-DD), type (optional)
 */
router.get('/transactions/:facilityId', async (req, res) => {
  try {
    const { facilityId } = req.params;

    if (!await isFacilityAdminRecordOrMembership(facilityId, req.user?.userId)) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    const now = new Date();
    const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const defaultEnd   = now.toISOString().slice(0, 10);

    const start      = (req.query.start as string) || defaultStart;
    const end        = (req.query.end   as string) || defaultEnd;
    const typeFilter = (req.query.type  as string) || 'all';

    const report = await getTransactionReport(facilityId, start, end, typeFilter);
    res.json({ success: true, data: report });
  } catch (error: any) {
    console.error('[Reports] Transaction report error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
