import express from 'express';
import { requireAuth } from '../middleware/auth';
import {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  seedDefaultProducts,
  listProductRollouts,
  setProductRollouts,
  createSubscription,
  getMemberSubscription,
  evaluateEntitlements,
  requireOrgCatalogAdmin,
  listFacilityMembersWithTiers,
  listFacilityMembershipProducts,
  adminAssignMembership,
  adminCancelMembership,
  adminAddFacilityMember,
  type MembershipTier,
  type ProductEntitlements,
} from '../../src/services/pickle/pickleMembershipService';
import {
  canBookCourt,
  canJoinProgram,
  consumeHomePerk,
  getDropInPrice,
} from '../../src/services/pickle/entitlementService';
import type { HomePerkType } from '../../src/services/pickle/pickleMembershipService';

const router = express.Router();

const VALID_TIERS: MembershipTier[] = ['trial', 'unlimited', 'play', 'pro'];
const VALID_PERKS: HomePerkType[] = ['clinic', 'guest_pass', 'ball_machine', 'paddle_fitting'];

/**
 * GET /api/pickle/orgs/:orgId/products
 * List membership catalog for org (org admin)
 */
router.get('/orgs/:orgId/products', requireAuth, async (req, res, next) => {
  try {
    const { orgId } = req.params;
    await requireOrgCatalogAdmin(req.user!.userId, orgId);
    const includeInactive = req.query.includeInactive === 'true';
    const products = await listProducts(orgId, includeInactive);
    res.json({ success: true, data: { products } });
  } catch (err: any) {
    if (err.message?.includes('Not authorized')) {
      return res.status(403).json({ success: false, error: err.message });
    }
    next(err);
  }
});

/**
 * POST /api/pickle/orgs/:orgId/products
 * Create membership product (org admin)
 */
router.post('/orgs/:orgId/products', requireAuth, async (req, res, next) => {
  try {
    const { orgId } = req.params;
    await requireOrgCatalogAdmin(req.user!.userId, orgId);

    const { nationalSku, tier, name, priceCents, durationDays, entitlements } = req.body;
    if (!nationalSku || !tier || !name || priceCents == null) {
      return res.status(400).json({
        success: false,
        error: 'nationalSku, tier, name, and priceCents are required',
      });
    }
    if (!VALID_TIERS.includes(tier)) {
      return res.status(400).json({ success: false, error: 'Invalid tier' });
    }

    const product = await createProduct({
      orgId,
      nationalSku,
      tier,
      name,
      priceCents: Number(priceCents),
      durationDays: durationDays != null ? Number(durationDays) : null,
      entitlements: entitlements as Partial<ProductEntitlements>,
    });

    res.status(201).json({ success: true, data: { product } });
  } catch (err: any) {
    if (err.message?.includes('Not authorized')) {
      return res.status(403).json({ success: false, error: err.message });
    }
    if (err.code === '23505') {
      return res.status(400).json({ success: false, error: 'National SKU already exists for this org' });
    }
    next(err);
  }
});

/**
 * POST /api/pickle/orgs/:orgId/products/seed
 * Seed default Trial/Unlimited/Play/Pro catalog
 */
router.post('/orgs/:orgId/products/seed', requireAuth, async (req, res, next) => {
  try {
    const { orgId } = req.params;
    await requireOrgCatalogAdmin(req.user!.userId, orgId);
    const count = await seedDefaultProducts(orgId);
    const products = await listProducts(orgId, true);
    res.json({ success: true, data: { count, products } });
  } catch (err: any) {
    if (err.message?.includes('Not authorized')) {
      return res.status(403).json({ success: false, error: err.message });
    }
    next(err);
  }
});

/**
 * PATCH /api/pickle/orgs/:orgId/products/:productId
 */
router.patch('/orgs/:orgId/products/:productId', requireAuth, async (req, res, next) => {
  try {
    const { orgId, productId } = req.params;
    await requireOrgCatalogAdmin(req.user!.userId, orgId);

    const { name, priceCents, durationDays, entitlements, isActive } = req.body;
    const product = await updateProduct(orgId, productId, {
      name,
      priceCents: priceCents != null ? Number(priceCents) : undefined,
      durationDays: durationDays !== undefined ? (durationDays != null ? Number(durationDays) : null) : undefined,
      entitlements,
      isActive,
    });

    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }
    res.json({ success: true, data: { product } });
  } catch (err: any) {
    if (err.message?.includes('Not authorized')) {
      return res.status(403).json({ success: false, error: err.message });
    }
    next(err);
  }
});

/**
 * GET /api/pickle/orgs/:orgId/products/:productId
 */
router.get('/orgs/:orgId/products/:productId', requireAuth, async (req, res, next) => {
  try {
    const { orgId, productId } = req.params;
    await requireOrgCatalogAdmin(req.user!.userId, orgId);
    const product = await getProduct(orgId, productId);
    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }
    res.json({ success: true, data: { product } });
  } catch (err: any) {
    if (err.message?.includes('Not authorized')) {
      return res.status(403).json({ success: false, error: err.message });
    }
    next(err);
  }
});

/**
 * GET /api/pickle/orgs/:orgId/products/:productId/rollouts
 */
router.get('/orgs/:orgId/products/:productId/rollouts', requireAuth, async (req, res, next) => {
  try {
    const { orgId, productId } = req.params;
    await requireOrgCatalogAdmin(req.user!.userId, orgId);
    const rollouts = await listProductRollouts(orgId, productId);
    res.json({ success: true, data: { rollouts } });
  } catch (err: any) {
    if (err.message?.includes('Not authorized')) {
      return res.status(403).json({ success: false, error: err.message });
    }
    next(err);
  }
});

/**
 * PUT /api/pickle/orgs/:orgId/products/:productId/rollouts
 */
router.put('/orgs/:orgId/products/:productId/rollouts', requireAuth, async (req, res, next) => {
  try {
    const { orgId, productId } = req.params;
    await requireOrgCatalogAdmin(req.user!.userId, orgId);

    const { rollouts } = req.body;
    if (!Array.isArray(rollouts)) {
      return res.status(400).json({ success: false, error: 'rollouts array is required' });
    }

    const updated = await setProductRollouts(
      orgId,
      productId,
      rollouts.map((r: { facilityId: string; enabled: boolean }) => ({
        facilityId: r.facilityId,
        enabled: Boolean(r.enabled),
      }))
    );

    res.json({ success: true, data: { rollouts: updated } });
  } catch (err: any) {
    if (err.message?.includes('Not authorized')) {
      return res.status(403).json({ success: false, error: err.message });
    }
    next(err);
  }
});

/**
 * GET /api/pickle/memberships/subscription?orgId=
 */
router.get('/memberships/subscription', requireAuth, async (req, res, next) => {
  try {
    const orgId = req.query.orgId as string;
    if (!orgId) {
      return res.status(400).json({ success: false, error: 'orgId query parameter is required' });
    }
    const subscription = await getMemberSubscription(req.user!.userId, orgId);
    res.json({ success: true, data: { subscription } });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/pickle/memberships/subscribe
 */
router.post('/memberships/subscribe', requireAuth, async (req, res, next) => {
  try {
    const { orgId, productId, homeFacilityId, stripeSubscriptionId } = req.body;
    if (!orgId || !productId || !homeFacilityId) {
      return res.status(400).json({
        success: false,
        error: 'orgId, productId, and homeFacilityId are required',
      });
    }

    const subscription = await createSubscription({
      userId: req.user!.userId,
      orgId,
      productId,
      homeFacilityId,
      stripeSubscriptionId,
    });

    res.status(201).json({ success: true, data: { subscription } });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Failed to create subscription' });
  }
});

/**
 * GET /api/pickle/memberships/entitlements?orgId=&facilityId=
 */
router.get('/memberships/entitlements', requireAuth, async (req, res, next) => {
  try {
    const orgId = req.query.orgId as string;
    const facilityId = req.query.facilityId as string;
    if (!orgId || !facilityId) {
      return res.status(400).json({
        success: false,
        error: 'orgId and facilityId query parameters are required',
      });
    }
    const entitlements = await evaluateEntitlements(req.user!.userId, orgId, facilityId);
    res.json({ success: true, data: entitlements });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/pickle/memberships/check/court
 */
router.post('/memberships/check/court', requireAuth, async (req, res, next) => {
  try {
    const { facilityId, bookingType } = req.body;
    if (!facilityId) {
      return res.status(400).json({ success: false, error: 'facilityId is required' });
    }
    const result = await canBookCourt(req.user!.userId, facilityId, bookingType);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/pickle/memberships/check/program
 */
router.post('/memberships/check/program', requireAuth, async (req, res, next) => {
  try {
    const { facilityId, programType } = req.body;
    if (!facilityId || !programType) {
      return res.status(400).json({ success: false, error: 'facilityId and programType are required' });
    }
    const result = await canJoinProgram(req.user!.userId, facilityId, programType);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/pickle/memberships/drop-in-price?facilityId=
 */
router.get('/memberships/drop-in-price', requireAuth, async (req, res, next) => {
  try {
    const facilityId = req.query.facilityId as string;
    if (!facilityId) {
      return res.status(400).json({ success: false, error: 'facilityId query parameter is required' });
    }
    const result = await getDropInPrice(req.user!.userId, facilityId);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/pickle/memberships/consume-perk
 */
router.post('/memberships/consume-perk', requireAuth, async (req, res, next) => {
  try {
    const { orgId, facilityId, perkType } = req.body;
    if (!orgId || !facilityId || !perkType) {
      return res.status(400).json({
        success: false,
        error: 'orgId, facilityId, and perkType are required',
      });
    }
    if (!VALID_PERKS.includes(perkType)) {
      return res.status(400).json({ success: false, error: 'Invalid perkType' });
    }
    const result = await consumeHomePerk(req.user!.userId, orgId, facilityId, perkType);
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/pickle/facilities/:facilityId/members-with-tiers
 */
router.get('/facilities/:facilityId/members-with-tiers', requireAuth, async (req, res, next) => {
  try {
    const { facilityId } = req.params;
    const [members, products] = await Promise.all([
      listFacilityMembersWithTiers(facilityId, req.user!.userId),
      listFacilityMembershipProducts(facilityId, req.user!.userId),
    ]);
    res.json({ success: true, data: { members, products } });
  } catch (err: any) {
    if (err.message?.includes('Not authorized')) {
      return res.status(403).json({ success: false, error: err.message });
    }
    return res.status(400).json({ success: false, error: err.message || 'Failed to list members' });
  }
});

/**
 * POST /api/pickle/facilities/:facilityId/members
 * Add a member by email (optional membership on create)
 */
router.post('/facilities/:facilityId/members', requireAuth, async (req, res, next) => {
  try {
    const { facilityId } = req.params;
    const { email, fullName, productId } = req.body;
    if (!email || !fullName) {
      return res.status(400).json({ success: false, error: 'email and fullName are required' });
    }

    const result = await adminAddFacilityMember({
      adminUserId: req.user!.userId,
      facilityId,
      email,
      fullName,
      productId,
    });

    res.status(201).json({ success: true, data: result });
  } catch (err: any) {
    if (err.message?.includes('Not authorized')) {
      return res.status(403).json({ success: false, error: err.message });
    }
    return res.status(400).json({ success: false, error: err.message || 'Failed to add member' });
  }
});

/**
 * POST /api/pickle/facilities/:facilityId/assign-membership
 */
router.post('/facilities/:facilityId/assign-membership', requireAuth, async (req, res, next) => {
  try {
    const { facilityId } = req.params;
    const { userId, productId } = req.body;
    if (!userId || !productId) {
      return res.status(400).json({ success: false, error: 'userId and productId are required' });
    }

    const subscription = await adminAssignMembership({
      adminUserId: req.user!.userId,
      facilityId,
      userId,
      productId,
    });

    res.status(201).json({ success: true, data: { subscription } });
  } catch (err: any) {
    if (err.message?.includes('Not authorized')) {
      return res.status(403).json({ success: false, error: err.message });
    }
    return res.status(400).json({ success: false, error: err.message || 'Failed to assign membership' });
  }
});

/**
 * POST /api/pickle/facilities/:facilityId/cancel-membership
 */
router.post('/facilities/:facilityId/cancel-membership', requireAuth, async (req, res, next) => {
  try {
    const { facilityId } = req.params;
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId is required' });
    }

    const result = await adminCancelMembership({
      adminUserId: req.user!.userId,
      facilityId,
      userId,
    });

    res.json({ success: true, data: result });
  } catch (err: any) {
    if (err.message?.includes('Not authorized')) {
      return res.status(403).json({ success: false, error: err.message });
    }
    return res.status(400).json({ success: false, error: err.message || 'Failed to cancel membership' });
  }
});

export default router;
