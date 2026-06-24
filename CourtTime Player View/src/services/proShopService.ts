import Stripe from 'stripe';
import { query, getClient } from '../database/connection';

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key.startsWith('sk_test_xxxx')) return null;
  return new Stripe(key);
}

function getBaseUrl(): string {
  return process.env.APP_BASE_URL || process.env.CLIENT_URL || 'http://localhost:5173';
}

// ── Products ───────────────────────────────────────────────

export async function getActiveProducts(facilityId: string) {
  const result = await query(
    `SELECT id, name, description, category, price_cents, stock_quantity, image_data, is_active, created_at
     FROM pro_shop_products
     WHERE facility_id = $1 AND is_active = true
     ORDER BY category, name`,
    [facilityId]
  );
  return result.rows;
}

export async function getAllProducts(facilityId: string) {
  const result = await query(
    `SELECT id, name, description, category, price_cents, stock_quantity, image_data, is_active, created_at, updated_at
     FROM pro_shop_products
     WHERE facility_id = $1
     ORDER BY category, name`,
    [facilityId]
  );
  return result.rows;
}

export async function createProduct(facilityId: string, data: {
  name: string;
  description?: string;
  category: string;
  price_cents: number;
  stock_quantity?: number | null;
  image_data?: string | null;
  is_active?: boolean;
}) {
  const result = await query(
    `INSERT INTO pro_shop_products
       (facility_id, name, description, category, price_cents, stock_quantity, image_data, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      facilityId,
      data.name,
      data.description ?? null,
      data.category,
      data.price_cents,
      data.stock_quantity ?? null,
      data.image_data ?? null,
      data.is_active ?? true,
    ]
  );
  return result.rows[0];
}

export async function updateProduct(productId: string, data: {
  name?: string;
  description?: string | null;
  category?: string;
  price_cents?: number;
  stock_quantity?: number | null;
  image_data?: string | null;
  is_active?: boolean;
}) {
  const fields: string[] = [];
  const values: any[] = [];
  let idx = 1;

  if (data.name !== undefined)           { fields.push(`name = $${idx++}`);           values.push(data.name); }
  if (data.description !== undefined)    { fields.push(`description = $${idx++}`);    values.push(data.description); }
  if (data.category !== undefined)       { fields.push(`category = $${idx++}`);       values.push(data.category); }
  if (data.price_cents !== undefined)    { fields.push(`price_cents = $${idx++}`);    values.push(data.price_cents); }
  if (data.stock_quantity !== undefined) { fields.push(`stock_quantity = $${idx++}`); values.push(data.stock_quantity); }
  if (data.image_data !== undefined)     { fields.push(`image_data = $${idx++}`);     values.push(data.image_data); }
  if (data.is_active !== undefined)      { fields.push(`is_active = $${idx++}`);      values.push(data.is_active); }

  if (fields.length === 0) return null;

  fields.push(`updated_at = NOW()`);
  values.push(productId);

  const result = await query(
    `UPDATE pro_shop_products SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  );
  return result.rows[0] ?? null;
}

export async function deleteProduct(productId: string): Promise<{ deleted: boolean; reason?: string }> {
  const ordersCheck = await query(
    `SELECT 1 FROM pro_shop_order_items WHERE product_id = $1 LIMIT 1`,
    [productId]
  );
  const tabCheck = await query(
    `SELECT 1 FROM pro_shop_tab_items WHERE product_id = $1 LIMIT 1`,
    [productId]
  );
  if (ordersCheck.rows.length > 0 || tabCheck.rows.length > 0) {
    await query(`UPDATE pro_shop_products SET is_active = false, updated_at = NOW() WHERE id = $1`, [productId]);
    return { deleted: false, reason: 'deactivated' };
  }
  await query(`DELETE FROM pro_shop_products WHERE id = $1`, [productId]);
  return { deleted: true };
}

// ── Checkout ───────────────────────────────────────────────

export async function createCheckoutSession(
  facilityId: string,
  userId: string,
  items: { product_id: string; quantity: number }[]
): Promise<{ url: string | null; orderId: string; devMode: boolean }> {
  const productIds = items.map(i => i.product_id);
  const productsResult = await query(
    `SELECT id, name, price_cents, stock_quantity FROM pro_shop_products
     WHERE id = ANY($1::uuid[]) AND facility_id = $2 AND is_active = true`,
    [productIds, facilityId]
  );
  const productMap = new Map(productsResult.rows.map((p: any) => [p.id, p]));

  let totalCents = 0;
  const lineItems: { product_id: string; quantity: number; price_cents: number; name: string }[] = [];

  for (const item of items) {
    const product = productMap.get(item.product_id) as any;
    if (!product) throw new Error(`Product ${item.product_id} not found or not available`);
    if (product.stock_quantity !== null && product.stock_quantity < item.quantity) {
      throw new Error(`Insufficient stock for "${product.name}"`);
    }
    lineItems.push({ product_id: item.product_id, quantity: item.quantity, price_cents: product.price_cents, name: product.name });
    totalCents += product.price_cents * item.quantity;
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const orderResult = await client.query(
      `INSERT INTO pro_shop_orders (facility_id, user_id, status, total_cents)
       VALUES ($1, $2, 'pending', $3) RETURNING id`,
      [facilityId, userId, totalCents]
    );
    const orderId = orderResult.rows[0].id;

    for (const item of lineItems) {
      await client.query(
        `INSERT INTO pro_shop_order_items (order_id, product_id, quantity, price_cents_at_purchase)
         VALUES ($1, $2, $3, $4)`,
        [orderId, item.product_id, item.quantity, item.price_cents]
      );
    }

    const stripe = getStripe();
    if (!stripe) {
      // Dev mode — skip real Stripe
      await client.query(
        `UPDATE pro_shop_orders SET stripe_checkout_session_id = $1, status = 'paid', updated_at = NOW() WHERE id = $2`,
        [`dev_session_${Date.now()}`, orderId]
      );
      await client.query('COMMIT');
      return { url: null, orderId, devMode: true };
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems.map(i => ({
        price_data: {
          currency: 'usd',
          product_data: { name: i.name },
          unit_amount: i.price_cents,
        },
        quantity: i.quantity,
      })),
      metadata: { type: 'pro_shop', order_id: orderId, facility_id: facilityId },
      success_url: `${getBaseUrl()}/shop?order=success`,
      cancel_url: `${getBaseUrl()}/shop`,
    });

    await client.query(
      `UPDATE pro_shop_orders SET stripe_checkout_session_id = $1, updated_at = NOW() WHERE id = $2`,
      [session.id, orderId]
    );

    await client.query('COMMIT');
    return { url: session.url, orderId, devMode: false };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function createGuestCheckoutSession(
  facilityId: string,
  guestName: string,
  guestEmail: string | null,
  adminId: string,
  items: { product_id: string; quantity: number }[]
): Promise<{ url: string | null; orderId: string; devMode: boolean }> {
  const productIds = items.map(i => i.product_id);
  const productsResult = await query(
    `SELECT id, name, price_cents, stock_quantity FROM pro_shop_products
     WHERE id = ANY($1::uuid[]) AND facility_id = $2 AND is_active = true`,
    [productIds, facilityId]
  );
  const productMap = new Map(productsResult.rows.map((p: any) => [p.id, p]));

  let totalCents = 0;
  const lineItems: { product_id: string; quantity: number; price_cents: number; name: string }[] = [];

  for (const item of items) {
    const product = productMap.get(item.product_id) as any;
    if (!product) throw new Error(`Product ${item.product_id} not found or not available`);
    if (product.stock_quantity !== null && product.stock_quantity < item.quantity) {
      throw new Error(`Insufficient stock for "${product.name}"`);
    }
    lineItems.push({ product_id: item.product_id, quantity: item.quantity, price_cents: product.price_cents, name: product.name });
    totalCents += product.price_cents * item.quantity;
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const orderResult = await client.query(
      `INSERT INTO pro_shop_orders
         (facility_id, user_id, guest_name, guest_email, charged_by, status, total_cents)
       VALUES ($1, NULL, $2, $3, $4, 'pending', $5) RETURNING id`,
      [facilityId, guestName, guestEmail ?? null, adminId, totalCents]
    );
    const orderId = orderResult.rows[0].id;

    for (const item of lineItems) {
      await client.query(
        `INSERT INTO pro_shop_order_items (order_id, product_id, quantity, price_cents_at_purchase)
         VALUES ($1, $2, $3, $4)`,
        [orderId, item.product_id, item.quantity, item.price_cents]
      );
    }

    const stripe = getStripe();
    if (!stripe) {
      await client.query(
        `UPDATE pro_shop_orders SET stripe_checkout_session_id = $1, status = 'paid', updated_at = NOW() WHERE id = $2`,
        [`dev_session_${Date.now()}`, orderId]
      );
      await client.query('COMMIT');
      return { url: null, orderId, devMode: true };
    }

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: 'payment',
      line_items: lineItems.map(i => ({
        price_data: {
          currency: 'usd',
          product_data: { name: i.name },
          unit_amount: i.price_cents,
        },
        quantity: i.quantity,
      })),
      metadata: { type: 'pro_shop_guest', order_id: orderId, facility_id: facilityId },
      success_url: `${getBaseUrl()}/shop?order=success`,
      cancel_url: `${getBaseUrl()}/shop`,
    };

    if (guestEmail) {
      sessionParams.customer_email = guestEmail;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    await client.query(
      `UPDATE pro_shop_orders SET stripe_checkout_session_id = $1, updated_at = NOW() WHERE id = $2`,
      [session.id, orderId]
    );

    await client.query('COMMIT');
    return { url: session.url, orderId, devMode: false };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function finalizeOrder(sessionId: string): Promise<void> {
  const orderResult = await query(
    `SELECT id FROM pro_shop_orders WHERE stripe_checkout_session_id = $1`,
    [sessionId]
  );
  if (orderResult.rows.length === 0) return;

  const orderId = orderResult.rows[0].id;

  const client = await getClient();
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE pro_shop_orders SET status = 'paid', updated_at = NOW() WHERE id = $1`,
      [orderId]
    );

    // Decrement stock for products with finite quantity
    const items = await client.query(
      `SELECT product_id, quantity FROM pro_shop_order_items WHERE order_id = $1`,
      [orderId]
    );
    for (const item of items.rows) {
      await client.query(
        `UPDATE pro_shop_products
         SET stock_quantity = GREATEST(0, stock_quantity - $1), updated_at = NOW()
         WHERE id = $2 AND stock_quantity IS NOT NULL`,
        [item.quantity, item.product_id]
      );
    }

    await client.query('COMMIT');
    console.log(`[ProShop] Order ${orderId} finalized for session ${sessionId}`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ── Orders ─────────────────────────────────────────────────

export async function getAdminOrders(facilityId: string) {
  const result = await query(
    `SELECT
       o.id, o.status, o.total_cents, o.created_at, o.stripe_checkout_session_id,
       COALESCE(u.full_name, o.guest_name) AS member_name,
       COALESCE(u.email, o.guest_email)    AS member_email,
       (o.user_id IS NULL)                 AS is_guest,
       json_agg(json_build_object(
         'product_id', oi.product_id,
         'name', p.name,
         'quantity', oi.quantity,
         'price_cents', oi.price_cents_at_purchase
       ) ORDER BY p.name) AS items
     FROM pro_shop_orders o
     LEFT JOIN users u ON u.id = o.user_id
     JOIN pro_shop_order_items oi ON oi.order_id = o.id
     JOIN pro_shop_products p ON p.id = oi.product_id
     WHERE o.facility_id = $1
     GROUP BY o.id, u.full_name, u.email, o.guest_name, o.guest_email
     ORDER BY o.created_at DESC`,
    [facilityId]
  );
  return result.rows;
}

export async function recordGuestSale(
  facilityId: string,
  adminId: string,
  guestName: string,
  guestEmail: string | null,
  items: { product_id: string; quantity: number }[]
) {
  const productIds = items.map(i => i.product_id);
  const productsResult = await query(
    `SELECT id, name, price_cents, stock_quantity FROM pro_shop_products
     WHERE id = ANY($1::uuid[]) AND facility_id = $2 AND is_active = true`,
    [productIds, facilityId]
  );
  if (productsResult.rows.length !== productIds.length) {
    throw new Error('One or more products not found');
  }

  const productMap = new Map(productsResult.rows.map((p: any) => [p.id, p]));
  const lineItems: { product_id: string; quantity: number; price_cents: number; name: string }[] = [];
  let totalCents = 0;

  for (const item of items) {
    const product = productMap.get(item.product_id) as any;
    if (product.stock_quantity !== null && product.stock_quantity < item.quantity) {
      throw new Error(`Insufficient stock for "${product.name}"`);
    }
    lineItems.push({ product_id: item.product_id, quantity: item.quantity, price_cents: product.price_cents, name: product.name });
    totalCents += product.price_cents * item.quantity;
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const orderResult = await client.query(
      `INSERT INTO pro_shop_orders
         (facility_id, user_id, guest_name, guest_email, charged_by, status, total_cents)
       VALUES ($1, NULL, $2, $3, $4, 'paid', $5) RETURNING id`,
      [facilityId, guestName, guestEmail ?? null, adminId, totalCents]
    );
    const orderId = orderResult.rows[0].id;

    for (const item of lineItems) {
      await client.query(
        `INSERT INTO pro_shop_order_items (order_id, product_id, quantity, price_cents_at_purchase)
         VALUES ($1, $2, $3, $4)`,
        [orderId, item.product_id, item.quantity, item.price_cents]
      );
      await client.query(
        `UPDATE pro_shop_products
         SET stock_quantity = GREATEST(0, stock_quantity - $1), updated_at = NOW()
         WHERE id = $2 AND stock_quantity IS NOT NULL`,
        [item.quantity, item.product_id]
      );
    }

    await client.query('COMMIT');
    return { orderId, totalCents };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ── Settings ───────��───────────────────────────────────────

export async function getProShopSettings(facilityId: string) {
  const result = await query(
    `SELECT tab_billing_day, require_card FROM pro_shop_settings WHERE facility_id = $1`,
    [facilityId]
  );
  return result.rows[0] ?? { tab_billing_day: 1, require_card: false };
}

export async function updateProShopSettings(facilityId: string, settings: {
  tab_billing_day?: number;
  require_card?: boolean;
}) {
  await query(
    `INSERT INTO pro_shop_settings (facility_id, tab_billing_day, require_card, updated_at)
     VALUES ($1, COALESCE($2, 1), COALESCE($3, false), NOW())
     ON CONFLICT (facility_id) DO UPDATE
     SET tab_billing_day = COALESCE($2, pro_shop_settings.tab_billing_day),
         require_card     = COALESCE($3, pro_shop_settings.require_card),
         updated_at       = NOW()`,
    [facilityId, settings.tab_billing_day ?? null, settings.require_card ?? null]
  );
  return getProShopSettings(facilityId);
}

// ── Members & card status ─────���────────────────────────────

export async function getMembersWithCardStatus(facilityId: string) {
  const result = await query(
    `SELECT u.id, u.full_name, u.email,
            (fm.stripe_default_payment_method_id IS NOT NULL AND fm.card_last4 IS NOT NULL) as has_card,
            fm.card_brand, fm.card_last4
     FROM facility_memberships fm
     JOIN users u ON u.id = fm.user_id
     WHERE fm.facility_id = $1 AND fm.status = 'active'
     ORDER BY u.full_name`,
    [facilityId]
  );
  return result.rows;
}

export async function getMemberCardStatus(facilityId: string, userId: string) {
  const result = await query(
    `SELECT (stripe_default_payment_method_id IS NOT NULL AND card_last4 IS NOT NULL) as has_card,
            card_brand, card_last4, card_exp_month, card_exp_year
     FROM facility_memberships
     WHERE facility_id = $1 AND user_id = $2`,
    [facilityId, userId]
  );
  return result.rows[0] ?? { has_card: false };
}

// ── Member cash sale ──────────────────────────────────────

export async function recordMemberCashSale(
  facilityId: string,
  userId: string,
  adminId: string,
  items: { product_id: string; quantity: number }[]
) {
  const productIds = items.map(i => i.product_id);
  const productsResult = await query(
    `SELECT id, name, price_cents, stock_quantity FROM pro_shop_products
     WHERE id = ANY($1::uuid[]) AND facility_id = $2 AND is_active = true`,
    [productIds, facilityId]
  );
  if (productsResult.rows.length !== productIds.length) {
    throw new Error('One or more products not found');
  }

  const productMap = new Map(productsResult.rows.map((p: any) => [p.id, p]));
  const lineItems: { product_id: string; quantity: number; price_cents: number }[] = [];
  let totalCents = 0;

  for (const item of items) {
    const product = productMap.get(item.product_id) as any;
    if (product.stock_quantity !== null && product.stock_quantity < item.quantity) {
      throw new Error(`Insufficient stock for "${product.name}"`);
    }
    lineItems.push({ product_id: item.product_id, quantity: item.quantity, price_cents: product.price_cents });
    totalCents += product.price_cents * item.quantity;
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');
    const orderResult = await client.query(
      `INSERT INTO pro_shop_orders (facility_id, user_id, charged_by, status, total_cents)
       VALUES ($1, $2, $3, 'paid', $4) RETURNING id`,
      [facilityId, userId, adminId, totalCents]
    );
    const orderId = orderResult.rows[0].id;
    for (const item of lineItems) {
      await client.query(
        `INSERT INTO pro_shop_order_items (order_id, product_id, quantity, price_cents_at_purchase)
         VALUES ($1, $2, $3, $4)`,
        [orderId, item.product_id, item.quantity, item.price_cents]
      );
      await client.query(
        `UPDATE pro_shop_products
         SET stock_quantity = GREATEST(0, stock_quantity - $1), updated_at = NOW()
         WHERE id = $2 AND stock_quantity IS NOT NULL`,
        [item.quantity, item.product_id]
      );
    }
    await client.query('COMMIT');
    return { orderId, totalCents };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ── Tab management ───────���─────────────────────────────────

async function getOrCreateTab(facilityId: string, userId: string): Promise<string> {
  const result = await query(
    `INSERT INTO pro_shop_tabs (facility_id, user_id) VALUES ($1, $2)
     ON CONFLICT (facility_id, user_id) DO UPDATE SET updated_at = NOW()
     RETURNING id`,
    [facilityId, userId]
  );
  return result.rows[0].id as string;
}

export async function addToTab(
  facilityId: string,
  userId: string,
  adminId: string,
  items: { product_id: string; quantity: number }[]
) {
  const productIds = items.map(i => i.product_id);
  const productsResult = await query(
    `SELECT id, name, price_cents FROM pro_shop_products WHERE id = ANY($1::uuid[]) AND facility_id = $2`,
    [productIds, facilityId]
  );
  if (productsResult.rows.length !== productIds.length) throw new Error('One or more products not found');

  const productMap = new Map(productsResult.rows.map((p: any) => [p.id, p]));
  const tabId = await getOrCreateTab(facilityId, userId);

  for (const item of items) {
    const p = productMap.get(item.product_id) as any;
    await query(
      `INSERT INTO pro_shop_tab_items (tab_id, product_id, product_name, quantity, price_cents, assigned_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [tabId, p.id, p.name, item.quantity, p.price_cents, adminId]
    );
  }
  return getTabDetail(facilityId, userId);
}

export async function getTabDetail(facilityId: string, userId: string) {
  const result = await query(
    `SELECT t.id as tab_id,
            COALESCE(SUM(ti.price_cents * ti.quantity) FILTER (WHERE ti.billed_at IS NULL), 0) as unbilled_cents,
            json_agg(json_build_object(
              'id', ti.id, 'product_name', ti.product_name,
              'quantity', ti.quantity, 'price_cents', ti.price_cents,
              'assigned_at', ti.assigned_at
            )) FILTER (WHERE ti.billed_at IS NULL) as items
     FROM pro_shop_tabs t
     LEFT JOIN pro_shop_tab_items ti ON ti.tab_id = t.id
     WHERE t.facility_id = $1 AND t.user_id = $2
     GROUP BY t.id`,
    [facilityId, userId]
  );
  return result.rows[0] ?? null;
}

export async function getAllTabs(facilityId: string) {
  const result = await query(
    `SELECT t.user_id,
            u.full_name as member_name, u.email as member_email,
            (fm.stripe_default_payment_method_id IS NOT NULL AND fm.card_last4 IS NOT NULL) as has_card,
            fm.card_brand, fm.card_last4,
            COALESCE(SUM(ti.price_cents * ti.quantity) FILTER (WHERE ti.billed_at IS NULL), 0) as unbilled_cents,
            json_agg(json_build_object('product_name', ti.product_name, 'quantity', ti.quantity))
              FILTER (WHERE ti.billed_at IS NULL) as items
     FROM pro_shop_tabs t
     JOIN users u ON u.id = t.user_id
     LEFT JOIN facility_memberships fm ON fm.user_id = t.user_id AND fm.facility_id = t.facility_id
     LEFT JOIN pro_shop_tab_items ti ON ti.tab_id = t.id
     WHERE t.facility_id = $1
     GROUP BY t.user_id, u.full_name, u.email,
              fm.stripe_default_payment_method_id, fm.card_last4, fm.card_brand
     HAVING COALESCE(SUM(ti.price_cents * ti.quantity) FILTER (WHERE ti.billed_at IS NULL), 0) > 0
     ORDER BY u.full_name`,
    [facilityId]
  );
  return result.rows;
}

// ── Admin direct charge ────────────────────────────────────

export async function chargeImmediately(
  facilityId: string,
  userId: string,
  adminId: string,
  items: { product_id: string; quantity: number }[]
) {
  const memberResult = await query(
    `SELECT fm.stripe_customer_id, fm.stripe_default_payment_method_id,
            f.stripe_account_id, f.stripe_onboarded
     FROM facility_memberships fm
     JOIN facilities f ON f.id = $1
     WHERE fm.facility_id = $1 AND fm.user_id = $2 AND fm.status = 'active'`,
    [facilityId, userId]
  );
  if (memberResult.rows.length === 0) throw new Error('Member not found or not active');
  const m = memberResult.rows[0];

  const productIds = items.map(i => i.product_id);
  const productsResult = await query(
    `SELECT id, name, price_cents FROM pro_shop_products WHERE id = ANY($1::uuid[]) AND facility_id = $2`,
    [productIds, facilityId]
  );
  if (productsResult.rows.length !== productIds.length) throw new Error('One or more products not found');
  const productMap = new Map(productsResult.rows.map((p: any) => [p.id, p]));
  const lineItems = items.map(i => ({ ...(productMap.get(i.product_id) as any), quantity: i.quantity }));
  const totalCents = lineItems.reduce((s: number, i: any) => s + i.price_cents * i.quantity, 0);

  const stripe = getStripe();
  let piId: string;

  if (!stripe) {
    piId = `dev_pi_${Date.now()}`;
  } else {
    if (!m.stripe_customer_id || !m.stripe_default_payment_method_id) {
      throw new Error('Member does not have a card on file');
    }
    if (!m.stripe_account_id || !m.stripe_onboarded) {
      throw new Error('This facility has not completed Stripe Connect setup');
    }
    const desc = lineItems.map((i: any) => `${i.name} ×${i.quantity}`).join(', ');
    const pi = await stripe.paymentIntents.create(
      {
        amount: totalCents,
        currency: 'usd',
        customer: m.stripe_customer_id,
        payment_method: m.stripe_default_payment_method_id,
        off_session: true,
        confirm: true,
        description: `Pro Shop – ${desc}`,
        metadata: { type: 'pro_shop_admin_charge', facility_id: facilityId, assigned_by: adminId },
      },
      { stripeAccount: m.stripe_account_id }
    );
    piId = pi.id;
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');
    const orderResult = await client.query(
      `INSERT INTO pro_shop_orders (facility_id, user_id, stripe_payment_intent_id, charged_by, status, total_cents)
       VALUES ($1, $2, $3, $4, 'paid', $5) RETURNING id`,
      [facilityId, userId, piId, adminId, totalCents]
    );
    const orderId = orderResult.rows[0].id;
    for (const item of lineItems) {
      await client.query(
        `INSERT INTO pro_shop_order_items (order_id, product_id, quantity, price_cents_at_purchase)
         VALUES ($1, $2, $3, $4)`,
        [orderId, (item as any).id, (item as any).quantity, (item as any).price_cents]
      );
      await client.query(
        `UPDATE pro_shop_products
         SET stock_quantity = GREATEST(0, stock_quantity - $2), updated_at = NOW()
         WHERE id = $1 AND stock_quantity IS NOT NULL`,
        [(item as any).id, (item as any).quantity]
      );
    }
    await client.query('COMMIT');
    return { orderId, totalCents };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ── Tab billing ──────���──────────────────────────────────────

export async function billMemberTab(facilityId: string, userId: string) {
  const tab = await getTabDetail(facilityId, userId);
  if (!tab || Number(tab.unbilled_cents) === 0) throw new Error('No unbilled items on this tab');

  const memberResult = await query(
    `SELECT fm.stripe_customer_id, fm.stripe_default_payment_method_id,
            f.stripe_account_id, f.stripe_onboarded
     FROM facility_memberships fm
     JOIN facilities f ON f.id = $1
     WHERE fm.facility_id = $1 AND fm.user_id = $2 AND fm.status = 'active'`,
    [facilityId, userId]
  );
  if (memberResult.rows.length === 0) throw new Error('Member not found');
  const m = memberResult.rows[0];

  const totalCents = Number(tab.unbilled_cents);
  const items = (tab.items ?? []) as any[];
  const desc = items.map(i => `${i.product_name} ×${i.quantity}`).join(', ');

  const stripe = getStripe();
  let piId: string;

  if (!stripe) {
    piId = `dev_pi_tab_${Date.now()}`;
  } else {
    if (!m.stripe_customer_id || !m.stripe_default_payment_method_id) {
      throw new Error('Member does not have a card on file');
    }
    if (!m.stripe_account_id || !m.stripe_onboarded) {
      throw new Error('This facility has not completed Stripe Connect setup');
    }
    const pi = await stripe.paymentIntents.create(
      {
        amount: totalCents,
        currency: 'usd',
        customer: m.stripe_customer_id,
        payment_method: m.stripe_default_payment_method_id,
        off_session: true,
        confirm: true,
        description: `Pro Shop Tab – ${desc}`,
        metadata: { type: 'pro_shop_tab_billing', facility_id: facilityId, user_id: userId },
      },
      { stripeAccount: m.stripe_account_id }
    );
    piId = pi.id;
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');
    const orderResult = await client.query(
      `INSERT INTO pro_shop_orders (facility_id, user_id, stripe_payment_intent_id, status, total_cents)
       VALUES ($1, $2, $3, 'paid', $4) RETURNING id`,
      [facilityId, userId, piId, totalCents]
    );
    const orderId = orderResult.rows[0].id;

    const tabItems = await client.query(
      `SELECT id, product_id, quantity, price_cents FROM pro_shop_tab_items
       WHERE tab_id = $1 AND billed_at IS NULL`,
      [tab.tab_id]
    );
    for (const ti of tabItems.rows) {
      await client.query(
        `INSERT INTO pro_shop_order_items (order_id, product_id, quantity, price_cents_at_purchase)
         VALUES ($1, $2, $3, $4)`,
        [orderId, ti.product_id, ti.quantity, ti.price_cents]
      );
    }
    await client.query(
      `UPDATE pro_shop_tab_items SET billed_at = NOW(), billing_order_id = $2
       WHERE tab_id = $1 AND billed_at IS NULL`,
      [tab.tab_id, orderId]
    );
    await client.query(`UPDATE pro_shop_tabs SET updated_at = NOW() WHERE id = $1`, [tab.tab_id]);
    await client.query('COMMIT');
    return { orderId, totalCents };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function billAllTabs(facilityId: string) {
  const tabs = await getAllTabs(facilityId);
  const results: { userId: string; name: string; success: boolean; amount?: number; error?: string }[] = [];
  for (const tab of tabs) {
    try {
      const result = await billMemberTab(facilityId, tab.user_id);
      results.push({ userId: tab.user_id, name: tab.member_name, success: true, amount: result.totalCents });
    } catch (err: any) {
      results.push({ userId: tab.user_id, name: tab.member_name, success: false, error: err.message });
    }
  }
  return results;
}

// ── Orders ─────────────────────────────────────────────────

export async function getUserOrders(facilityId: string, userId: string) {
  const result = await query(
    `SELECT
       o.id, o.status, o.total_cents, o.created_at,
       json_agg(json_build_object(
         'name', p.name,
         'quantity', oi.quantity,
         'price_cents', oi.price_cents_at_purchase
       ) ORDER BY p.name) AS items
     FROM pro_shop_orders o
     JOIN pro_shop_order_items oi ON oi.order_id = o.id
     JOIN pro_shop_products p ON p.id = oi.product_id
     WHERE o.facility_id = $1 AND o.user_id = $2
     GROUP BY o.id
     ORDER BY o.created_at DESC`,
    [facilityId, userId]
  );
  return result.rows;
}
