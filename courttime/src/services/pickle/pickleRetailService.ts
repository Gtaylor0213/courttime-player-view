/**
 * CourtTime-Pickle pro shop / retail service.
 * Isolated from classic payment_items — use org_product_skus + retail_orders only.
 */

import crypto from 'crypto';
import { query, transaction } from '../../database/connection';
import type { PoolClient } from 'pg';
import { isOrgAdmin } from './pickleOrgService';

export type SkuCategory = 'paddle' | 'shoe' | 'ball' | 'apparel' | 'grab_and_go';

export interface OrgProductSku {
  id: string;
  nationalSku: string;
  orgId: string;
  name: string;
  category: SkuCategory;
  brand: string | null;
  basePriceCents: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface LocationInventoryRow {
  id: string;
  skuId: string;
  facilityId: string;
  facilityName?: string;
  qty: number | null;
  priceOverrideCents: number | null;
  nationalSku?: string;
  skuName?: string;
  basePriceCents?: number;
}

export interface SkuRollout {
  id: string;
  orgId: string;
  skuId: string;
  facilityId: string | null;
  status: string;
  effectiveAt: string;
  createdAt: string;
}

export interface RetailOrderLineInput {
  skuId: string;
  quantity: number;
}

export interface PosCheckoutInput {
  orgId: string;
  facilityId: string;
  lines: RetailOrderLineInput[];
  customerUserId?: string;
  createdByUserId: string;
}

export interface PosCheckoutResult {
  orderId: string;
  subtotalCents: number;
  totalCents: number;
  status: string;
  stripeCheckoutPlaceholder: {
    sessionId: string;
    url: string;
    note: string;
  };
}

async function assertOrgSku(orgId: string, skuId: string): Promise<OrgProductSku> {
  const result = await query(
    `SELECT id, national_sku as "nationalSku", org_id as "orgId", name, category, brand,
            base_price_cents as "basePriceCents", status,
            created_at as "createdAt", updated_at as "updatedAt"
     FROM org_product_skus
     WHERE id = $1 AND org_id = $2`,
    [skuId, orgId]
  );
  if (result.rows.length === 0) {
    throw new Error('SKU not found for this organization');
  }
  return result.rows[0];
}

async function assertPickleFacility(orgId: string, facilityId: string): Promise<void> {
  const result = await query(
    `SELECT 1 FROM facilities
     WHERE id = $1 AND org_id = $2 AND product_line = 'pickle'`,
    [facilityId, orgId]
  );
  if (result.rows.length === 0) {
    throw new Error('Facility not found or not part of this organization');
  }
}

export async function listOrgSkus(orgId: string, category?: SkuCategory): Promise<OrgProductSku[]> {
  const params: unknown[] = [orgId];
  let sql = `
    SELECT id, national_sku as "nationalSku", org_id as "orgId", name, category, brand,
           base_price_cents as "basePriceCents", status,
           created_at as "createdAt", updated_at as "updatedAt"
    FROM org_product_skus
    WHERE org_id = $1 AND status = 'active'`;

  if (category) {
    params.push(category);
    sql += ` AND category = $2`;
  }
  sql += ` ORDER BY name`;

  const result = await query(sql, params);
  return result.rows;
}

export async function getOrgSku(orgId: string, skuId: string): Promise<OrgProductSku | null> {
  const result = await query(
    `SELECT id, national_sku as "nationalSku", org_id as "orgId", name, category, brand,
            base_price_cents as "basePriceCents", status,
            created_at as "createdAt", updated_at as "updatedAt"
     FROM org_product_skus
     WHERE id = $1 AND org_id = $2`,
    [skuId, orgId]
  );
  return result.rows[0] || null;
}

export interface CreateSkuInput {
  orgId: string;
  nationalSku: string;
  name: string;
  category: SkuCategory;
  brand?: string;
  basePriceCents: number;
}

export async function createOrgSku(input: CreateSkuInput): Promise<OrgProductSku> {
  const result = await query(
    `INSERT INTO org_product_skus (national_sku, org_id, name, category, brand, base_price_cents)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, national_sku as "nationalSku", org_id as "orgId", name, category, brand,
               base_price_cents as "basePriceCents", status,
               created_at as "createdAt", updated_at as "updatedAt"`,
    [
      input.nationalSku.trim(),
      input.orgId,
      input.name.trim(),
      input.category,
      input.brand?.trim() || null,
      input.basePriceCents,
    ]
  );
  return result.rows[0];
}

export interface UpdateSkuInput {
  orgId: string;
  skuId: string;
  name?: string;
  category?: SkuCategory;
  brand?: string | null;
  basePriceCents?: number;
  status?: 'active' | 'archived';
}

export async function updateOrgSku(input: UpdateSkuInput): Promise<OrgProductSku> {
  await assertOrgSku(input.orgId, input.skuId);

  const result = await query(
    `UPDATE org_product_skus
     SET name = COALESCE($3, name),
         category = COALESCE($4, category),
         brand = COALESCE($5, brand),
         base_price_cents = COALESCE($6, base_price_cents),
         status = COALESCE($7, status),
         updated_at = NOW()
     WHERE id = $1 AND org_id = $2
     RETURNING id, national_sku as "nationalSku", org_id as "orgId", name, category, brand,
               base_price_cents as "basePriceCents", status,
               created_at as "createdAt", updated_at as "updatedAt"`,
    [
      input.skuId,
      input.orgId,
      input.name?.trim() || null,
      input.category || null,
      input.brand === undefined ? null : input.brand,
      input.basePriceCents ?? null,
      input.status || null,
    ]
  );
  return result.rows[0];
}

export async function archiveOrgSku(orgId: string, skuId: string): Promise<void> {
  await assertOrgSku(orgId, skuId);
  await query(
    `UPDATE org_product_skus SET status = 'archived', updated_at = NOW()
     WHERE id = $1 AND org_id = $2`,
    [skuId, orgId]
  );
}

export async function listOrgInventory(
  orgId: string,
  facilityId?: string
): Promise<LocationInventoryRow[]> {
  const params: unknown[] = [orgId];
  let sql = `
    SELECT li.id, li.sku_id as "skuId", li.facility_id as "facilityId",
           li.qty, li.price_override_cents as "priceOverrideCents",
           f.name as "facilityName",
           s.national_sku as "nationalSku", s.name as "skuName",
           s.base_price_cents as "basePriceCents"
    FROM location_inventory li
    JOIN org_product_skus s ON s.id = li.sku_id
    JOIN facilities f ON f.id = li.facility_id
    WHERE s.org_id = $1 AND s.status = 'active'`;

  if (facilityId) {
    params.push(facilityId);
    sql += ` AND li.facility_id = $2`;
  }
  sql += ` ORDER BY f.name, s.name`;

  const result = await query(sql, params);
  return result.rows;
}

export interface UpsertInventoryInput {
  orgId: string;
  facilityId: string;
  skuId: string;
  qty?: number | null;
  priceOverrideCents?: number | null;
}

export async function upsertLocationInventory(input: UpsertInventoryInput): Promise<LocationInventoryRow> {
  await assertOrgSku(input.orgId, input.skuId);
  await assertPickleFacility(input.orgId, input.facilityId);

  const result = await query(
    `INSERT INTO location_inventory (sku_id, facility_id, qty, price_override_cents)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (sku_id, facility_id) DO UPDATE SET
       qty = EXCLUDED.qty,
       price_override_cents = EXCLUDED.price_override_cents,
       updated_at = NOW()
     RETURNING id, sku_id as "skuId", facility_id as "facilityId",
               qty, price_override_cents as "priceOverrideCents"`,
    [input.skuId, input.facilityId, input.qty ?? null, input.priceOverrideCents ?? null]
  );
  return result.rows[0];
}

export interface RolloutSkuInput {
  orgId: string;
  skuId: string;
  facilityId?: string | null;
  status?: 'scheduled' | 'active' | 'paused' | 'ended';
  effectiveAt?: string;
  createdByUserId: string;
}

export async function rolloutSku(input: RolloutSkuInput): Promise<SkuRollout> {
  await assertOrgSku(input.orgId, input.skuId);
  if (input.facilityId) {
    await assertPickleFacility(input.orgId, input.facilityId);
  }

  const status = input.status || 'active';
  const effectiveAt = input.effectiveAt || new Date().toISOString();

  const result = await query(
    `INSERT INTO org_sku_rollouts (org_id, sku_id, facility_id, status, effective_at, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, org_id as "orgId", sku_id as "skuId", facility_id as "facilityId",
               status, effective_at as "effectiveAt", created_at as "createdAt"`,
    [input.orgId, input.skuId, input.facilityId || null, status, effectiveAt, input.createdByUserId]
  );

  const rollout = result.rows[0];

  if (status === 'active') {
    if (input.facilityId) {
      await upsertLocationInventory({
        orgId: input.orgId,
        facilityId: input.facilityId,
        skuId: input.skuId,
      });
    } else {
      const locations = await query(
        `SELECT id FROM facilities WHERE org_id = $1 AND product_line = 'pickle'`,
        [input.orgId]
      );
      for (const loc of locations.rows) {
        await upsertLocationInventory({
          orgId: input.orgId,
          facilityId: loc.id,
          skuId: input.skuId,
        });
      }
    }
  }

  return rollout;
}

export async function listOrgRollouts(orgId: string): Promise<SkuRollout[]> {
  const result = await query(
    `SELECT id, org_id as "orgId", sku_id as "skuId", facility_id as "facilityId",
            status, effective_at as "effectiveAt", created_at as "createdAt"
     FROM org_sku_rollouts
     WHERE org_id = $1
     ORDER BY created_at DESC
     LIMIT 100`,
    [orgId]
  );
  return result.rows;
}

async function resolveUnitPriceCents(
  client: PoolClient,
  skuId: string,
  facilityId: string,
  basePriceCents: number
): Promise<number> {
  const inv = await client.query(
    `SELECT price_override_cents FROM location_inventory
     WHERE sku_id = $1 AND facility_id = $2`,
    [skuId, facilityId]
  );
  const override = inv.rows[0]?.price_override_cents;
  return override != null ? override : basePriceCents;
}

/**
 * POS checkout stub: persists retail_orders + lines, returns Stripe checkout placeholder.
 * Real Stripe session creation is deferred to a later phase.
 */
export async function posCheckout(input: PosCheckoutInput): Promise<PosCheckoutResult> {
  if (!input.lines?.length) {
    throw new Error('At least one line item is required');
  }

  await assertPickleFacility(input.orgId, input.facilityId);

  const admin = await isOrgAdmin(input.createdByUserId, input.orgId);
  if (!admin) {
    const facilityAdmin = await query(
      `SELECT 1 FROM facility_admins fa
       JOIN facilities f ON f.id = fa.facility_id
       WHERE fa.user_id = $1 AND fa.facility_id = $2 AND f.org_id = $3 AND fa.status = 'active'`,
      [input.createdByUserId, input.facilityId, input.orgId]
    );
    if (facilityAdmin.rows.length === 0) {
      throw new Error('Not authorized to checkout at this location');
    }
  }

  return transaction(async (client: PoolClient) => {
    let subtotalCents = 0;
    const resolvedLines: Array<{
      skuId: string;
      quantity: number;
      unitPriceCents: number;
      lineTotalCents: number;
    }> = [];

    for (const line of input.lines) {
      if (line.quantity < 1) throw new Error('Quantity must be at least 1');

      const skuResult = await client.query(
        `SELECT id, base_price_cents, status FROM org_product_skus
         WHERE id = $1 AND org_id = $2`,
        [line.skuId, input.orgId]
      );
      if (skuResult.rows.length === 0 || skuResult.rows[0].status !== 'active') {
        throw new Error(`SKU ${line.skuId} is not available`);
      }

      const unitPriceCents = await resolveUnitPriceCents(
        client,
        line.skuId,
        input.facilityId,
        skuResult.rows[0].base_price_cents
      );
      const lineTotalCents = unitPriceCents * line.quantity;
      subtotalCents += lineTotalCents;

      resolvedLines.push({
        skuId: line.skuId,
        quantity: line.quantity,
        unitPriceCents,
        lineTotalCents,
      });
    }

    const placeholderSessionId = `cs_pickle_stub_${crypto.randomBytes(12).toString('hex')}`;

    const orderResult = await client.query(
      `INSERT INTO retail_orders (
         org_id, facility_id, customer_user_id, status,
         subtotal_cents, total_cents, stripe_checkout_session_id, created_by
       ) VALUES ($1, $2, $3, 'checkout_created', $4, $4, $5, $6)
       RETURNING id`,
      [
        input.orgId,
        input.facilityId,
        input.customerUserId || null,
        subtotalCents,
        placeholderSessionId,
        input.createdByUserId,
      ]
    );

    const orderId = orderResult.rows[0].id;

    for (const line of resolvedLines) {
      await client.query(
        `INSERT INTO retail_order_lines (order_id, sku_id, quantity, unit_price_cents, line_total_cents)
         VALUES ($1, $2, $3, $4, $5)`,
        [orderId, line.skuId, line.quantity, line.unitPriceCents, line.lineTotalCents]
      );
    }

    await client.query(
      `INSERT INTO pickle_revenue_events (
         org_id, facility_id, category, amount_cents, source_type, source_id, description, occurred_at
       ) VALUES ($1, $2, 'pro_shop', $3, 'retail_order', $4, 'POS checkout (pending payment)', NOW())`,
      [input.orgId, input.facilityId, subtotalCents, orderId]
    );

    const appUrl = process.env.APP_URL || 'http://localhost:5173';

    return {
      orderId,
      subtotalCents,
      totalCents: subtotalCents,
      status: 'checkout_created',
      stripeCheckoutPlaceholder: {
        sessionId: placeholderSessionId,
        url: `${appUrl}/pickle/pos/checkout/${orderId}?stub=1`,
        note: 'Stripe Connect checkout session creation is stubbed for Phase 4.',
      },
    };
  });
}

export async function listRetailOrders(orgId: string, limit = 50) {
  const result = await query(
    `SELECT ro.id, ro.facility_id as "facilityId", f.name as "facilityName",
            ro.status, ro.subtotal_cents as "subtotalCents", ro.total_cents as "totalCents",
            ro.stripe_checkout_session_id as "stripeCheckoutSessionId",
            ro.created_at as "createdAt"
     FROM retail_orders ro
     JOIN facilities f ON f.id = ro.facility_id
     WHERE ro.org_id = $1
     ORDER BY ro.created_at DESC
     LIMIT $2`,
    [orgId, limit]
  );
  return result.rows;
}
