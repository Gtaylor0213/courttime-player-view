/**
 * CourtTime-Pickle route aggregator.
 * Mount at /api/pickle in server/index.ts:
 *
 *   import pickleRoutes from './routes/pickle';
 *   app.use('/api/pickle', pickleRoutes);
 */

import express from 'express';
import pickleOrgRoutes from '../pickleOrg';
import pickleMembershipRoutes from '../pickleMembership';
import pickleProgramsRoutes from '../picklePrograms';
import picklePlayerRoutes from '../picklePlayer';
import pickleCampaignsRoutes from '../pickleCampaigns';
import pickleRetailRoutes from '../pickleRetail';
import pickleReportingRoutes from '../pickleReporting';
import pickleLeaderboardRoutes from '../pickleLeaderboard';
import pickleFacilityRoutes from '../pickleFacility';

const router = express.Router();

router.use(pickleOrgRoutes);
router.use(pickleFacilityRoutes);
router.use(pickleMembershipRoutes);
router.use('/programs', pickleProgramsRoutes);
router.use(picklePlayerRoutes);
router.use(pickleCampaignsRoutes);
router.use('/orgs/:orgId/retail', pickleRetailRoutes);
router.use('/orgs/:orgId/reports', pickleReportingRoutes);
router.use('/leaderboards', pickleLeaderboardRoutes);

export default router;
