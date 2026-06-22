import express from 'express';
import { requireAuth } from '../middleware/auth';
import {
  listProgramTemplates,
  createProgramTemplate,
  updateProgramTemplate,
  archiveProgramTemplate,
  rolloutProgramTemplate,
  listProgramRollouts,
  createProgramInstance,
  listProgramInstancesByFacility,
  registerForProgramInstance,
  cancelProgramRegistration,
  isOrgAdmin,
} from '../../src/services/pickle/pickleProgramService';
import { isFacilityAdmin } from '../../src/services/memberService';

const router = express.Router();

/**
 * GET /api/pickle/programs/orgs/:orgId/templates
 */
router.get('/orgs/:orgId/templates', requireAuth, async (req, res, next) => {
  try {
    const { orgId } = req.params;
    if (!(await isOrgAdmin(req.user!.userId, orgId))) {
      return res.status(403).json({ success: false, error: 'Not authorized for this organization' });
    }
    const templates = await listProgramTemplates(orgId);
    res.json({ success: true, data: { templates } });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/pickle/programs/orgs/:orgId/templates
 */
router.post('/orgs/:orgId/templates', requireAuth, async (req, res, next) => {
  try {
    const { orgId } = req.params;
    if (!(await isOrgAdmin(req.user!.userId, orgId))) {
      return res.status(403).json({ success: false, error: 'Not authorized for this organization' });
    }

    const { nationalProgramId, type, name, defaultConfig } = req.body;
    if (!type || !name) {
      return res.status(400).json({ success: false, error: 'type and name are required' });
    }

    const template = await createProgramTemplate({
      orgId,
      nationalProgramId,
      type,
      name,
      defaultConfig,
    });
    res.status(201).json({ success: true, data: { template } });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Failed to create template' });
  }
});

/**
 * PATCH /api/pickle/programs/templates/:templateId
 */
router.patch('/templates/:templateId', requireAuth, async (req, res, next) => {
  try {
    const { templateId } = req.params;
    const { orgId, nationalProgramId, type, name, defaultConfig } = req.body;
    if (!orgId) {
      return res.status(400).json({ success: false, error: 'orgId is required' });
    }
    if (!(await isOrgAdmin(req.user!.userId, orgId))) {
      return res.status(403).json({ success: false, error: 'Not authorized for this organization' });
    }

    const template = await updateProgramTemplate(templateId, orgId, {
      nationalProgramId,
      type,
      name,
      defaultConfig,
    });
    res.json({ success: true, data: { template } });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Failed to update template' });
  }
});

/**
 * DELETE /api/pickle/programs/templates/:templateId
 */
router.delete('/templates/:templateId', requireAuth, async (req, res, next) => {
  try {
    const { templateId } = req.params;
    const orgId = req.query.orgId as string;
    if (!orgId) {
      return res.status(400).json({ success: false, error: 'orgId query parameter is required' });
    }
    if (!(await isOrgAdmin(req.user!.userId, orgId))) {
      return res.status(403).json({ success: false, error: 'Not authorized for this organization' });
    }

    await archiveProgramTemplate(templateId, orgId);
    res.json({ success: true });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Failed to archive template' });
  }
});

/**
 * GET /api/pickle/programs/orgs/:orgId/rollouts
 */
router.get('/orgs/:orgId/rollouts', requireAuth, async (req, res, next) => {
  try {
    const { orgId } = req.params;
    if (!(await isOrgAdmin(req.user!.userId, orgId))) {
      return res.status(403).json({ success: false, error: 'Not authorized for this organization' });
    }
    const rollouts = await listProgramRollouts(orgId);
    res.json({ success: true, data: { rollouts } });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/pickle/programs/orgs/:orgId/rollouts
 */
router.post('/orgs/:orgId/rollouts', requireAuth, async (req, res, next) => {
  try {
    const { orgId } = req.params;
    if (!(await isOrgAdmin(req.user!.userId, orgId))) {
      return res.status(403).json({ success: false, error: 'Not authorized for this organization' });
    }

    const { templateId, facilityId } = req.body;
    if (!templateId || !facilityId) {
      return res.status(400).json({ success: false, error: 'templateId and facilityId are required' });
    }

    const rollout = await rolloutProgramTemplate({ orgId, templateId, facilityId });
    res.status(201).json({ success: true, data: { rollout } });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Failed to rollout program' });
  }
});

/**
 * POST /api/pickle/programs/instances
 */
router.post('/instances', requireAuth, async (req, res, next) => {
  try {
    const { templateId, facilityId, schedule, capacity, priceCents, status } = req.body;
    if (!templateId || !facilityId) {
      return res.status(400).json({ success: false, error: 'templateId and facilityId are required' });
    }

    const instance = await createProgramInstance({
      userId: req.user!.userId,
      templateId,
      facilityId,
      schedule: schedule || {},
      capacity,
      priceCents,
      status,
    });
    res.status(201).json({ success: true, data: { instance } });
  } catch (err: any) {
    const status = err.message?.includes('Not authorized') ? 403 : 400;
    return res.status(status).json({ success: false, error: err.message || 'Failed to create instance' });
  }
});

/**
 * GET /api/pickle/programs/facilities/:facilityId/instances
 */
router.get('/facilities/:facilityId/instances', requireAuth, async (req, res, next) => {
  try {
    const { facilityId } = req.params;
    const includeDraft = req.query.includeDraft === 'true';
    const userId = req.user!.userId;

    if (includeDraft) {
      const isAdmin =
        (await isFacilityAdmin(facilityId, userId)) ||
        false;
      if (!isAdmin) {
        return res.status(403).json({ success: false, error: 'Facility admin access required for drafts' });
      }
    }

    const instances = await listProgramInstancesByFacility(facilityId, {
      userId,
      includeDraft,
    });
    res.json({ success: true, data: { instances } });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Failed to list instances' });
  }
});

/**
 * POST /api/pickle/programs/instances/:instanceId/register
 */
router.post('/instances/:instanceId/register', requireAuth, async (req, res, next) => {
  try {
    const registration = await registerForProgramInstance(req.user!.userId, req.params.instanceId);
    res.status(201).json({ success: true, data: { registration } });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Failed to register' });
  }
});

/**
 * POST /api/pickle/programs/instances/:instanceId/cancel
 */
router.post('/instances/:instanceId/cancel', requireAuth, async (req, res, next) => {
  try {
    const registration = await cancelProgramRegistration(req.user!.userId, req.params.instanceId);
    res.json({ success: true, data: { registration } });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Failed to cancel registration' });
  }
});

export default router;
