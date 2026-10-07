/**
 * CourtTime-Pickle membership catalog and subscription service.
 * Isolated from classic facility_memberships — do not modify memberService for tennis.
 */

import { query, transaction } from '../../database/connection';
import type { PoolClient } from 'pg';
import { randomBytes } from 'crypto';
import { isOrgAdmin } from './pickleOrgService';
import { isFacilityAdmin } from '../memberService';

export type MembershipTier = 'trial' | 'unlimited' | 'play' | 'pro';

export type HomePerkType = 'clinic' | 'guest_pass' | 'ball_machine' | 'paddle_fitting';

export interface BrandWideEntitlements {
  courtBooking: boolean;
  openPlay: boolean;
  socials: boolean;
  leagues: boolean;
  tournaments: boolean;
  courtDiscountPercent: number;
}

export interface HomeFacilityEntitlements {
  clinicsPerMonth: number;
  guestPassesPerMonth: number;
  ballMachine: boolean;
  wingfieldAi: boolean;
  paddleFittingPerYear: number;
  renewalCreditCents: number;
}

export interface ProductEntitlements {
  brandWide: BrandWideEntitlements;
  homeFacility: HomeFacilityEntitlements;
  dropInPriceCents: number;
}

export interface MembershipProduct {
  id: string;
  orgId: string;
  nationalSku: string;
  tier: MembershipTier;
  name: string;
  priceCents: number;
  durationDays: number | null;
  entitlements: ProductEntitlements;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MemberSubscription {
  id: string;
  userId: string;
  orgId: string;
  productId: string;
  homeFacilityId: string;
  status: string;
  stripeSubscriptionId: string | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  createdAt: string;
  updatedAt: string;
  product?: MembershipProduct;
  homeFacilityName?: string;
}

export interface ProductRollout {
  id: string;
  orgId: string;
  productId: string;
  facilityId: string;
  facilityName?: string;
  enabled: boolean;
}

export interface EvaluatedEntitlements {
  subscription: MemberSubscription | null;
  product: MembershipProduct | null;
  brandWide: BrandWideEntitlements | null;
  homeFacility: HomeFacilityEntitlements | null;
  homePerkUsage: Record<string, { limit: number; used: number; remaining: number }>;
  isAtHomeFacility: boolean;
  dropInPriceCents: number;
}

const DEFAULT_ENTITLEMENTS: ProductEntitlements = {
  brandWide: {
    courtBooking: false,
    openPlay: false,
    socials: false,
    leagues: false,
    tournaments: false,
    courtDiscountPercent: 0,
  },
  homeFacility: {
    clinicsPerMonth: 0,
    guestPassesPerMonth: 0,
    ballMachine: false,
    wingfieldAi: false,
    paddleFittingPerYear: 0,
    renewalCreditCents: 0,
  },
  dropInPriceCents: 1500,
};

function parseEntitlements(raw: unknown): ProductEntitlements {
  if (!raw || typeof raw !== 'object') return DEFAULT_ENTITLEMENTS;
  const e = raw as Record<string, unknown>;
  const brand = (e.brandWide || {}) as Record<string, unknown>;
  const home = (e.homeFacility || {}) as Record<string, unknown>;
  return {
    brandWide: {
      courtBooking: Boolean(brand.courtBooking),
      openPlay: Boolean(brand.openPlay),
      socials: Boolean(brand.socials),
      leagues: Boolean(brand.leagues),
      tournaments: Boolean(brand.tournaments),
      courtDiscountPercent: Number(brand.courtDiscountPercent) || 0,
    },
    homeFacility: {
      clinicsPerMonth: Number(home.clinicsPerMonth) || 0,
      guestPassesPerMonth: Number(home.guestPassesPerMonth) || 0,
      ballMachine: Boolean(home.ballMachine),
      wingfieldAi: Boolean(home.wingfieldAi),
      paddleFittingPerYear: Number(home.paddleFittingPerYear) || 0,
      renewalCreditCents: Number(home.renewalCreditCents) || 0,
    },
    dropInPriceCents: Number(e.dropInPriceCents) ?? 1500,
  };
}

function mapProduct(row: Record<string, unknown>): MembershipProduct {
  return {
    id: row.id as string,
    orgId: row.orgId as string,
    nationalSku: row.nationalSku as string,
    tier: row.tier as MembershipTier,
    name: row.name as string,
    priceCents: row.priceCents as number,
    durationDays: row.durationDays != null ? Number(row.durationDays) : null,
    entitlements: parseEntitlements(row.entitlements),
    isActive: Boolean(row.isActive),
    createdAt: row.createdAt as string,
    updatedAt: row.updatedAt as string,
  };
}

function mapSubscription(row: Record<string, unknown>): MemberSubscription {
  return {
    id: row.id as string,
    userId: row.userId as string,
    orgId: row.orgId as string,
    productId: row.productId as string,
    homeFacilityId: row.homeFacilityId as string,
    status: row.status as string,
    stripeSubscriptionId: (row.stripeSubscriptionId as string) || null,
    trialEndsAt: (row.trialEndsAt as string) || null,
    currentPeriodEnd: (row.currentPeriodEnd as string) || null,
    createdAt: row.createdAt as string,
    updatedAt: row.updatedAt as string,
    homeFacilityName: row.homeFacilityName as string | undefined,
  };
}

export function currentPeriodMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

export async function requireOrgCatalogAdmin(userId: string, orgId: string): Promise<void> {
  const admin = await isOrgAdmin(userId, orgId);
  if (!admin) {
    throw new Error('Not authorized for this organization');
  }
}

export async function listProducts(orgId: string, includeInactive = false): Promise<MembershipProduct[]> {
  const result = await query(
    `SELECT id, org_id as "orgId", national_sku as "nationalSku", tier, name,
            price_cents as "priceCents", duration_days as "durationDays",
            entitlements, is_active as "isActive",
            created_at as "createdAt", updated_at as "updatedAt"
     FROM org_membership_products
     WHERE org_id = $1 ${includeInactive ? '' : 'AND is_active = true'}
     ORDER BY
       CASE tier
         WHEN 'trial' THEN 1
         WHEN 'play' THEN 2
         WHEN 'unlimited' THEN 3
         WHEN 'pro' THEN 4
       END,
       name`,
    [orgId]
  );
  return result.rows.map(mapProduct);
}

export async function getProduct(orgId: string, productId: string): Promise<MembershipProduct | null> {
  const result = await query(
    `SELECT id, org_id as "orgId", national_sku as "nationalSku", tier, name,
            price_cents as "priceCents", duration_days as "durationDays",
            entitlements, is_active as "isActive",
            created_at as "createdAt", updated_at as "updatedAt"
     FROM org_membership_products
     WHERE org_id = $1 AND id = $2`,
    [orgId, productId]
  );
  return result.rows[0] ? mapProduct(result.rows[0]) : null;
}

export interface CreateProductInput {
  orgId: string;
  nationalSku: string;
  tier: MembershipTier;
  name: string;
  priceCents: number;
  durationDays?: number | null;
  entitlements?: Partial<ProductEntitlements>;
}

export async function createProduct(input: CreateProductInput): Promise<MembershipProduct> {
  const entitlements = {
    ...DEFAULT_ENTITLEMENTS,
    ...input.entitlements,
    brandWide: { ...DEFAULT_ENTITLEMENTS.brandWide, ...input.entitlements?.brandWide },
    homeFacility: { ...DEFAULT_ENTITLEMENTS.homeFacility, ...input.entitlements?.homeFacility },
  };

  const result = await query(
    `INSERT INTO org_membership_products
       (org_id, national_sku, tier, name, price_cents, duration_days, entitlements)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
     RETURNING id, org_id as "orgId", national_sku as "nationalSku", tier, name,
               price_cents as "priceCents", duration_days as "durationDays",
               entitlements, is_active as "isActive",
               created_at as "createdAt", updated_at as "updatedAt"`,
    [
      input.orgId,
      input.nationalSku,
      input.tier,
      input.name,
      input.priceCents,
      input.durationDays ?? null,
      JSON.stringify(entitlements),
    ]
  );
  return mapProduct(result.rows[0]);
}

export interface UpdateProductInput {
  name?: string;
  priceCents?: number;
  durationDays?: number | null;
  entitlements?: ProductEntitlements;
  isActive?: boolean;
}

export async function updateProduct(
  orgId: string,
  productId: string,
  updates: UpdateProductInput
): Promise<MembershipProduct | null> {
  const fields: string[] = [];
  const values: unknown[] = [orgId, productId];
  let idx = 3;

  if (updates.name !== undefined) {
    fields.push(`name = $${idx++}`);
    values.push(updates.name);
  }
  if (updates.priceCents !== undefined) {
    fields.push(`price_cents = $${idx++}`);
    values.push(updates.priceCents);
  }
  if (updates.durationDays !== undefined) {
    fields.push(`duration_days = $${idx++}`);
    values.push(updates.durationDays);
  }
  if (updates.entitlements !== undefined) {
    fields.push(`entitlements = $${idx++}::jsonb`);
    values.push(JSON.stringify(updates.entitlements));
  }
  if (updates.isActive !== undefined) {
    fields.push(`is_active = $${idx++}`);
    values.push(updates.isActive);
  }

  if (fields.length === 0) {
    return getProduct(orgId, productId);
  }

  fields.push('updated_at = NOW()');

  const result = await query(
    `UPDATE org_membership_products
     SET ${fields.join(', ')}
     WHERE org_id = $1 AND id = $2
     RETURNING id, org_id as "orgId", national_sku as "nationalSku", tier, name,
               price_cents as "priceCents", duration_days as "durationDays",
               entitlements, is_active as "isActive",
               created_at as "createdAt", updated_at as "updatedAt"`,
    values
  );
  return result.rows[0] ? mapProduct(result.rows[0]) : null;
}

export async function seedDefaultProducts(orgId: string): Promise<number> {
  const result = await query('SELECT seed_pickle_membership_products($1)', [orgId]);
  const countResult = await query(
    'SELECT COUNT(*)::int AS count FROM org_membership_products WHERE org_id = $1',
    [orgId]
  );
  return countResult.rows[0]?.count ?? 0;
}

export async function rolloutAllProductsAtFacility(
  orgId: string,
  facilityId: string,
  client: PoolClient
): Promise<void> {
  const products = await client.query(
    `SELECT id FROM org_membership_products WHERE org_id = $1 AND is_active = true`,
    [orgId]
  );
  for (const row of products.rows) {
    await client.query(
      `INSERT INTO org_product_rollouts (org_id, product_id, facility_id, enabled)
       VALUES ($1, $2, $3, true)
       ON CONFLICT (org_id, product_id, facility_id) DO UPDATE SET enabled = true, updated_at = NOW()`,
      [orgId, row.id, facilityId]
    );
  }
}

export async function listProductRollouts(orgId: string, productId: string): Promise<ProductRollout[]> {
  const result = await query(
    `SELECT r.id, r.org_id as "orgId", r.product_id as "productId",
            r.facility_id as "facilityId", r.enabled,
            f.name as "facilityName"
     FROM org_product_rollouts r
     JOIN facilities f ON f.id = r.facility_id
     WHERE r.org_id = $1 AND r.product_id = $2
     ORDER BY f.name`,
    [orgId, productId]
  );
  return result.rows;
}

export async function setProductRollouts(
  orgId: string,
  productId: string,
  rollouts: Array<{ facilityId: string; enabled: boolean }>
): Promise<ProductRollout[]> {
  return transaction(async (client: PoolClient) => {
    for (const rollout of rollouts) {
      await client.query(
        `INSERT INTO org_product_rollouts (org_id, product_id, facility_id, enabled)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (org_id, product_id, facility_id)
         DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = NOW()`,
        [orgId, productId, rollout.facilityId, rollout.enabled]
      );
    }
    const result = await client.query(
      `SELECT r.id, r.org_id as "orgId", r.product_id as "productId",
              r.facility_id as "facilityId", r.enabled,
              f.name as "facilityName"
       FROM org_product_rollouts r
       JOIN facilities f ON f.id = r.facility_id
       WHERE r.org_id = $1 AND r.product_id = $2
       ORDER BY f.name`,
      [orgId, productId]
    );
    return result.rows;
  });
}

export async function isProductEnabledAtFacility(
  orgId: string,
  productId: string,
  facilityId: string
): Promise<boolean> {
  const result = await query(
    `SELECT enabled FROM org_product_rollouts
     WHERE org_id = $1 AND product_id = $2 AND facility_id = $3`,
    [orgId, productId, facilityId]
  );
  if (result.rows.length === 0) return true;
  return Boolean(result.rows[0].enabled);
}

export async function getMemberSubscription(
  userId: string,
  orgId: string
): Promise<MemberSubscription | null> {
  const result = await query(
    `SELECT ms.id, ms.user_id as "userId", ms.org_id as "orgId",
            ms.product_id as "productId", ms.home_facility_id as "homeFacilityId",
            ms.status, ms.stripe_subscription_id as "stripeSubscriptionId",
            ms.trial_ends_at as "trialEndsAt", ms.current_period_end as "currentPeriodEnd",
            ms.created_at as "createdAt", ms.updated_at as "updatedAt",
            f.name as "homeFacilityName",
            p.id as "p_id", p.org_id as "p_orgId", p.national_sku as "p_nationalSku",
            p.tier as "p_tier", p.name as "p_name", p.price_cents as "p_priceCents",
            p.duration_days as "p_durationDays", p.entitlements as "p_entitlements",
            p.is_active as "p_isActive", p.created_at as "p_createdAt", p.updated_at as "p_updatedAt"
     FROM member_subscriptions ms
     JOIN org_membership_products p ON p.id = ms.product_id
     JOIN facilities f ON f.id = ms.home_facility_id
     WHERE ms.user_id = $1 AND ms.org_id = $2
       AND ms.status IN ('active', 'trialing', 'past_due')
     ORDER BY ms.created_at DESC
     LIMIT 1`,
    [userId, orgId]
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  const subscription = mapSubscription(row);
  subscription.product = mapProduct({
    id: row.p_id,
    orgId: row.p_orgId,
    nationalSku: row.p_nationalSku,
    tier: row.p_tier,
    name: row.p_name,
    priceCents: row.p_priceCents,
    durationDays: row.p_durationDays,
    entitlements: row.p_entitlements,
    isActive: row.p_isActive,
    createdAt: row.p_createdAt,
    updatedAt: row.p_updatedAt,
  });
  return subscription;
}

export interface CreateSubscriptionInput {
  userId: string;
  orgId: string;
  productId: string;
  homeFacilityId: string;
  stripeSubscriptionId?: string;
  status?: 'active' | 'trialing' | 'past_due' | 'canceled' | 'expired';
}

export async function createSubscription(input: CreateSubscriptionInput): Promise<MemberSubscription> {
  const product = await getProduct(input.orgId, input.productId);
  if (!product || !product.isActive) {
    throw new Error('Membership product not found or inactive');
  }

  const facilityCheck = await query(
    `SELECT id FROM facilities
     WHERE id = $1 AND org_id = $2 AND product_line = 'pickle'`,
    [input.homeFacilityId, input.orgId]
  );
  if (facilityCheck.rows.length === 0) {
    throw new Error('Home facility must belong to this organization');
  }

  const enabled = await isProductEnabledAtFacility(input.orgId, input.productId, input.homeFacilityId);
  if (!enabled) {
    throw new Error('This membership product is not enabled at the selected home facility');
  }

  const now = new Date();
  let trialEndsAt: Date | null = null;
  let currentPeriodEnd: Date | null = null;

  if (product.tier === 'trial' && product.durationDays) {
    trialEndsAt = new Date(now);
    trialEndsAt.setDate(trialEndsAt.getDate() + product.durationDays);
    currentPeriodEnd = trialEndsAt;
  } else if (product.durationDays) {
    currentPeriodEnd = new Date(now);
    currentPeriodEnd.setDate(currentPeriodEnd.getDate() + product.durationDays);
  }

  const status = input.status ?? (product.tier === 'trial' ? 'trialing' : 'active');

  return transaction(async (client: PoolClient) => {
    await client.query(
      `UPDATE member_subscriptions
       SET status = 'canceled', updated_at = NOW()
       WHERE user_id = $1 AND org_id = $2 AND status IN ('active', 'trialing', 'past_due')`,
      [input.userId, input.orgId]
    );

    const result = await client.query(
      `INSERT INTO member_subscriptions
         (user_id, org_id, product_id, home_facility_id, status,
          stripe_subscription_id, trial_ends_at, current_period_end)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, user_id as "userId", org_id as "orgId",
                 product_id as "productId", home_facility_id as "homeFacilityId",
                 status, stripe_subscription_id as "stripeSubscriptionId",
                 trial_ends_at as "trialEndsAt", current_period_end as "currentPeriodEnd",
                 created_at as "createdAt", updated_at as "updatedAt"`,
      [
        input.userId,
        input.orgId,
        input.productId,
        input.homeFacilityId,
        status,
        input.stripeSubscriptionId ?? null,
        trialEndsAt?.toISOString() ?? null,
        currentPeriodEnd?.toISOString() ?? null,
      ]
    );

    const subscription = mapSubscription(result.rows[0]);
    subscription.product = product;
    return subscription;
  });
}

async function getLedgerUsage(
  subscriptionId: string,
  periodMonth: string
): Promise<Record<string, number>> {
  const result = await query(
    `SELECT perk_type, used_count
     FROM member_entitlement_ledger
     WHERE subscription_id = $1 AND period_month = $2`,
    [subscriptionId, periodMonth]
  );
  const usage: Record<string, number> = {};
  for (const row of result.rows) {
    usage[row.perk_type] = row.used_count;
  }
  return usage;
}

export async function evaluateEntitlements(
  userId: string,
  orgId: string,
  facilityId: string
): Promise<EvaluatedEntitlements> {
  const subscription = await getMemberSubscription(userId, orgId);
  const periodMonth = currentPeriodMonth();

  if (!subscription?.product) {
    const defaultProduct = (await listProducts(orgId))[0];
    return {
      subscription: null,
      product: null,
      brandWide: null,
      homeFacility: null,
      homePerkUsage: {},
      isAtHomeFacility: false,
      dropInPriceCents: defaultProduct?.entitlements.dropInPriceCents ?? 1500,
    };
  }

  const product = subscription.product;
  const isAtHomeFacility = subscription.homeFacilityId === facilityId;
  const usage = await getLedgerUsage(subscription.id, periodMonth);
  const home = product.entitlements.homeFacility;

  const homePerkUsage: EvaluatedEntitlements['homePerkUsage'] = {
    clinic: {
      limit: home.clinicsPerMonth,
      used: usage.clinic ?? 0,
      remaining: Math.max(0, home.clinicsPerMonth - (usage.clinic ?? 0)),
    },
    guest_pass: {
      limit: home.guestPassesPerMonth,
      used: usage.guest_pass ?? 0,
      remaining: Math.max(0, home.guestPassesPerMonth - (usage.guest_pass ?? 0)),
    },
    ball_machine: {
      limit: home.ballMachine ? 999 : 0,
      used: usage.ball_machine ?? 0,
      remaining: home.ballMachine ? 999 - (usage.ball_machine ?? 0) : 0,
    },
    paddle_fitting: {
      limit: home.paddleFittingPerYear,
      used: usage.paddle_fitting ?? 0,
      remaining: Math.max(0, home.paddleFittingPerYear - (usage.paddle_fitting ?? 0)),
    },
  };

  const productEnabled = await isProductEnabledAtFacility(orgId, product.id, facilityId);

  return {
    subscription,
    product: productEnabled ? product : null,
    brandWide: productEnabled ? product.entitlements.brandWide : null,
    homeFacility: isAtHomeFacility && productEnabled ? home : null,
    homePerkUsage: isAtHomeFacility ? homePerkUsage : {},
    isAtHomeFacility,
    dropInPriceCents: productEnabled
      ? product.entitlements.dropInPriceCents
      : DEFAULT_ENTITLEMENTS.dropInPriceCents,
  };
}

export async function incrementHomePerkUsage(
  subscriptionId: string,
  perkType: HomePerkType,
  periodMonth: string
): Promise<{ used: number; limit: number }> {
  const result = await query(
    `INSERT INTO member_entitlement_ledger (subscription_id, perk_type, period_month, used_count)
     VALUES ($1, $2, $3, 1)
     ON CONFLICT (subscription_id, perk_type, period_month)
     DO UPDATE SET used_count = member_entitlement_ledger.used_count + 1,
                   updated_at = NOW()
     RETURNING used_count`,
    [subscriptionId, perkType, periodMonth]
  );
  return { used: result.rows[0].used_count, limit: 0 };
}

export async function getFacilityOrgId(facilityId: string): Promise<string | null> {
  const result = await query(
    `SELECT org_id as "orgId", product_line as "productLine"
     FROM facilities WHERE id = $1`,
    [facilityId]
  );
  if (result.rows.length === 0) return null;
  if (result.rows[0].productLine !== 'pickle') return null;
  return result.rows[0].orgId || null;
}

export interface FacilityMemberWithTier {
  userId: string;
  email: string;
  fullName: string;
  membershipStatus: string;
  membershipType: string;
  tierLabel: string;
  productName: string | null;
  subscriptionStatus: string | null;
  subscriptionId: string | null;
}

async function requireFacilityAdmin(
  adminUserId: string,
  facilityId: string
): Promise<{ orgId: string }> {
  const admin = await isFacilityAdmin(facilityId, adminUserId);
  if (!admin) {
    throw new Error('Not authorized for this facility');
  }
  const orgId = await getFacilityOrgId(facilityId);
  if (!orgId) {
    throw new Error('Facility not found or not a pickle location');
  }
  return { orgId };
}

export async function listFacilityMembershipProducts(
  facilityId: string,
  adminUserId: string
): Promise<MembershipProduct[]> {
  const { orgId } = await requireFacilityAdmin(adminUserId, facilityId);
  const products = await listProducts(orgId);
  const enabled: MembershipProduct[] = [];
  for (const product of products) {
    if (await isProductEnabledAtFacility(orgId, product.id, facilityId)) {
      enabled.push(product);
    }
  }
  return enabled;
}

export async function listFacilityMembersWithTiers(
  facilityId: string,
  adminUserId: string
): Promise<FacilityMemberWithTier[]> {
  await requireFacilityAdmin(adminUserId, facilityId);

  const result = await query(
    `SELECT
       u.id as "userId",
       u.email,
       u.full_name as "fullName",
       fm.status as "membershipStatus",
       fm.membership_type as "membershipType",
       COALESCE(p.tier, 'non_member') as "tierLabel",
       p.name as "productName",
       ms.status as "subscriptionStatus",
       ms.id as "subscriptionId"
     FROM facility_memberships fm
     JOIN users u ON u.id = fm.user_id
     JOIN facilities f ON f.id = fm.facility_id
     LEFT JOIN LATERAL (
       SELECT ms_inner.id, ms_inner.status, ms_inner.product_id
       FROM member_subscriptions ms_inner
       WHERE ms_inner.user_id = fm.user_id
         AND ms_inner.org_id = f.org_id
         AND ms_inner.status IN ('active', 'trialing', 'past_due')
       ORDER BY ms_inner.created_at DESC
       LIMIT 1
     ) ms ON true
     LEFT JOIN org_membership_products p ON p.id = ms.product_id
     WHERE fm.facility_id = $1
     ORDER BY u.full_name, u.email`,
    [facilityId]
  );

  return result.rows;
}

export interface AdminAssignMembershipInput {
  adminUserId: string;
  facilityId: string;
  userId: string;
  productId: string;
}

export async function adminAssignMembership(
  input: AdminAssignMembershipInput
): Promise<MemberSubscription> {
  const { orgId } = await requireFacilityAdmin(input.adminUserId, input.facilityId);

  const membershipCheck = await query(
    `SELECT 1 FROM facility_memberships
     WHERE facility_id = $1 AND user_id = $2`,
    [input.facilityId, input.userId]
  );
  if (membershipCheck.rows.length === 0) {
    throw new Error('User is not a member of this facility');
  }

  const product = await getProduct(orgId, input.productId);
  if (!product) {
    throw new Error('Membership product not found');
  }

  const subscription = await createSubscription({
    userId: input.userId,
    orgId,
    productId: input.productId,
    homeFacilityId: input.facilityId,
    status: product.tier === 'trial' ? 'trialing' : 'active',
  });

  await query(
    `UPDATE facility_memberships
     SET membership_type = $1, updated_at = NOW()
     WHERE facility_id = $2 AND user_id = $3`,
    [product.tier, input.facilityId, input.userId]
  );

  return subscription;
}

export interface AdminCancelMembershipInput {
  adminUserId: string;
  facilityId: string;
  userId: string;
}

export async function adminCancelMembership(
  input: AdminCancelMembershipInput
): Promise<{ canceled: boolean }> {
  const { orgId } = await requireFacilityAdmin(input.adminUserId, input.facilityId);

  const result = await query(
    `UPDATE member_subscriptions
     SET status = 'canceled', updated_at = NOW()
     WHERE user_id = $1 AND org_id = $2
       AND status IN ('active', 'trialing', 'past_due')`,
    [input.userId, orgId]
  );

  await query(
    `UPDATE facility_memberships
     SET membership_type = 'non_member', updated_at = NOW()
     WHERE facility_id = $1 AND user_id = $2`,
    [input.facilityId, input.userId]
  );

  return { canceled: (result.rowCount ?? 0) > 0 };
}

export interface AdminAddFacilityMemberInput {
  adminUserId: string;
  facilityId: string;
  email: string;
  fullName: string;
  productId?: string;
}

export async function adminAddFacilityMember(
  input: AdminAddFacilityMemberInput
): Promise<{ userId: string; subscription?: MemberSubscription }> {
  const { orgId } = await requireFacilityAdmin(input.adminUserId, input.facilityId);
  const normalizedEmail = input.email.trim().toLowerCase();
  if (!normalizedEmail || !input.fullName.trim()) {
    throw new Error('Email and full name are required');
  }

  return transaction(async (client: PoolClient) => {
    let userId: string;
    const existing = await client.query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);

    if (existing.rows.length > 0) {
      userId = existing.rows[0].id as string;
    } else {
      const bcrypt = await import('bcrypt');
      const nameParts = input.fullName.trim().split(/\s+/);
      const tempPassword = randomBytes(24).toString('hex');
      const passwordHash = await bcrypt.hash(tempPassword, 10);
      const userResult = await client.query(
        `INSERT INTO users (email, password_hash, full_name, first_name, last_name, user_type)
         VALUES ($1, $2, $3, $4, $5, 'player')
         RETURNING id`,
        [
          normalizedEmail,
          passwordHash,
          input.fullName.trim(),
          nameParts[0] || '',
          nameParts.slice(1).join(' ') || '',
        ]
      );
      userId = userResult.rows[0].id as string;

      await client.query(
        `INSERT INTO user_preferences (user_id, notifications, timezone, theme)
         VALUES ($1, true, 'America/New_York', 'light')`,
        [userId]
      );
    }

    await client.query(
      `INSERT INTO facility_memberships (user_id, facility_id, membership_type, status, start_date)
       VALUES ($1, $2, 'non_member', 'active', CURRENT_DATE)
       ON CONFLICT (user_id, facility_id)
       DO UPDATE SET status = 'active', updated_at = NOW()`,
      [userId, input.facilityId]
    );

    if (input.productId) {
      const enabled = await isProductEnabledAtFacility(orgId, input.productId, input.facilityId);
      if (!enabled) {
        throw new Error('This membership product is not enabled at this facility');
      }

      const product = await getProduct(orgId, input.productId);
      if (!product || !product.isActive) {
        throw new Error('Membership product not found or inactive');
      }

      await client.query(
        `UPDATE member_subscriptions
         SET status = 'canceled', updated_at = NOW()
         WHERE user_id = $1 AND org_id = $2 AND status IN ('active', 'trialing', 'past_due')`,
        [userId, orgId]
      );

      const now = new Date();
      let trialEndsAt: Date | null = null;
      let currentPeriodEnd: Date | null = null;
      if (product.tier === 'trial' && product.durationDays) {
        trialEndsAt = new Date(now);
        trialEndsAt.setDate(trialEndsAt.getDate() + product.durationDays);
        currentPeriodEnd = trialEndsAt;
      } else if (product.durationDays) {
        currentPeriodEnd = new Date(now);
        currentPeriodEnd.setDate(currentPeriodEnd.getDate() + product.durationDays);
      }

      const status = product.tier === 'trial' ? 'trialing' : 'active';
      await client.query(
        `INSERT INTO member_subscriptions
           (user_id, org_id, product_id, home_facility_id, status, trial_ends_at, current_period_end)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          userId,
          orgId,
          input.productId,
          input.facilityId,
          status,
          trialEndsAt?.toISOString() ?? null,
          currentPeriodEnd?.toISOString() ?? null,
        ]
      );

      await client.query(
        `UPDATE facility_memberships
         SET membership_type = $1, updated_at = NOW()
         WHERE facility_id = $2 AND user_id = $3`,
        [product.tier, input.facilityId, userId]
      );

      const subscription = await getMemberSubscription(userId, orgId);
      return { userId, subscription: subscription ?? undefined };
    }

    return { userId };
  });
}
