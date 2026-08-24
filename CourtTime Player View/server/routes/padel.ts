import express from 'express';
import { query } from '../../src/database/connection';
import { isFeatureEnabled } from '../../src/services/featureFlagService';
import { FEATURE_FLAGS } from '../../shared/constants/featureFlags';
import {
  createSession,
  joinSession,
  leaveSession,
  listOpenSessions,
  startSession,
  generateNextRound,
  recordMatchScore,
  getSessionStandings,
  getSessionDetail,
  cancelSession,
} from '../../src/services/padelSocialService';

const router = express.Router();

async function checkFlag(facilityId: string, res: express.Response): Promise<boolean> {
  const enabled = await isFeatureEnabled(facilityId, FEATURE_FLAGS.PADEL);
  if (!enabled) {
    res.status(403).json({ success: false, error: 'Padel is not enabled for this facility' });
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
 * GET /api/padel/pricing/:facilityId
 * Drop-in rate for the "Join" button and session creation form to display.
 * Null = free / members-only.
 */
router.get('/pricing/:facilityId', async (req, res, next) => {
  try {
    const { facilityId } = req.params;
    if (!(await checkFlag(facilityId, res))) return;

    const result = await query(`SELECT padel_dropin_rate_cents as "dropInRateCents" FROM facilities WHERE id = $1`, [
      facilityId,
    ]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Facility not found' });
    }
    res.json({ success: true, dropInRateCents: result.rows[0].dropInRateCents });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/padel/pricing/:facilityId
 * Facility-admin-only: set (or clear) the club-wide padel drop-in rate.
 * Body: { dropInRateCents: number | null }
 */
router.patch('/pricing/:facilityId', async (req, res, next) => {
  try {
    const { facilityId } = req.params;
    const userId = req.user!.userId;
    if (!(await checkFlag(facilityId, res))) return;
    if (!(await userIsFacilityAdmin(userId, facilityId))) {
      return res.status(403).json({ success: false, error: 'Only a facility admin can set padel pricing' });
    }

    const { dropInRateCents } = req.body || {};
    if (dropInRateCents !== null && (typeof dropInRateCents !== 'number' || dropInRateCents <= 0)) {
      return res.status(400).json({ success: false, error: 'dropInRateCents must be a positive number or null' });
    }

    await query(`UPDATE facilities SET padel_dropin_rate_cents = $1 WHERE id = $2`, [dropInRateCents, facilityId]);
    res.json({ success: true, dropInRateCents });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/padel/sessions/:facilityId?scope=open
 * Open/full Social Play sessions members can join.
 */
router.get('/sessions/:facilityId', async (req, res, next) => {
  try {
    const { facilityId } = req.params;
    if (!(await checkFlag(facilityId, res))) return;

    const sessions = await listOpenSessions(facilityId, req.user!.userId);
    res.json({ success: true, sessions });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/padel/sessions
 * Body: { facilityId, format, sessionDate, startTime, durationMinutes, playerCount, roundsCount }
 */
router.post('/sessions', async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const { facilityId, format, sessionDate, startTime, durationMinutes, playerCount, roundsCount } = req.body || {};
    if (!(await checkFlag(facilityId, res))) return;

    if (!facilityId || !['americano', 'mexicano'].includes(format) || !sessionDate || !startTime || !durationMinutes || !playerCount) {
      return res.status(400).json({ success: false, error: 'Missing or invalid session fields' });
    }

    const result = await createSession({
      facilityId,
      createdBy: userId,
      format,
      sessionDate,
      startTime,
      durationMinutes: Number(durationMinutes),
      playerCount: Number(playerCount),
      roundsCount: Number(roundsCount) || 5,
    });
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message || 'Could not create session' });
  }
});

router.post('/sessions/:id/join', async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const result = await joinSession(req.params.id, userId);
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message || 'Could not join session' });
  }
});

router.post('/sessions/:id/leave', async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    await leaveSession(req.params.id, userId);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message || 'Could not leave session' });
  }
});

router.post('/sessions/:id/start', async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const result = await startSession(req.params.id, userId);
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message || 'Could not start session' });
  }
});

router.post('/sessions/:id/cancel', async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    await cancelSession(req.params.id, userId);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message || 'Could not cancel session' });
  }
});

router.get('/sessions/:id/detail', async (req, res, next) => {
  try {
    const detail = await getSessionDetail(req.params.id);
    res.json({ success: true, ...detail });
  } catch (error: any) {
    res.status(404).json({ success: false, error: error.message || 'Session not found' });
  }
});

router.get('/sessions/:id/standings', async (req, res, next) => {
  try {
    const standings = await getSessionStandings(req.params.id);
    res.json({ success: true, standings });
  } catch (error) {
    next(error);
  }
});

router.post('/sessions/:id/rounds/next', async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const detail = await getSessionDetail(req.params.id);
    const isAdmin = await userIsFacilityAdmin(userId, detail.session.facilityId);
    if (detail.session.createdBy !== userId && !isAdmin) {
      return res.status(403).json({ success: false, error: 'Only the host or a facility admin can generate the next round' });
    }
    const result = await generateNextRound(req.params.id);
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message || 'Could not generate next round' });
  }
});

router.post('/matches/:id/score', async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const { team1Score, team2Score } = req.body || {};
    if (typeof team1Score !== 'number' || typeof team2Score !== 'number') {
      return res.status(400).json({ success: false, error: 'team1Score and team2Score (numbers) are required' });
    }
    await recordMatchScore(req.params.id, team1Score, team2Score, userId);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message || 'Could not record score' });
  }
});

export default router;
