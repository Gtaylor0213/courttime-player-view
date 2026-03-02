import Stripe from 'stripe';
import { query } from '../database/connection';
import type { PoolClient } from 'pg';

const STANDARD_AMOUNT_CENTS = 37500; // $375.00

/**
 * Get Stripe instance (returns null if no key configured — dev mode)
 */
function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key.startsWith('sk_test_xxxx')) return null;
  return new Stripe(key);
}

/**
 * Validate a promo code
 */
export async function validatePromoCode(code: string): Promise<{
  valid: boolean;
  promoCodeId?: string;
  discountType?: string;
  discountValue?: number;
  finalAmountCents?: number;
  message?: string;
}> {
  const result = await query(
    `SELECT id, code, discount_type, discount_value, max_uses, current_uses, is_active, valid_from, valid_until
     FROM promo_codes
     WHERE LOWER(TRIM(code)) = LOWER(TRIM($1))`,
    [code]
  );

  if (result.rows.length === 0) {
    return { valid: false, message: 'Invalid promo code' };
  }

  const promo = result.rows[0];

  if (!promo.is_active) {
    return { valid: false, message: 'This promo code is no longer active' };
  }

  const now = new Date();
  if (promo.valid_from && new Date(promo.valid_from) > now) {
    return { valid: false, message: 'This promo code is not yet valid' };
  }
  if (promo.valid_until && new Date(promo.valid_until) < now) {
    return { valid: false, message: 'This promo code has expired' };
  }
  if (promo.max_uses !== null && promo.current_uses >= promo.max_uses) {
    return { valid: false, message: 'This promo code has reached its usage limit' };
  }

  // Calculate final amount
  let finalAmountCents = STANDARD_AMOUNT_CENTS;
  if (promo.discount_type === 'full') {
    finalAmountCents = 0;
  } else if (promo.discount_type === 'percent') {
    finalAmountCents = Math.round(STANDARD_AMOUNT_CENTS * (1 - promo.discount_value / 100));
  } else if (promo.discount_type === 'fixed') {
    finalAmountCents = Math.max(0, STANDARD_AMOUNT_CENTS - Math.round(promo.discount_value * 100));
  }

  return {
    valid: true,
    promoCodeId: promo.id,
    discountType: promo.discount_type,
    discountValue: Number(promo.discount_value),
    finalAmountCents,
    message: finalAmountCents === 0
      ? 'Promo code applied — registration is free!'
      : `Promo code applied — total: $${(finalAmountCents / 100).toFixed(2)}`,
  };
}

/**
 * Create a Stripe Checkout Session for facility payment
 */
export async function createCheckoutSession(params: {
  facilityName: string;
  courtCount: number;
  amountCents: number;
  promoCode?: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<{
  sessionId?: string;
  sessionUrl?: string;
  amountCents: number;
  waived: boolean;
  error?: string;
}> {
  // If amount is $0, payment is waived
  if (params.amountCents <= 0) {
    return { amountCents: 0, waived: true };
  }

  const stripe = getStripe();

  // Dev mode — no Stripe keys
  if (!stripe) {
    const devSessionId = `dev_session_${Date.now()}`;
    console.log(`[DEV MODE] Stripe not configured. Mock session: ${devSessionId}`);
    return {
      sessionId: devSessionId,
      sessionUrl: null as any,
      amountCents: params.amountCents,
      waived: false,
    };
  }

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'usd',
          unit_amount: params.amountCents,
          product_data: {
            name: `CourtTime Facility Registration — Annual (${params.courtCount} court${params.courtCount !== 1 ? 's' : ''})`,
            description: `Annual subscription for ${params.facilityName}`,
          },
        },
        quantity: 1,
      }],
      metadata: {
        facilityName: params.facilityName,
        courtCount: String(params.courtCount),
        promoCode: params.promoCode || '',
      },
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
    });

    return {
      sessionId: session.id,
      sessionUrl: session.url || undefined,
      amountCents: params.amountCents,
      waived: false,
    };
  } catch (error: any) {
    console.error('Stripe checkout session error:', error);
    return { amountCents: params.amountCents, waived: false, error: error.message };
  }
}

/**
 * Verify a completed Stripe Checkout Session
 */
export async function verifyCheckoutSession(sessionId: string): Promise<{
  verified: boolean;
  paymentStatus?: string;
  amountPaid?: number;
  error?: string;
}> {
  // Dev mode sessions
  if (sessionId.startsWith('dev_session_')) {
    return { verified: true, paymentStatus: 'paid', amountPaid: STANDARD_AMOUNT_CENTS };
  }

  const stripe = getStripe();
  if (!stripe) {
    return { verified: true, paymentStatus: 'paid', amountPaid: STANDARD_AMOUNT_CENTS };
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status === 'paid') {
      return {
        verified: true,
        paymentStatus: session.payment_status,
        amountPaid: session.amount_total || STANDARD_AMOUNT_CENTS,
      };
    }
    return { verified: false, paymentStatus: session.payment_status, error: 'Payment not completed' };
  } catch (error: any) {
    console.error('Stripe session verification error:', error);
    return { verified: false, error: error.message };
  }
}

/**
 * Record payment in database (called inside registration transaction)
 */
export async function recordPayment(
  client: PoolClient,
  facilityId: string,
  params: {
    stripeSessionId?: string;
    amountCents: number;
    status: string;         // 'active', 'waived', 'custom_pending'
    promoCode?: string;
    courtCount: number;
    paymentMethodType: string; // 'card', 'promo_code', 'custom'
  }
): Promise<void> {
  // Determine plan type
  const planType = params.courtCount > 8 ? 'custom' : 'standard';

  // Calculate billing period (1 year from now)
  const now = new Date();
  const oneYearLater = new Date(now);
  oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);

  // Insert subscription
  const subResult = await client.query(
    `INSERT INTO facility_subscriptions (
       facility_id, stripe_checkout_session_id, plan_type, status,
       amount_cents, promo_code_used, court_count,
       billing_period_start, billing_period_end
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [
      facilityId,
      params.stripeSessionId || null,
      planType,
      params.status,
      params.amountCents,
      params.promoCode || null,
      params.courtCount,
      params.status === 'custom_pending' ? null : now,
      params.status === 'custom_pending' ? null : oneYearLater,
    ]
  );

  const subscriptionId = subResult.rows[0].id;

  // Insert payment history record
  await client.query(
    `INSERT INTO payment_history (
       facility_id, subscription_id, amount_cents, status,
       description, payment_method_type, promo_code_used
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      facilityId,
      subscriptionId,
      params.amountCents,
      params.status === 'custom_pending' ? 'pending' : 'succeeded',
      params.status === 'waived'
        ? `Registration fee waived (promo: ${params.promoCode})`
        : params.status === 'custom_pending'
          ? 'Custom pricing — pending arrangement'
          : 'Annual facility registration fee',
      params.paymentMethodType,
      params.promoCode || null,
    ]
  );

  // Update facility payment_status
  await client.query(
    `UPDATE facilities SET payment_status = $1 WHERE id = $2`,
    [params.status === 'active' ? 'paid' : params.status, facilityId]
  );

  // Increment promo code usage if one was used
  if (params.promoCode) {
    await client.query(
      `UPDATE promo_codes SET current_uses = current_uses + 1 WHERE LOWER(TRIM(code)) = LOWER(TRIM($1))`,
      [params.promoCode]
    );
  }
}

/**
 * Get subscription info for a facility
 */
export async function getSubscriptionByFacilityId(facilityId: string) {
  const result = await query(
    `SELECT id, facility_id as "facilityId", stripe_customer_id as "stripeCustomerId",
            stripe_checkout_session_id as "stripeCheckoutSessionId",
            plan_type as "planType", status, amount_cents as "amountCents",
            currency, promo_code_used as "promoCodeUsed", court_count as "courtCount",
            billing_period_start as "billingPeriodStart",
            billing_period_end as "billingPeriodEnd",
            created_at as "createdAt", updated_at as "updatedAt"
     FROM facility_subscriptions
     WHERE facility_id = $1`,
    [facilityId]
  );
  return result.rows[0] || null;
}

/**
 * Get payment history for a facility
 */
export async function getPaymentHistory(facilityId: string) {
  const result = await query(
    `SELECT id, facility_id as "facilityId", subscription_id as "subscriptionId",
            stripe_payment_intent_id as "stripePaymentIntentId",
            amount_cents as "amountCents", currency, status,
            description, payment_method_type as "paymentMethodType",
            promo_code_used as "promoCodeUsed",
            created_at as "createdAt"
     FROM payment_history
     WHERE facility_id = $1
     ORDER BY created_at DESC`,
    [facilityId]
  );
  return result.rows;
}
