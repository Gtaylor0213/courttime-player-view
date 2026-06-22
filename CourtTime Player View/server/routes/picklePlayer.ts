import express from 'express';
import { requireAuth } from '../middleware/auth';
import { isOrgAdmin } from '../../src/services/pickle/pickleOrgService';
import {
  getPickleProfile,
  upsertPickleProfile,
  recordVisit,
  listVisits,
  listOrgPlayerProfiles,
  type VisitType,
} from '../../src/services/pickle/picklePlayerProfileService';
import {
  getPlayerLifecycle,
  getOrgLifecycleSummary,
} from '../../src/services/pickle/pickleLifecycleService';

const router = express.Router();

const VALID_VISIT_TYPES: VisitType[] = [
  'drop_in', 'open_play', 'clinic', 'league', 'tournament', 'court_booking', 'pro_shop', 'other',
];

async function requireOrgAdminOrSelf(
  req: express.Request,
  res: express.Response,
  orgId: string,
  targetUserId?: string
): Promise<boolean> {
  const userId = req.user!.userId;
  if (targetUserId && targetUserId === userId) return true;
  const admin = await isOrgAdmin(userId, orgId);
  if (!admin) {
    res.status(403).json({ success: false, error: 'Not authorized for this organization' });
    return false;
  }
  return true;
}

/**
 * GET /api/pickle/players/profile?orgId=
 * Current user's pickle profile (org-specific with global fallback)
 */
router.get('/players/profile', requireAuth, async (req, res, next) => {
  try {
    const orgId = (req.query.orgId as string) || undefined;
    const profile = await getPickleProfile(req.user!.userId, orgId);
    res.json({ success: true, data: { profile } });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/pickle/players/profile
 * Upsert current user's pickle profile
 */
router.put('/players/profile', requireAuth, async (req, res, next) => {
  try {
    const {
      orgId,
      duprRating,
      birthdate,
      primaryGoals,
      preferredFormats,
      preferredPrograms,
      availabilityJson,
      equipmentBrands,
    } = req.body;

    const profile = await upsertPickleProfile({
      userId: req.user!.userId,
      orgId: orgId ?? null,
      duprRating: duprRating != null ? Number(duprRating) : undefined,
      birthdate,
      primaryGoals,
      preferredFormats,
      preferredPrograms,
      availabilityJson,
      equipmentBrands,
    });

    res.json({ success: true, data: { profile } });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/pickle/orgs/:orgId/players/:userId/lifecycle
 */
router.get('/orgs/:orgId/players/:userId/lifecycle', requireAuth, async (req, res, next) => {
  try {
    const { orgId, userId } = req.params;
    if (!(await requireOrgAdminOrSelf(req, res, orgId, userId))) return;

    const lifecycle = await getPlayerLifecycle(userId, orgId);
    res.json({ success: true, data: lifecycle });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/pickle/orgs/:orgId/lifecycle/summary
 */
router.get('/orgs/:orgId/lifecycle/summary', requireAuth, async (req, res, next) => {
  try {
    const { orgId } = req.params;
    if (!(await requireOrgAdminOrSelf(req, res, orgId))) return;

    const summary = await getOrgLifecycleSummary(orgId);
    res.json({ success: true, data: summary });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/pickle/orgs/:orgId/players/:userId/visits
 */
router.get('/orgs/:orgId/players/:userId/visits', requireAuth, async (req, res, next) => {
  try {
    const { orgId, userId } = req.params;
    if (!(await requireOrgAdminOrSelf(req, res, orgId, userId))) return;

    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const visits = await listVisits(userId, orgId, limit);
    res.json({ success: true, data: { visits } });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/pickle/orgs/:orgId/visits
 * Record a visit (org admin or self)
 */
router.post('/orgs/:orgId/visits', requireAuth, async (req, res, next) => {
  try {
    const { orgId } = req.params;
    const { userId, facilityId, visitType, visitedAt } = req.body;
    const targetUserId = userId || req.user!.userId;

    if (!(await requireOrgAdminOrSelf(req, res, orgId, targetUserId))) return;

    if (!facilityId) {
      return res.status(400).json({ success: false, error: 'facilityId is required' });
    }
    if (visitType && !VALID_VISIT_TYPES.includes(visitType)) {
      return res.status(400).json({ success: false, error: 'Invalid visitType' });
    }

    const visit = await recordVisit({
      userId: targetUserId,
      facilityId,
      orgId,
      visitType,
      visitedAt,
    });

    res.status(201).json({ success: true, data: { visit } });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/pickle/orgs/:orgId/players
 * List org player profiles (org admin)
 */
router.get('/orgs/:orgId/players', requireAuth, async (req, res, next) => {
  try {
    const { orgId } = req.params;
    if (!(await requireOrgAdminOrSelf(req, res, orgId))) return;

    const limit = req.query.limit ? Number(req.query.limit) : 100;
    const offset = req.query.offset ? Number(req.query.offset) : 0;
    const players = await listOrgPlayerProfiles(orgId, limit, offset);
    res.json({ success: true, data: { players } });
  } catch (error) {
    next(error);
  }
});

export default router;
