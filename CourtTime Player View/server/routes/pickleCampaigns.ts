import express from 'express';
import { requireAuth } from '../middleware/auth';
import {
  createCampaign,
  listCampaigns,
  getCampaign,
  previewCampaignSegment,
  sendCampaign,
  listCampaignSends,
  updateCampaignStatus,
  requireCampaignAdmin,
  type SegmentFilter,
  type CampaignChannel,
  type CampaignStatus,
} from '../../src/services/pickle/pickleCampaignService';

const router = express.Router();

const VALID_CHANNELS: CampaignChannel[] = ['email', 'push', 'sms'];
const VALID_STATUSES: CampaignStatus[] = ['draft', 'scheduled', 'sending', 'sent', 'canceled'];

/**
 * GET /api/pickle/orgs/:orgId/campaigns
 */
router.get('/orgs/:orgId/campaigns', requireAuth, async (req, res, next) => {
  try {
    const { orgId } = req.params;
    await requireCampaignAdmin(req.user!.userId, orgId);
    const campaigns = await listCampaigns(orgId);
    res.json({ success: true, data: { campaigns } });
  } catch (err: any) {
    if (err.message?.includes('Not authorized')) {
      return res.status(403).json({ success: false, error: err.message });
    }
    next(err);
  }
});

/**
 * POST /api/pickle/orgs/:orgId/campaigns
 */
router.post('/orgs/:orgId/campaigns', requireAuth, async (req, res, next) => {
  try {
    const { orgId } = req.params;
    await requireCampaignAdmin(req.user!.userId, orgId);

    const { name, segmentFilter, channel, templateBody } = req.body;
    if (!name || !templateBody) {
      return res.status(400).json({
        success: false,
        error: 'name and templateBody are required',
      });
    }
    if (channel && !VALID_CHANNELS.includes(channel)) {
      return res.status(400).json({ success: false, error: 'Invalid channel' });
    }

    const campaign = await createCampaign({
      orgId,
      name,
      segmentFilter: segmentFilter as SegmentFilter,
      channel,
      templateBody,
    });

    res.status(201).json({ success: true, data: { campaign } });
  } catch (err: any) {
    if (err.message?.includes('Not authorized')) {
      return res.status(403).json({ success: false, error: err.message });
    }
    next(err);
  }
});

/**
 * GET /api/pickle/orgs/:orgId/campaigns/:campaignId
 */
router.get('/orgs/:orgId/campaigns/:campaignId', requireAuth, async (req, res, next) => {
  try {
    const { orgId, campaignId } = req.params;
    await requireCampaignAdmin(req.user!.userId, orgId);

    const campaign = await getCampaign(orgId, campaignId);
    if (!campaign) {
      return res.status(404).json({ success: false, error: 'Campaign not found' });
    }
    res.json({ success: true, data: { campaign } });
  } catch (err: any) {
    if (err.message?.includes('Not authorized')) {
      return res.status(403).json({ success: false, error: err.message });
    }
    next(err);
  }
});

/**
 * GET /api/pickle/orgs/:orgId/campaigns/:campaignId/preview
 */
router.get('/orgs/:orgId/campaigns/:campaignId/preview', requireAuth, async (req, res, next) => {
  try {
    const { orgId, campaignId } = req.params;
    await requireCampaignAdmin(req.user!.userId, orgId);

    const preview = await previewCampaignSegment(orgId, campaignId);
    res.json({ success: true, data: preview });
  } catch (err: any) {
    if (err.message?.includes('Not authorized')) {
      return res.status(403).json({ success: false, error: err.message });
    }
    if (err.message?.includes('not found')) {
      return res.status(404).json({ success: false, error: err.message });
    }
    next(err);
  }
});

/**
 * POST /api/pickle/orgs/:orgId/campaigns/:campaignId/send
 */
router.post('/orgs/:orgId/campaigns/:campaignId/send', requireAuth, async (req, res, next) => {
  try {
    const { orgId, campaignId } = req.params;
    await requireCampaignAdmin(req.user!.userId, orgId);

    const result = await sendCampaign(orgId, campaignId);
    res.json({ success: true, data: result });
  } catch (err: any) {
    if (err.message?.includes('Not authorized')) {
      return res.status(403).json({ success: false, error: err.message });
    }
    if (err.message?.includes('not found') || err.message?.includes('already')) {
      return res.status(400).json({ success: false, error: err.message });
    }
    next(err);
  }
});

/**
 * GET /api/pickle/orgs/:orgId/campaigns/:campaignId/sends
 */
router.get('/orgs/:orgId/campaigns/:campaignId/sends', requireAuth, async (req, res, next) => {
  try {
    const { orgId, campaignId } = req.params;
    await requireCampaignAdmin(req.user!.userId, orgId);

    const sends = await listCampaignSends(orgId, campaignId);
    res.json({ success: true, data: { sends } });
  } catch (err: any) {
    if (err.message?.includes('Not authorized')) {
      return res.status(403).json({ success: false, error: err.message });
    }
    next(err);
  }
});

/**
 * PATCH /api/pickle/orgs/:orgId/campaigns/:campaignId
 */
router.patch('/orgs/:orgId/campaigns/:campaignId', requireAuth, async (req, res, next) => {
  try {
    const { orgId, campaignId } = req.params;
    await requireCampaignAdmin(req.user!.userId, orgId);

    const { status } = req.body;
    if (!status || !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, error: 'Valid status is required' });
    }

    const campaign = await updateCampaignStatus(orgId, campaignId, status);
    if (!campaign) {
      return res.status(404).json({ success: false, error: 'Campaign not found' });
    }
    res.json({ success: true, data: { campaign } });
  } catch (err: any) {
    if (err.message?.includes('Not authorized')) {
      return res.status(403).json({ success: false, error: err.message });
    }
    next(err);
  }
});

export default router;
