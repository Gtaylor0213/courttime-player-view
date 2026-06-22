import express from 'express';
import { requireAuth } from '../middleware/auth';
import { isOrgAdmin } from '../../src/services/pickle/pickleOrgService';
import {
  listOrgSkus,
  getOrgSku,
  createOrgSku,
  updateOrgSku,
  archiveOrgSku,
  listOrgInventory,
  upsertLocationInventory,
  rolloutSku,
  listOrgRollouts,
  posCheckout,
  listRetailOrders,
  type SkuCategory,
} from '../../src/services/pickle/pickleRetailService';

const router = express.Router({ mergeParams: true });

const SKU_CATEGORIES: SkuCategory[] = ['paddle', 'shoe', 'ball', 'apparel', 'grab_and_go'];

async function requireOrgAdmin(req: express.Request, res: express.Response, orgId: string) {
  const admin = await isOrgAdmin(req.user!.userId, orgId);
  if (!admin) {
    res.status(403).json({ success: false, error: 'Not authorized for this organization' });
    return false;
  }
  return true;
}

/**
 * GET /api/pickle/orgs/:orgId/retail/skus
 */
router.get('/skus', requireAuth, async (req, res, next) => {
  try {
    const { orgId } = req.params;
    if (!(await requireOrgAdmin(req, res, orgId))) return;

    const category = req.query.category as SkuCategory | undefined;
    if (category && !SKU_CATEGORIES.includes(category)) {
      return res.status(400).json({ success: false, error: 'Invalid category' });
    }

    const skus = await listOrgSkus(orgId, category);
    res.json({ success: true, data: { skus } });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/pickle/orgs/:orgId/retail/skus
 */
router.post('/skus', requireAuth, async (req, res, next) => {
  try {
    const { orgId } = req.params;
    if (!(await requireOrgAdmin(req, res, orgId))) return;

    const { nationalSku, name, category, brand, basePriceCents } = req.body;
    if (!nationalSku || !name || !category || basePriceCents == null) {
      return res.status(400).json({
        success: false,
        error: 'nationalSku, name, category, and basePriceCents are required',
      });
    }
    if (!SKU_CATEGORIES.includes(category)) {
      return res.status(400).json({ success: false, error: 'Invalid category' });
    }

    const sku = await createOrgSku({
      orgId,
      nationalSku,
      name,
      category,
      brand,
      basePriceCents: Number(basePriceCents),
    });
    res.status(201).json({ success: true, data: sku });
  } catch (err: any) {
    if (err.code === '23505') {
      return res.status(400).json({ success: false, error: 'National SKU already exists for this org' });
    }
    next(err);
  }
});

/**
 * GET /api/pickle/orgs/:orgId/retail/skus/:skuId
 */
router.get('/skus/:skuId', requireAuth, async (req, res, next) => {
  try {
    const { orgId, skuId } = req.params;
    if (!(await requireOrgAdmin(req, res, orgId))) return;

    const sku = await getOrgSku(orgId, skuId);
    if (!sku) {
      return res.status(404).json({ success: false, error: 'SKU not found' });
    }
    res.json({ success: true, data: sku });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/pickle/orgs/:orgId/retail/skus/:skuId
 */
router.patch('/skus/:skuId', requireAuth, async (req, res, next) => {
  try {
    const { orgId, skuId } = req.params;
    if (!(await requireOrgAdmin(req, res, orgId))) return;

    const { name, category, brand, basePriceCents, status } = req.body;
    if (category && !SKU_CATEGORIES.includes(category)) {
      return res.status(400).json({ success: false, error: 'Invalid category' });
    }

    const sku = await updateOrgSku({
      orgId,
      skuId,
      name,
      category,
      brand,
      basePriceCents: basePriceCents != null ? Number(basePriceCents) : undefined,
      status,
    });
    res.json({ success: true, data: sku });
  } catch (err: any) {
    if (err.message?.includes('not found')) {
      return res.status(404).json({ success: false, error: err.message });
    }
    next(err);
  }
});

/**
 * DELETE /api/pickle/orgs/:orgId/retail/skus/:skuId
 */
router.delete('/skus/:skuId', requireAuth, async (req, res, next) => {
  try {
    const { orgId, skuId } = req.params;
    if (!(await requireOrgAdmin(req, res, orgId))) return;

    await archiveOrgSku(orgId, skuId);
    res.json({ success: true });
  } catch (err: any) {
    if (err.message?.includes('not found')) {
      return res.status(404).json({ success: false, error: err.message });
    }
    next(err);
  }
});

/**
 * GET /api/pickle/orgs/:orgId/retail/inventory
 */
router.get('/inventory', requireAuth, async (req, res, next) => {
  try {
    const { orgId } = req.params;
    if (!(await requireOrgAdmin(req, res, orgId))) return;

    const facilityId = req.query.facilityId as string | undefined;
    const inventory = await listOrgInventory(orgId, facilityId);
    res.json({ success: true, data: { inventory } });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/pickle/orgs/:orgId/retail/inventory/:facilityId/:skuId
 */
router.put('/inventory/:facilityId/:skuId', requireAuth, async (req, res, next) => {
  try {
    const { orgId, facilityId, skuId } = req.params;
    if (!(await requireOrgAdmin(req, res, orgId))) return;

    const { qty, priceOverrideCents } = req.body;
    const row = await upsertLocationInventory({
      orgId,
      facilityId,
      skuId,
      qty: qty === undefined ? undefined : qty,
      priceOverrideCents: priceOverrideCents === undefined ? undefined : priceOverrideCents,
    });
    res.json({ success: true, data: row });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Failed to update inventory' });
  }
});

/**
 * GET /api/pickle/orgs/:orgId/retail/rollouts
 */
router.get('/rollouts', requireAuth, async (req, res, next) => {
  try {
    const { orgId } = req.params;
    if (!(await requireOrgAdmin(req, res, orgId))) return;

    const rollouts = await listOrgRollouts(orgId);
    res.json({ success: true, data: { rollouts } });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/pickle/orgs/:orgId/retail/rollouts
 */
router.post('/rollouts', requireAuth, async (req, res, next) => {
  try {
    const { orgId } = req.params;
    if (!(await requireOrgAdmin(req, res, orgId))) return;

    const { skuId, facilityId, status, effectiveAt } = req.body;
    if (!skuId) {
      return res.status(400).json({ success: false, error: 'skuId is required' });
    }

    const rollout = await rolloutSku({
      orgId,
      skuId,
      facilityId: facilityId || null,
      status,
      effectiveAt,
      createdByUserId: req.user!.userId,
    });
    res.status(201).json({ success: true, data: rollout });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Failed to create rollout' });
  }
});

/**
 * POST /api/pickle/orgs/:orgId/retail/checkout
 * POS checkout stub
 */
router.post('/checkout', requireAuth, async (req, res, next) => {
  try {
    const { orgId } = req.params;
    const { facilityId, lines, customerUserId } = req.body;

    if (!facilityId || !Array.isArray(lines) || lines.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'facilityId and lines[] are required',
      });
    }

    const result = await posCheckout({
      orgId,
      facilityId,
      lines,
      customerUserId,
      createdByUserId: req.user!.userId,
    });
    res.status(201).json({ success: true, data: result });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Checkout failed' });
  }
});

/**
 * GET /api/pickle/orgs/:orgId/retail/orders
 */
router.get('/orders', requireAuth, async (req, res, next) => {
  try {
    const { orgId } = req.params;
    if (!(await requireOrgAdmin(req, res, orgId))) return;

    const orders = await listRetailOrders(orgId);
    res.json({ success: true, data: { orders } });
  } catch (error) {
    next(error);
  }
});

export default router;
