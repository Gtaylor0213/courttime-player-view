/**
 * Court add payment gate — one-time $50/court unless facility is at subscription cap.
 */

import { query, transaction } from '../database/connection';
import type { PoolClient } from 'pg';
import {
  courtAddPaymentCents,
  isAtSubscriptionCap,
} from './subscriptionPricing';
import {
  createCourtAddCheckoutSession,
  getSubscriptionByFacilityId,
  subscriptionNeedsPayment,
  verifyCheckoutSession,
} from './paymentService';
import {
  createCourt,
  createCourtsBulk,
  createSplitCourt,
  type CourtCreateData,
} from './courtService';

export type SingleCourtAddPayload = {
  type: 'single';
  court: {
    name: string;
    courtNumber: number;
    surfaceType: string;
    courtType: string;
    isIndoor: boolean;
    hasLights: boolean;
    isWalkUp?: boolean;
    requirePayment?: boolean;
    bookingAmountCents?: number | null;
    guestFeeCents?: number | null;
  };
  split?: {
    canSplit: boolean;
    splitNames: string[];
    splitType: 'Tennis' | 'Pickleball' | 'Dual';
  };
};

export type BulkCourtAddPayload = {
  type: 'bulk';
  bulk: {
    count: number;
    startingNumber: number;
    surfaceType: string;
    courtType: string;
    isIndoor: boolean;
    hasLights: boolean;
    isWalkUp?: boolean;
  };
};

export type CourtAddPayload = SingleCourtAddPayload | BulkCourtAddPayload;

export async function getActiveCourtCount(facilityId: string): Promise<number> {
  const result = await query(
    `SELECT COUNT(*)::int AS count
     FROM courts
     WHERE facility_id = $1 AND status != 'closed'`,
    [facilityId]
  );
  return result.rows[0]?.count ?? 0;
}

export async function evaluateCourtAddPayment(
  facilityId: string,
  courtsToAdd: number
): Promise<{
  paymentRequired: boolean;
  amountCents: number;
  activeCourtCount: number;
  atCap: boolean;
  blockReason?: string;
}> {
  const sub = await getSubscriptionByFacilityId(facilityId);
  if (!sub) {
    return {
      paymentRequired: false,
      amountCents: 0,
      activeCourtCount: 0,
      atCap: false,
      blockReason: 'No subscription found for this facility',
    };
  }

  if (subscriptionNeedsPayment(sub)) {
    return {
      paymentRequired: false,
      amountCents: 0,
      activeCourtCount: 0,
      atCap: false,
      blockReason: 'Complete your annual subscription payment before adding courts',
    };
  }

  const activeCourtCount = await getActiveCourtCount(facilityId);
  const amountCents = Number(sub.amountCents) || 0;
  const atCap = isAtSubscriptionCap(activeCourtCount, amountCents);
  const paymentAmount = courtAddPaymentCents(courtsToAdd, activeCourtCount, amountCents);

  return {
    paymentRequired: paymentAmount > 0,
    amountCents: paymentAmount,
    activeCourtCount,
    atCap,
  };
}

export async function insertPendingCourtAddition(
  facilityId: string,
  payload: CourtAddPayload,
  amountCents: number,
  stripeCheckoutSessionId?: string | null
): Promise<string> {
  const result = await query(
    `INSERT INTO pending_court_additions
       (facility_id, payload, amount_cents, stripe_checkout_session_id, status)
     VALUES ($1, $2, $3, $4, 'PENDING')
     RETURNING id`,
    [facilityId, JSON.stringify(payload), amountCents, stripeCheckoutSessionId || null]
  );
  return result.rows[0].id;
}

export async function initiateCourtAddPayment(
  facilityId: string,
  payload: CourtAddPayload,
  returnUrl: string
): Promise<{
  requiresPayment: boolean;
  checkoutUrl?: string;
  sessionId?: string;
  pendingId?: string;
  courts?: unknown[];
  error?: string;
}> {
  const courtsToAdd = payload.type === 'bulk' ? payload.bulk.count : 1;
  const evaluation = await evaluateCourtAddPayment(facilityId, courtsToAdd);

  if (evaluation.blockReason) {
    return { requiresPayment: false, error: evaluation.blockReason };
  }

  if (!evaluation.paymentRequired) {
    const courts = await executeCourtAddPayload(facilityId, payload);
    await query(
      `UPDATE facility_subscriptions
       SET court_count = COALESCE(court_count, 0) + $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE facility_id = $1`,
      [facilityId, courtsToAdd]
    );
    return { requiresPayment: false, courts };
  }

  const pendingId = await insertPendingCourtAddition(facilityId, payload, evaluation.amountCents);
  const checkout = await createCourtAddCheckoutSession({
    facilityId,
    pendingId,
    amountCents: evaluation.amountCents,
    returnUrl,
  });

  if (checkout.error) {
    await query(
      `UPDATE pending_court_additions SET status = 'EXPIRED' WHERE id = $1`,
      [pendingId]
    );
    return { requiresPayment: true, error: checkout.error };
  }

  if (checkout.sessionId) {
    await query(
      `UPDATE pending_court_additions
       SET stripe_checkout_session_id = $2
       WHERE id = $1`,
      [pendingId, checkout.sessionId]
    );
  }

  return {
    requiresPayment: true,
    checkoutUrl: checkout.sessionUrl,
    sessionId: checkout.sessionId,
    pendingId,
  };
}

async function executeCourtAddPayload(
  facilityId: string,
  payload: CourtAddPayload
): Promise<unknown[]> {
  if (payload.type === 'bulk') {
    const { bulk } = payload;
    return createCourtsBulk(
      {
        facilityId,
        surfaceType: bulk.surfaceType as CourtCreateData['surfaceType'],
        courtType: bulk.courtType as CourtCreateData['courtType'],
        isIndoor: bulk.isIndoor,
        hasLights: bulk.hasLights,
        isWalkUp: bulk.isWalkUp || false,
      },
      bulk.count,
      bulk.startingNumber
    );
  }

  const { court, split } = payload;
  const created = await createCourt({
    facilityId,
    name: court.name,
    courtNumber: court.courtNumber,
    surfaceType: court.surfaceType as CourtCreateData['surfaceType'],
    courtType: court.courtType as CourtCreateData['courtType'],
    isIndoor: court.isIndoor,
    hasLights: court.hasLights,
    isWalkUp: court.isWalkUp || false,
    requirePayment: court.requirePayment || false,
    bookingAmountCents: court.requirePayment ? court.bookingAmountCents ?? null : null,
    guestFeeCents: court.guestFeeCents ?? null,
  });

  if (split?.canSplit && split.splitNames.length > 0) {
    await createSplitCourt(created.id, {
      splitNames: split.splitNames,
      splitType: split.splitType,
      surfaceType: court.surfaceType as CourtCreateData['surfaceType'],
    });
  }

  return [created];
}

async function incrementSubscriptionCourtCount(
  client: PoolClient,
  facilityId: string,
  courtsAdded: number
): Promise<void> {
  await client.query(
    `UPDATE facility_subscriptions
     SET court_count = COALESCE(court_count, 0) + $2,
         updated_at = CURRENT_TIMESTAMP
     WHERE facility_id = $1`,
    [facilityId, courtsAdded]
  );
}

async function recordCourtAddPaymentHistory(
  client: PoolClient,
  facilityId: string,
  amountCents: number,
  courtsAdded: number,
  stripeSessionId?: string | null
): Promise<void> {
  const subResult = await client.query(
    `SELECT id FROM facility_subscriptions WHERE facility_id = $1`,
    [facilityId]
  );
  const subscriptionId = subResult.rows[0]?.id ?? null;

  await client.query(
    `INSERT INTO payment_history (
       facility_id, subscription_id, stripe_payment_intent_id,
       amount_cents, status, description, payment_method_type
     ) VALUES ($1, $2, $3, $4, 'succeeded', $5, 'card')`,
    [
      facilityId,
      subscriptionId,
      stripeSessionId || null,
      amountCents,
      `Additional court fee (${courtsAdded} court${courtsAdded !== 1 ? 's' : ''})`,
    ]
  );
}

export async function finalizeCourtAddPayment(sessionId: string): Promise<{
  success: boolean;
  courts?: unknown[];
  error?: string;
  alreadyFinalized?: boolean;
}> {
  const pendingResult = await query(
    `SELECT id, facility_id, payload, amount_cents, status
     FROM pending_court_additions
     WHERE stripe_checkout_session_id = $1`,
    [sessionId]
  );

  if (pendingResult.rows.length === 0) {
    return { success: false, error: 'Pending court addition not found for this session' };
  }

  const pending = pendingResult.rows[0];
  if (pending.status === 'PAID') {
    return { success: true, alreadyFinalized: true };
  }

  const verification = await verifyCheckoutSession(sessionId);
  if (!verification.verified) {
    return { success: false, error: verification.error || 'Payment not completed' };
  }

  const payload = pending.payload as CourtAddPayload;
  const courtsToAdd = payload.type === 'bulk' ? payload.bulk.count : 1;

  return transaction(async (client) => {
    const lockResult = await client.query(
      `SELECT id, facility_id, payload, amount_cents, status
       FROM pending_court_additions
       WHERE id = $1
       FOR UPDATE`,
      [pending.id]
    );
    const row = lockResult.rows[0];
    if (!row) {
      return { success: false, error: 'Pending court addition not found' };
    }
    if (row.status === 'PAID') {
      return { success: true, alreadyFinalized: true };
    }

    const courts = await executeCourtAddPayload(row.facility_id, row.payload as CourtAddPayload);

    await client.query(
      `UPDATE pending_court_additions
       SET status = 'PAID', finalized_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [row.id]
    );

    await incrementSubscriptionCourtCount(client, row.facility_id, courtsToAdd);
    await recordCourtAddPaymentHistory(
      client,
      row.facility_id,
      Number(row.amount_cents) || 0,
      courtsToAdd,
      sessionId
    );

    return { success: true, courts };
  });
}
