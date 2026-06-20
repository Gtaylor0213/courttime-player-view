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
  if (ordersCheck.rows.length > 0) {
    // Has order history — deactivate instead of hard delete
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
       u.full_name AS member_name, u.email AS member_email,
       json_agg(json_build_object(
         'product_id', oi.product_id,
         'name', p.name,
         'quantity', oi.quantity,
         'price_cents', oi.price_cents_at_purchase
       ) ORDER BY p.name) AS items
     FROM pro_shop_orders o
     JOIN users u ON u.id = o.user_id
     JOIN pro_shop_order_items oi ON oi.order_id = o.id
     JOIN pro_shop_products p ON p.id = oi.product_id
     WHERE o.facility_id = $1
     GROUP BY o.id, u.full_name, u.email
     ORDER BY o.created_at DESC`,
    [facilityId]
  );
  return result.rows;
}

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
