import Stripe from 'stripe';
import { query } from '../database/connection';

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AnnualFeeTier {
  id: string;
  facilityId: string;
  name: string;
  amountCents: number;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AnnualFeeConfig {
  facilityId: string;
  billingMonth: number;
  billingDay: number;
  isActive: boolean;
}

export interface BillingPreviewMember {
  userId: string;
  fullName: string;
  email: string;
  tierId: string;
  tierName: string;
  amountCents: number;
  hasSavedCard: boolean;
  cardBrand: string | null;
  cardLast4: string | null;
  alreadyBilledThisYear: boolean;
}

export interface BillingRunResult {
  runId: string;
  billingYear: number;
  totalMembers: number;
  chargedCount: number;
  lockoutCount: number;
  failedCount: number;
  waivedCount: number;
}

// ---------------------------------------------------------------------------
// Tier CRUD
// ---------------------------------------------------------------------------

export async function getAnnualFeeTiers(facilityId: string): Promise<AnnualFeeTier[]> {
  const result = await query(
    `SELECT id, facility_id, name, amount_cents, description, is_active, created_at, updated_at
       FROM annual_fee_tiers WHERE facility_id = $1 ORDER BY name`,
    [facilityId]
  );
  return result.rows.map(row => ({
    id: row.id,
    facilityId: row.facility_id,
    name: row.name,
    amountCents: row.amount_cents,
    description: row.description,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function createAnnualFeeTier(
  facilityId: string,
  name: string,
  amountCents: number,
  description?: string
): Promise<AnnualFeeTier> {
  const result = await query(
    `INSERT INTO annual_fee_tiers (facility_id, name, amount_cents, description)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [facilityId, name, amountCents, description ?? null]
  );
  const row = result.rows[0];
  return {
    id: row.id,
    facilityId: row.facility_id,
    name: row.name,
    amountCents: row.amount_cents,
    description: row.description,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function updateAnnualFeeTier(
  tierId: string,
  facilityId: string,
  updates: { name?: string; amountCents?: number; description?: string | null; isActive?: boolean }
): Promise<AnnualFeeTier> {
  const fields: string[] = [];
  const values: any[] = [];
  let i = 1;

  if (updates.name !== undefined) { fields.push(`name = $${i++}`); values.push(updates.name); }
  if (updates.amountCents !== undefined) { fields.push(`amount_cents = $${i++}`); values.push(updates.amountCents); }
  if (updates.description !== undefined) { fields.push(`description = $${i++}`); values.push(updates.description); }
  if (updates.isActive !== undefined) { fields.push(`is_active = $${i++}`); values.push(updates.isActive); }

  if (fields.length === 0) throw new Error('No fields to update');

  fields.push(`updated_at = NOW()`);
  values.push(tierId, facilityId);

  const result = await query(
    `UPDATE annual_fee_tiers SET ${fields.join(', ')}
      WHERE id = $${i++} AND facility_id = $${i++} RETURNING *`,
    values
  );
  if (result.rows.length === 0) throw new Error('Tier not found');
  const row = result.rows[0];
  return {
    id: row.id,
    facilityId: row.facility_id,
    name: row.name,
    amountCents: row.amount_cents,
    description: row.description,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function deleteAnnualFeeTier(tierId: string, facilityId: string): Promise<void> {
  // Unassign members from this tier before deleting
  await query(
    `UPDATE facility_memberships SET annual_fee_tier_id = NULL
      WHERE annual_fee_tier_id = $1 AND facility_id = $2`,
    [tierId, facilityId]
  );
  await query(
    `DELETE FROM annual_fee_tiers WHERE id = $1 AND facility_id = $2`,
    [tierId, facilityId]
  );
}

// ---------------------------------------------------------------------------
// Billing config
// ---------------------------------------------------------------------------

export async function getAnnualFeeConfig(facilityId: string): Promise<AnnualFeeConfig | null> {
  const result = await query(
    `SELECT facility_id, billing_month, billing_day, is_active
       FROM annual_fee_config WHERE facility_id = $1`,
    [facilityId]
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    facilityId: row.facility_id,
    billingMonth: row.billing_month,
    billingDay: row.billing_day,
    isActive: row.is_active,
  };
}

export async function upsertAnnualFeeConfig(
  facilityId: string,
  billingMonth: number,
  billingDay: number
): Promise<AnnualFeeConfig> {
  const result = await query(
    `INSERT INTO annual_fee_config (facility_id, billing_month, billing_day, is_active, updated_at)
     VALUES ($1, $2, $3, true, NOW())
     ON CONFLICT (facility_id)
     DO UPDATE SET billing_month = $2, billing_day = $3, is_active = true, updated_at = NOW()
     RETURNING *`,
    [facilityId, billingMonth, billingDay]
  );
  const row = result.rows[0];
  return {
    facilityId: row.facility_id,
    billingMonth: row.billing_month,
    billingDay: row.billing_day,
    isActive: row.is_active,
  };
}

// ---------------------------------------------------------------------------
// Member tier assignment
// ---------------------------------------------------------------------------

export async function assignMemberTier(
  facilityId: string,
  userId: string,
  tierId: string | null
): Promise<void> {
  if (tierId) {
    // Verify tier belongs to this facility
    const check = await query(
      `SELECT id FROM annual_fee_tiers WHERE id = $1 AND facility_id = $2`,
      [tierId, facilityId]
    );
    if (check.rows.length === 0) throw new Error('Tier not found for this facility');
  }
  await query(
    `UPDATE facility_memberships SET annual_fee_tier_id = $3, updated_at = NOW()
      WHERE user_id = $1 AND facility_id = $2`,
    [userId, facilityId, tierId]
  );
}

export async function getMembersWithTiers(facilityId: string): Promise<{
  userId: string;
  fullName: string;
  email: string;
  membershipType: string | null;
  status: string;
  tierId: string | null;
  tierName: string | null;
  tierAmountCents: number | null;
  hasSavedCard: boolean;
  cardBrand: string | null;
  cardLast4: string | null;
}[]> {
  const result = await query(
    `SELECT
       u.id           AS user_id,
       u.full_name    AS full_name,
       u.email        AS email,
       fm.membership_type,
       fm.status,
       fm.annual_fee_tier_id AS tier_id,
       aft.name       AS tier_name,
       aft.amount_cents AS tier_amount_cents,
       fm.stripe_default_payment_method_id IS NOT NULL
         AND fm.card_last4 IS NOT NULL AS has_saved_card,
       fm.card_brand,
       fm.card_last4
     FROM facility_memberships fm
     JOIN users u ON u.id = fm.user_id
     LEFT JOIN annual_fee_tiers aft ON aft.id = fm.annual_fee_tier_id
     WHERE fm.facility_id = $1
       AND fm.status = 'active'
     ORDER BY u.full_name`,
    [facilityId]
  );
  return result.rows.map(row => ({
    userId: row.user_id,
    fullName: row.full_name,
    email: row.email,
    membershipType: row.membership_type,
    status: row.status,
    tierId: row.tier_id,
    tierName: row.tier_name,
    tierAmountCents: row.tier_amount_cents,
    hasSavedCard: row.has_saved_card === true,
    cardBrand: row.card_brand,
    cardLast4: row.card_last4,
  }));
}

// ---------------------------------------------------------------------------
// Billing preview
// ---------------------------------------------------------------------------

export async function previewBillingRun(facilityId: string): Promise<{
  billingYear: number;
  members: BillingPreviewMember[];
}> {
  const billingYear = new Date().getFullYear();

  const result = await query(
    `SELECT
       u.id           AS user_id,
       u.full_name    AS full_name,
       u.email        AS email,
       fm.annual_fee_tier_id AS tier_id,
       aft.name       AS tier_name,
       aft.amount_cents AS amount_cents,
       fm.stripe_default_payment_method_id IS NOT NULL
         AND fm.card_last4 IS NOT NULL AS has_saved_card,
       fm.card_brand,
       fm.card_last4,
       EXISTS (
         SELECT 1 FROM annual_fee_billing_records afbr
          WHERE afbr.user_id = u.id
            AND afbr.facility_id = $1
            AND afbr.billing_year = $2
            AND afbr.status = 'charged'
       ) AS already_billed
     FROM facility_memberships fm
     JOIN users u ON u.id = fm.user_id
     JOIN annual_fee_tiers aft ON aft.id = fm.annual_fee_tier_id
     WHERE fm.facility_id = $1
       AND fm.status = 'active'
       AND aft.is_active = true
     ORDER BY u.full_name`,
    [facilityId, billingYear]
  );

  return {
    billingYear,
    members: result.rows.map(row => ({
      userId: row.user_id,
      fullName: row.full_name,
      email: row.email,
      tierId: row.tier_id,
      tierName: row.tier_name,
      amountCents: row.amount_cents,
      hasSavedCard: row.has_saved_card === true,
      cardBrand: row.card_brand,
      cardLast4: row.card_last4,
      alreadyBilledThisYear: row.already_billed === true,
    })),
  };
}

// ---------------------------------------------------------------------------
// Billing run
// ---------------------------------------------------------------------------

export async function runAnnualBilling(
  facilityId: string,
  triggeredBy: string
): Promise<BillingRunResult> {
  const stripe = getStripe();
  const billingYear = new Date().getFullYear();

  // Get facility Stripe info
  const facilityResult = await query(
    `SELECT stripe_account_id, stripe_onboarded, platform_fee_percent
       FROM facilities WHERE id = $1`,
    [facilityId]
  );
  if (facilityResult.rows.length === 0) throw new Error('Facility not found');
  const facility = facilityResult.rows[0];
  const stripeAccountId: string | null = facility.stripe_account_id;
  const stripeOnboarded: boolean = facility.stripe_onboarded === true;
  const platformFeePercent: number = Number(facility.platform_fee_percent ?? 0);

  // Get members with tiers not yet billed this year
  const membersResult = await query(
    `SELECT
       u.id           AS user_id,
       fm.annual_fee_tier_id AS tier_id,
       aft.name       AS tier_name,
       aft.amount_cents AS amount_cents,
       fm.stripe_customer_id,
       fm.stripe_default_payment_method_id AS payment_method_id,
       fm.card_last4
     FROM facility_memberships fm
     JOIN users u ON u.id = fm.user_id
     JOIN annual_fee_tiers aft ON aft.id = fm.annual_fee_tier_id
     WHERE fm.facility_id = $1
       AND fm.status = 'active'
       AND aft.is_active = true
       AND NOT EXISTS (
         SELECT 1 FROM annual_fee_billing_records afbr
          WHERE afbr.user_id = u.id
            AND afbr.facility_id = $1
            AND afbr.billing_year = $2
            AND afbr.status = 'charged'
       )`,
    [facilityId, billingYear]
  );

  const members = membersResult.rows;
  if (members.length === 0) {
    // Nothing to do — create an empty run record and return
    const runResult = await query(
      `INSERT INTO annual_fee_billing_runs
         (facility_id, billing_year, total_members, triggered_by, completed_at)
       VALUES ($1, $2, 0, $3, NOW()) RETURNING id`,
      [facilityId, billingYear, triggeredBy]
    );
    return {
      runId: runResult.rows[0].id,
      billingYear,
      totalMembers: 0,
      chargedCount: 0,
      lockoutCount: 0,
      failedCount: 0,
      waivedCount: 0,
    };
  }

  // Create the run record
  const runResult = await query(
    `INSERT INTO annual_fee_billing_runs
       (facility_id, billing_year, total_members, triggered_by)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [facilityId, billingYear, members.length, triggeredBy]
  );
  const runId: string = runResult.rows[0].id;

  let chargedCount = 0;
  let lockoutCount = 0;
  let failedCount = 0;
  let waivedCount = 0;

  for (const member of members) {
    const amountCents: number = member.amount_cents;
    const platformFeeCents = Math.round((amountCents * platformFeePercent) / 100);
    const hasSavedCard = !!member.payment_method_id && !!member.card_last4;

    if (!hasSavedCard) {
      // Apply payment lockout
      await query(
        `UPDATE facility_memberships
            SET is_payment_locked = true,
                payment_locked_at = NOW(),
                lockout_amount_cents = $3,
                lockout_description = $4,
                updated_at = NOW()
          WHERE user_id = $1 AND facility_id = $2`,
        [
          member.user_id,
          facilityId,
          amountCents,
          `Annual membership fee - ${member.tier_name} (${billingYear})`,
        ]
      );
      await query(
        `INSERT INTO annual_fee_billing_records
           (run_id, facility_id, user_id, tier_id, tier_name, amount_cents, billing_year, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'lockout_applied')`,
        [runId, facilityId, member.user_id, member.tier_id, member.tier_name, amountCents, billingYear]
      );
      lockoutCount++;
      continue;
    }

    if (!stripe || !stripeAccountId || !stripeOnboarded) {
      // Stripe not configured — lock the member out so they can't access the app
      await query(
        `UPDATE facility_memberships
            SET is_payment_locked = true,
                payment_locked_at = NOW(),
                lockout_amount_cents = $3,
                lockout_description = $4,
                updated_at = NOW()
          WHERE user_id = $1 AND facility_id = $2`,
        [
          member.user_id,
          facilityId,
          amountCents,
          `Annual membership fee - ${member.tier_name} (${billingYear})`,
        ]
      );
      await query(
        `INSERT INTO annual_fee_billing_records
           (run_id, facility_id, user_id, tier_id, tier_name, amount_cents, billing_year, status, error_message)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'lockout_applied', 'Stripe not configured')`,
        [runId, facilityId, member.user_id, member.tier_id, member.tier_name, amountCents, billingYear]
      );
      lockoutCount++;
      continue;
    }

    try {
      const pi = await stripe.paymentIntents.create(
        {
          amount: amountCents,
          currency: 'usd',
          customer: member.stripe_customer_id,
          payment_method: member.payment_method_id,
          off_session: true,
          confirm: true,
          application_fee_amount: platformFeeCents > 0 ? platformFeeCents : undefined,
          description: `Annual membership fee - ${member.tier_name} (${billingYear})`,
        },
        { stripeAccount: stripeAccountId }
      );

      await query(
        `INSERT INTO annual_fee_billing_records
           (run_id, facility_id, user_id, tier_id, tier_name, amount_cents, billing_year,
            status, stripe_payment_intent_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'charged', $8)`,
        [runId, facilityId, member.user_id, member.tier_id, member.tier_name,
         amountCents, billingYear, pi.id]
      );
      chargedCount++;
    } catch (err: any) {
      // Charge failed — apply a lockout so the member must settle before using the app
      const message = err?.message ?? 'Stripe charge failed';
      await query(
        `UPDATE facility_memberships
            SET is_payment_locked = true,
                payment_locked_at = NOW(),
                lockout_amount_cents = $3,
                lockout_description = $4,
                updated_at = NOW()
          WHERE user_id = $1 AND facility_id = $2`,
        [
          member.user_id,
          facilityId,
          amountCents,
          `Annual membership fee - ${member.tier_name} (${billingYear})`,
        ]
      );
      await query(
        `INSERT INTO annual_fee_billing_records
           (run_id, facility_id, user_id, tier_id, tier_name, amount_cents, billing_year,
            status, error_message)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'lockout_applied', $8)`,
        [runId, facilityId, member.user_id, member.tier_id, member.tier_name,
         amountCents, billingYear, message]
      );
      lockoutCount++;
    }
  }

  // Close out the run record with totals
  await query(
    `UPDATE annual_fee_billing_runs
        SET charged_count = $2, lockout_count = $3, failed_count = $4, waived_count = $5,
            completed_at = NOW()
      WHERE id = $1`,
    [runId, chargedCount, lockoutCount, failedCount, waivedCount]
  );

  return { runId, billingYear, totalMembers: members.length, chargedCount, lockoutCount, failedCount, waivedCount };
}

// ---------------------------------------------------------------------------
// Billing history
// ---------------------------------------------------------------------------

export async function getBillingRuns(facilityId: string): Promise<{
  id: string;
  billingYear: number;
  totalMembers: number;
  chargedCount: number;
  lockoutCount: number;
  failedCount: number;
  startedAt: string;
  completedAt: string | null;
  triggeredByName: string | null;
}[]> {
  const result = await query(
    `SELECT
       r.id, r.billing_year, r.total_members, r.charged_count,
       r.lockout_count, r.failed_count, r.started_at, r.completed_at,
       u.full_name AS triggered_by_name
     FROM annual_fee_billing_runs r
     LEFT JOIN users u ON u.id = r.triggered_by
     WHERE r.facility_id = $1
     ORDER BY r.started_at DESC`,
    [facilityId]
  );
  return result.rows.map(row => ({
    id: row.id,
    billingYear: row.billing_year,
    totalMembers: row.total_members,
    chargedCount: row.charged_count,
    lockoutCount: row.lockout_count,
    failedCount: row.failed_count,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    triggeredByName: row.triggered_by_name,
  }));
}

export async function getBillingRunRecords(runId: string, facilityId: string): Promise<{
  id: string;
  userId: string;
  fullName: string;
  email: string;
  tierName: string | null;
  amountCents: number;
  status: string;
  stripePaymentIntentId: string | null;
  errorMessage: string | null;
  processedAt: string;
}[]> {
  const result = await query(
    `SELECT
       r.id, r.user_id, u.full_name, u.email,
       r.tier_name, r.amount_cents, r.status,
       r.stripe_payment_intent_id, r.error_message, r.processed_at
     FROM annual_fee_billing_records r
     JOIN users u ON u.id = r.user_id
     WHERE r.run_id = $1 AND r.facility_id = $2
     ORDER BY u.full_name`,
    [runId, facilityId]
  );
  return result.rows.map(row => ({
    id: row.id,
    userId: row.user_id,
    fullName: row.full_name,
    email: row.email,
    tierName: row.tier_name,
    amountCents: row.amount_cents,
    status: row.status,
    stripePaymentIntentId: row.stripe_payment_intent_id,
    errorMessage: row.error_message,
    processedAt: row.processed_at,
  }));
}
