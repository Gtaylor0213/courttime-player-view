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
  createGuestCheckoutSession,
  getAdminOrders,
  getUserOrders,
  getProShopSettings,
  updateProShopSettings,
  getMembersWithCardStatus,
  getMemberCardStatus,
  chargeImmediately,
  addToTab,
  recordMemberCashSale,
  getTabDetail,
  getAllTabs,
  billMemberTab,
  billAllTabs,
  recordGuestSale,
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

// ── Settings ───────────────────────────────────────────────

router.get('/admin/settings/:facilityId', async (req, res) => {
  try {
    const { facilityId } = req.params;
    if (!await checkFlag(facilityId, res)) return;
    if (!await requireFacilityAdmin(facilityId, req.user?.userId)) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    const settings = await getProShopSettings(facilityId);
    res.json({ success: true, data: settings });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.patch('/admin/settings/:facilityId', async (req, res) => {
  try {
    const { facilityId } = req.params;
    if (!await checkFlag(facilityId, res)) return;
    if (!await requireFacilityAdmin(facilityId, req.user?.userId)) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    const { tab_billing_day, require_card } = req.body;
    const settings = await updateProShopSettings(facilityId, { tab_billing_day, require_card });
    res.json({ success: true, data: settings });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ── Members list (for assign UI) ───────────────────────────

router.get('/admin/members/:facilityId', async (req, res) => {
  try {
    const { facilityId } = req.params;
    if (!await checkFlag(facilityId, res)) return;
    if (!await requireFacilityAdmin(facilityId, req.user?.userId)) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    const members = await getMembersWithCardStatus(facilityId);
    res.json({ success: true, data: members });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── Assign to member (charge now or tab) ───────────────────

router.post('/admin/assign/charge/:facilityId', async (req, res) => {
  try {
    const { facilityId } = req.params;
    if (!await checkFlag(facilityId, res)) return;
    if (!await requireFacilityAdmin(facilityId, req.user?.userId)) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    const { user_id, items } = req.body;
    if (!user_id || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'user_id and items are required' });
    }
    const result = await chargeImmediately(facilityId, user_id, req.user!.userId, items);
    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('[ProShop] Admin charge error:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/admin/assign/tab/:facilityId', async (req, res) => {
  try {
    const { facilityId } = req.params;
    if (!await checkFlag(facilityId, res)) return;
    if (!await requireFacilityAdmin(facilityId, req.user?.userId)) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    const { user_id, items } = req.body;
    if (!user_id || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'user_id and items are required' });
    }
    const result = await addToTab(facilityId, user_id, req.user!.userId, items);
    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('[ProShop] Add to tab error:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

// ── Member cash sale ───────────────────────────────────────

router.post('/admin/assign/cash/:facilityId', async (req, res) => {
  try {
    const { facilityId } = req.params;
    if (!await checkFlag(facilityId, res)) return;
    if (!await requireFacilityAdmin(facilityId, req.user?.userId)) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    const { user_id, items } = req.body;
    if (!user_id || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'user_id and items are required' });
    }
    const result = await recordMemberCashSale(facilityId, user_id, req.user!.userId, items);
    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('[ProShop] Member cash sale error:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

// ── Guest sale ─────────────────────────────────────────────

router.post('/admin/guest-sale/:facilityId', async (req, res) => {
  try {
    const { facilityId } = req.params;
    if (!await checkFlag(facilityId, res)) return;
    if (!await requireFacilityAdmin(facilityId, req.user?.userId)) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    const { guest_name, guest_email, items, payment_mode } = req.body;
    if (!guest_name || typeof guest_name !== 'string' || !guest_name.trim()) {
      return res.status(400).json({ success: false, error: 'guest_name is required' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'items must be a non-empty array' });
    }

    if (payment_mode === 'stripe') {
      const result = await createGuestCheckoutSession(
        facilityId,
        guest_name.trim(),
        guest_email?.trim() || null,
        req.user!.userId,
        items
      );
      return res.json({ success: true, data: result });
    }

    // Default: cash / external payment — record as paid immediately
    const result = await recordGuestSale(
      facilityId,
      req.user!.userId,
      guest_name.trim(),
      guest_email?.trim() || null,
      items
    );
    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('[ProShop] Guest sale error:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

// ── Tabs ───────────────────────────────────────────────────

router.get('/admin/tabs/:facilityId', async (req, res) => {
  try {
    const { facilityId } = req.params;
    if (!await checkFlag(facilityId, res)) return;
    if (!await requireFacilityAdmin(facilityId, req.user?.userId)) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    const tabs = await getAllTabs(facilityId);
    res.json({ success: true, data: tabs });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/admin/bill-tab/:facilityId/:userId', async (req, res) => {
  try {
    const { facilityId, userId } = req.params;
    if (!await checkFlag(facilityId, res)) return;
    if (!await requireFacilityAdmin(facilityId, req.user?.userId)) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    const result = await billMemberTab(facilityId, userId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('[ProShop] Bill tab error:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/admin/bill-all/:facilityId', async (req, res) => {
  try {
    const { facilityId } = req.params;
    if (!await checkFlag(facilityId, res)) return;
    if (!await requireFacilityAdmin(facilityId, req.user?.userId)) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    const results = await billAllTabs(facilityId);
    res.json({ success: true, data: results });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── Member tab & card status ────────────────────────────────

router.get('/my-tab/:facilityId', async (req, res) => {
  try {
    const { facilityId } = req.params;
    if (!await checkFlag(facilityId, res)) return;
    const tab = await getTabDetail(facilityId, req.user!.userId);
    res.json({ success: true, data: tab });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/my-card/:facilityId', async (req, res) => {
  try {
    const { facilityId } = req.params;
    if (!await checkFlag(facilityId, res)) return;
    const card = await getMemberCardStatus(facilityId, req.user!.userId);
    res.json({ success: true, data: card });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
