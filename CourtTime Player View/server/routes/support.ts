import express from 'express';
import {
  getDashboardStats,
  searchUsers,
  getUserFullProfile,
  setUserPassword,
  getFacilityDetail,
  getFacilityViolations,
  getFacilityBookings,
  updateBookingStatus,
  getFacilityMembers,
  updateMember,
  toggleMemberAdmin,
  getFacilityCourts,
  updateCourt,
  updateFacility,
} from '../../src/services/supportService';
import { requestPasswordReset } from '../../src/services/passwordResetService';
import { query } from '../../src/database/connection';

const router = express.Router();

// Support authentication middleware
const supportAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const password = req.headers['x-developer-password'] as string;
  const envPassword = process.env.SUPPORT_PASSWORD || process.env.DEVELOPER_PASSWORD;

  if (!envPassword) {
    console.warn('SUPPORT_PASSWORD not set in environment');
    return res.status(503).json({
      success: false,
      error: 'Support console is not configured'
    });
  }

  if (password !== envPassword) {
    return res.status(401).json({
      success: false,
      error: 'Invalid password'
    });
  }

  next();
};

router.use(supportAuth);

// ── Verify Password ────────────────────────────────────────

router.post('/verify', (_req, res) => {
  res.json({ success: true, message: 'Password verified' });
});

// ── Dashboard ──────────────────────────────────────────────

router.get('/dashboard', async (_req, res) => {
  try {
    const stats = await getDashboardStats();
    res.json({ success: true, data: stats });
  } catch (error: any) {
    console.error('[Support] Dashboard error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── Users ──────────────────────────────────────────────────

router.get('/users/search', async (req, res) => {
  try {
    const q = (req.query.q as string) || '';
    if (q.length < 2) {
      return res.json({ success: true, data: [] });
    }
    const users = await searchUsers(q);
    res.json({ success: true, data: users });
  } catch (error: any) {
    console.error('[Support] User search error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/users/:userId', async (req, res) => {
  try {
    const profile = await getUserFullProfile(req.params.userId);
    if (!profile) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    res.json({ success: true, data: profile });
  } catch (error: any) {
    console.error('[Support] User profile error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/users/:userId/reset-password-email', async (req, res) => {
  try {
    // Look up user email
    const userResult = await query(
      'SELECT email FROM users WHERE id = $1',
      [req.params.userId]
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const result = await requestPasswordReset(userResult.rows[0].email);
    res.json({ success: true, message: 'Password reset email sent' });
  } catch (error: any) {
    console.error('[Support] Password reset email error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/users/:userId/set-temporary-password', async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 8 characters'
      });
    }

    const updated = await setUserPassword(req.params.userId, password);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    res.json({ success: true, message: 'Temporary password set successfully' });
  } catch (error: any) {
    console.error('[Support] Set password error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── Facilities ─────────────────────────────────────────────

router.get('/facilities', async (_req, res) => {
  try {
    const result = await query('SELECT * FROM facilities ORDER BY name');
    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    console.error('[Support] Facilities list error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/facilities/:id', async (req, res) => {
  try {
    const facility = await getFacilityDetail(req.params.id);
    if (!facility) {
      return res.status(404).json({ success: false, error: 'Facility not found' });
    }
    res.json({ success: true, data: facility });
  } catch (error: any) {
    console.error('[Support] Facility detail error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.patch('/facilities/:id', async (req, res) => {
  try {
    const updated = await updateFacility(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Facility not found' });
    }
    res.json({ success: true, data: updated });
  } catch (error: any) {
    console.error('[Support] Facility update error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── Courts ─────────────────────────────────────────────────

router.get('/facilities/:id/courts', async (req, res) => {
  try {
    const courts = await getFacilityCourts(req.params.id);
    res.json({ success: true, data: courts });
  } catch (error: any) {
    console.error('[Support] Courts list error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.patch('/courts/:courtId', async (req, res) => {
  try {
    const updated = await updateCourt(req.params.courtId, req.body);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Court not found' });
    }
    res.json({ success: true, data: updated });
  } catch (error: any) {
    console.error('[Support] Court update error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── Members ────────────────────────────────────────────────

router.get('/facilities/:id/members', async (req, res) => {
  try {
    const { search, status } = req.query;
    const members = await getFacilityMembers(
      req.params.id,
      search as string | undefined,
      status as string | undefined
    );
    res.json({ success: true, data: members });
  } catch (error: any) {
    console.error('[Support] Members list error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.patch('/members/:facilityId/:userId', async (req, res) => {
  try {
    const updated = await updateMember(req.params.facilityId, req.params.userId, req.body);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Member not found' });
    }
    res.json({ success: true, data: updated });
  } catch (error: any) {
    console.error('[Support] Member update error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/members/:facilityId/:userId/admin', async (req, res) => {
  try {
    const { isAdmin } = req.body;
    const updated = await toggleMemberAdmin(req.params.facilityId, req.params.userId, isAdmin);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Member not found' });
    }
    res.json({ success: true, data: updated });
  } catch (error: any) {
    console.error('[Support] Admin toggle error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── Bookings ───────────────────────────────────────────────

router.get('/facilities/:id/bookings', async (req, res) => {
  try {
    const { status, startDate, endDate } = req.query;
    const bookings = await getFacilityBookings(
      req.params.id,
      status as string | undefined,
      startDate as string | undefined,
      endDate as string | undefined
    );
    res.json({ success: true, data: bookings });
  } catch (error: any) {
    console.error('[Support] Bookings list error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.patch('/bookings/:bookingId/status', async (req, res) => {
  try {
    const { status } = req.body;
    const updated = await updateBookingStatus(req.params.bookingId, status);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }
    res.json({ success: true, data: updated });
  } catch (error: any) {
    console.error('[Support] Booking status error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── Violations ─────────────────────────────────────────────

router.get('/facilities/:id/violations', async (req, res) => {
  try {
    const violations = await getFacilityViolations(req.params.id);
    res.json({ success: true, data: violations });
  } catch (error: any) {
    console.error('[Support] Violations error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
