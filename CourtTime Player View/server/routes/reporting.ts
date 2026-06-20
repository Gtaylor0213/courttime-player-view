import express from 'express';
import { isFacilityAdmin } from '../../src/services/memberService';
import { query } from '../../src/database/connection';
import { getTransactionReport } from '../../src/services/reportingService';

const router = express.Router();

async function requireFacilityAdmin(facilityId: string, userId: string | undefined): Promise<boolean> {
  if (!userId) return false;
  const adminFromTable = await query(
    `SELECT 1 FROM facility_admins WHERE facility_id = $1 AND user_id = $2 AND status = 'active'`,
    [facilityId, userId]
  );
  return adminFromTable.rows.length > 0 || (await isFacilityAdmin(facilityId, userId));
}

/**
 * GET /api/reports/transactions/:facilityId
 * Query params: start (YYYY-MM-DD), end (YYYY-MM-DD), type (optional)
 */
router.get('/transactions/:facilityId', async (req, res) => {
  try {
    const { facilityId } = req.params;

    if (!await requireFacilityAdmin(facilityId, req.user?.userId)) {
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
