import express from 'express';
import { requireAuth, generateToken } from '../middleware/auth';
import { getUserWithMemberships } from '../../src/services/authService';
import {
  registerOrganization,
  createLocationInvite,
  validateLocationInvite,
  provisionLocationFromInvite,
  provisionCorporateLocation,
  getCorporateLocationDetail,
  resendLocationWelcome,
  isOrgAdmin,
  getOrgDashboard,
  listOrgInvites,
  listOrgLocations,
} from '../../src/services/pickle/pickleOrgService';

const router = express.Router();

/**
 * POST /api/pickle/orgs/register
 * Create corporate org + owner admin (public)
 */
router.post('/orgs/register', async (req, res, next) => {
  try {
    const { orgName, adminEmail, adminPassword, adminFullName, adminPhone } = req.body;

    if (!orgName || !adminEmail || !adminPassword || !adminFullName) {
      return res.status(400).json({
        success: false,
        error: 'Organization name, admin email, password, and full name are required',
      });
    }

    if (adminPassword.length < 8) {
      return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
    }

    const { org, user } = await registerOrganization({
      orgName,
      adminEmail,
      adminPassword,
      adminFullName,
      adminPhone,
    });

    const userWithMemberships = await getUserWithMemberships(user.id as string);
    const token = generateToken({
      userId: user.id as string,
      email: user.email as string,
      userType: 'admin',
    });

    res.status(201).json({
      success: true,
      data: { org, user: userWithMemberships },
      token,
    });
  } catch (err: any) {
    if (err.message?.includes('already exists')) {
      return res.status(400).json({ success: false, error: err.message });
    }
    next(err);
  }
});

/**
 * GET /api/pickle/invites/:token
 * Validate franchise location invite (public)
 */
router.get('/invites/:token', async (req, res, next) => {
  try {
    const validation = await validateLocationInvite(req.params.token);
    if (!validation.valid) {
      return res.status(400).json({ success: false, error: validation.error });
    }
    res.json({ success: true, data: validation });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/pickle/locations/provision
 * Franchisee completes location setup from invite (public; may use existingUserId if logged in)
 */
router.post('/locations/provision', async (req, res, next) => {
  try {
    const {
      inviteToken,
      facilityName,
      streetAddress,
      city,
      state,
      zipCode,
      phone,
      email,
      courtCount,
      adminEmail,
      adminPassword,
      adminFullName,
      existingUserId,
    } = req.body;

    if (!inviteToken || !facilityName || !streetAddress || !city || !state || !zipCode || !adminEmail) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const result = await provisionLocationFromInvite({
      inviteToken,
      facilityName,
      streetAddress,
      city,
      state,
      zipCode,
      phone,
      email,
      courtCount: courtCount || 4,
      adminEmail,
      adminPassword,
      adminFullName,
      existingUserId,
    });

    const userWithMemberships = await getUserWithMemberships(result.user.id as string);
    const token = generateToken({
      userId: result.user.id as string,
      email: result.user.email as string,
      userType: 'admin',
    });

    res.status(201).json({
      success: true,
      data: { facility: result.facility, user: userWithMemberships },
      token,
    });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Failed to provision location' });
  }
});

/**
 * GET /api/pickle/orgs/:orgId/dashboard
 */
router.get('/orgs/:orgId/dashboard', requireAuth, async (req, res, next) => {
  try {
    const { orgId } = req.params;
    const admin = await isOrgAdmin(req.user!.userId, orgId);
    if (!admin) {
      return res.status(403).json({ success: false, error: 'Not authorized for this organization' });
    }

    const dashboard = await getOrgDashboard(orgId);
    res.json({ success: true, data: dashboard });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/pickle/orgs/:orgId/locations
 */
router.get('/orgs/:orgId/locations', requireAuth, async (req, res, next) => {
  try {
    const { orgId } = req.params;
    const admin = await isOrgAdmin(req.user!.userId, orgId);
    if (!admin) {
      return res.status(403).json({ success: false, error: 'Not authorized for this organization' });
    }

    const locations = await listOrgLocations(orgId);
    res.json({ success: true, data: { locations } });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/pickle/orgs/:orgId/locations
 * Corporate provisions a franchise location with operator credentials
 */
router.post('/orgs/:orgId/locations', requireAuth, async (req, res, next) => {
  try {
    const { orgId } = req.params;
    const admin = await isOrgAdmin(req.user!.userId, orgId);
    if (!admin) {
      return res.status(403).json({ success: false, error: 'Not authorized for this organization' });
    }

    const {
      setupMode,
      facilityName,
      streetAddress,
      city,
      state,
      zipCode,
      phone,
      courtCount,
      operatorEmail,
      operatorFullName,
      operatorPassword,
    } = req.body;

    if (!setupMode || !facilityName || !operatorEmail || !operatorFullName || !operatorPassword) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    if (setupMode !== 'complete' && setupMode !== 'quick') {
      return res.status(400).json({ success: false, error: 'setupMode must be complete or quick' });
    }

    const result = await provisionCorporateLocation(orgId, req.user!.userId, {
      setupMode,
      facilityName,
      streetAddress,
      city,
      state,
      zipCode,
      phone,
      courtCount,
      operatorEmail,
      operatorFullName,
      operatorPassword,
    });

    res.status(201).json({ success: true, data: result });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Failed to provision location' });
  }
});

/**
 * GET /api/pickle/orgs/:orgId/locations/:facilityId
 */
router.get('/orgs/:orgId/locations/:facilityId', requireAuth, async (req, res, next) => {
  try {
    const { orgId, facilityId } = req.params;
    const admin = await isOrgAdmin(req.user!.userId, orgId);
    if (!admin) {
      return res.status(403).json({ success: false, error: 'Not authorized for this organization' });
    }

    const detail = await getCorporateLocationDetail(orgId, facilityId);
    if (!detail) {
      return res.status(404).json({ success: false, error: 'Location not found' });
    }

    res.json({ success: true, data: detail });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/pickle/orgs/:orgId/locations/:facilityId/resend-welcome
 */
router.post('/orgs/:orgId/locations/:facilityId/resend-welcome', requireAuth, async (req, res, next) => {
  try {
    const { orgId, facilityId } = req.params;
    const admin = await isOrgAdmin(req.user!.userId, orgId);
    if (!admin) {
      return res.status(403).json({ success: false, error: 'Not authorized for this organization' });
    }

    await resendLocationWelcome(orgId, facilityId);
    res.json({ success: true, data: { sent: true } });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Failed to resend welcome email' });
  }
});

/**
 * GET /api/pickle/orgs/:orgId/invites
 */
router.get('/orgs/:orgId/invites', requireAuth, async (req, res, next) => {
  try {
    const { orgId } = req.params;
    const admin = await isOrgAdmin(req.user!.userId, orgId);
    if (!admin) {
      return res.status(403).json({ success: false, error: 'Not authorized for this organization' });
    }

    const invites = await listOrgInvites(orgId);
    res.json({ success: true, data: { invites } });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/pickle/orgs/:orgId/invites
 * Corporate invites a new franchise location
 */
router.post('/orgs/:orgId/invites', requireAuth, async (req, res, next) => {
  try {
    const { orgId } = req.params;
    const { inviteEmail, locationName } = req.body;

    const admin = await isOrgAdmin(req.user!.userId, orgId);
    if (!admin) {
      return res.status(403).json({ success: false, error: 'Not authorized for this organization' });
    }

    if (!inviteEmail) {
      return res.status(400).json({ success: false, error: 'inviteEmail is required' });
    }

    const invite = await createLocationInvite({
      orgId,
      inviteEmail,
      locationName,
      invitedByUserId: req.user!.userId,
    });

    res.status(201).json({ success: true, data: invite });
  } catch (error) {
    next(error);
  }
});

export default router;
