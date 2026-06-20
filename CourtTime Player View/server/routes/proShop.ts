import express from 'express';
import { query } from '../../src/database/connection';
import { isFeatureEnabled } from '../../src/services/featureFlagService';
import { isFacilityAdmin } from '../../src/services/memberService';
import {
  getActiveProducts,
  getAllProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  createCheckoutSession,
  getAdminOrders,
  getUserOrders,
} from '../../src/services/proShopService';

const router = express.Router();

async function requireFacilityAdmin(facilityId: string, userId: string | undefined): Promise<boolean> {
  if (!userId) return false;
  const adminFromTable = await query(
    `SELECT 1 FROM facility_admins WHERE facility_id = $1 AND user_id = $2 AND status = 'active'`,
    [facilityId, userId]
  );
  return adminFromTable.rows.length > 0 || (await isFacilityAdmin(facilityId, userId));
}

async function checkFlag(facilityId: string, res: express.Response): Promise<boolean> {
  const enabled = await isFeatureEnabled(facilityId, 'pro_shop');
  if (!enabled) {
    res.status(403).json({ success: false, error: 'Pro Shop is not enabled for this facility' });
    return false;
  }
  return true;
}

// ── Member routes ──────────────────────────────────────────

router.get('/products/:facilityId', async (req, res) => {
  try {
    if (!await checkFlag(req.params.facilityId, res)) return;
    const products = await getActiveProducts(req.params.facilityId);
    res.json({ success: true, data: products });
  } catch (error: any) {
    console.error('[ProShop] Get products error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/checkout/:facilityId', async (req, res) => {
  try {
    const { facilityId } = req.params;
    if (!await checkFlag(facilityId, res)) return;

    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'items must be a non-empty array' });
    }

    const result = await createCheckoutSession(facilityId, req.user!.userId, items);
    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('[ProShop] Checkout error:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

router.get('/my-orders/:facilityId', async (req, res) => {
  try {
    const { facilityId } = req.params;
    if (!await checkFlag(facilityId, res)) return;
    const orders = await getUserOrders(facilityId, req.user!.userId);
    res.json({ success: true, data: orders });
  } catch (error: any) {
    console.error('[ProShop] My orders error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── Admin routes ───────────────────────────────────────────

router.get('/admin/products/:facilityId', async (req, res) => {
  try {
    const { facilityId } = req.params;
    if (!await checkFlag(facilityId, res)) return;
    if (!await requireFacilityAdmin(facilityId, req.user?.userId)) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    const products = await getAllProducts(facilityId);
    res.json({ success: true, data: products });
  } catch (error: any) {
    console.error('[ProShop] Admin get products error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/admin/products/:facilityId', async (req, res) => {
  try {
    const { facilityId } = req.params;
    if (!await checkFlag(facilityId, res)) return;
    if (!await requireFacilityAdmin(facilityId, req.user?.userId)) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    const { name, description, category, price_cents, stock_quantity, image_data, is_active } = req.body;
    if (!name || !category || price_cents == null) {
      return res.status(400).json({ success: false, error: 'name, category, and price_cents are required' });
    }
    const product = await createProduct(facilityId, { name, description, category, price_cents, stock_quantity, image_data, is_active });
    res.status(201).json({ success: true, data: product });
  } catch (error: any) {
    console.error('[ProShop] Admin create product error:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

router.patch('/admin/products/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    const productResult = await query(`SELECT facility_id FROM pro_shop_products WHERE id = $1`, [productId]);
    if (productResult.rows.length === 0) return res.status(404).json({ success: false, error: 'Product not found' });
    const facilityId = productResult.rows[0].facility_id;

    if (!await checkFlag(facilityId, res)) return;
    if (!await requireFacilityAdmin(facilityId, req.user?.userId)) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    const updated = await updateProduct(productId, req.body);
    res.json({ success: true, data: updated });
  } catch (error: any) {
    console.error('[ProShop] Admin update product error:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

router.delete('/admin/products/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    const productResult = await query(`SELECT facility_id FROM pro_shop_products WHERE id = $1`, [productId]);
    if (productResult.rows.length === 0) return res.status(404).json({ success: false, error: 'Product not found' });
    const facilityId = productResult.rows[0].facility_id;

    if (!await checkFlag(facilityId, res)) return;
    if (!await requireFacilityAdmin(facilityId, req.user?.userId)) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    const result = await deleteProduct(productId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('[ProShop] Admin delete product error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/admin/orders/:facilityId', async (req, res) => {
  try {
    const { facilityId } = req.params;
    if (!await checkFlag(facilityId, res)) return;
    if (!await requireFacilityAdmin(facilityId, req.user?.userId)) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    const orders = await getAdminOrders(facilityId);
    res.json({ success: true, data: orders });
  } catch (error: any) {
    console.error('[ProShop] Admin get orders error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
