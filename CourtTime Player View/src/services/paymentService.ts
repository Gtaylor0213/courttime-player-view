import Stripe from 'stripe';
import { query } from '../database/connection';
import type { PoolClient } from 'pg';
import {
  getAmountForCourts,
  formatAnnualPricePerYear,
  MAX_SUBSCRIPTION_CENTS,
} from './subscriptionPricing';

export { getAmountForCourts } from './subscriptionPricing';

/**
 * Get Stripe instance (returns null if no key configured — dev mode)
 */
function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key.startsWith('sk_test_xxxx')) return null;
  return new Stripe(key);
}

/** Resolve Stripe product ID for facility platform subscriptions. */
async function resolveSubscriptionProductId(stripe: Stripe): Promise<string | null> {
  const isPlaceholder = (value?: string) =>
    !value?.trim() || /x{4,}/i.test(value) || value.includes('xxxxxxxx');

  const fromEnv = process.env.STRIPE_SUBSCRIPTION_PRODUCT_ID;
  if (fromEnv && !isPlaceholder(fromEnv)) return fromEnv.trim();

  const priceId = process.env.STRIPE_PRICE_ID;
  if (priceId && !isPlaceholder(priceId)) {
    try {
      const price = await stripe.prices.retrieve(priceId.trim());
      const product = price.product;
      return typeof product === 'string' ? product : product.id;
    } catch (err: any) {
      console.error('Failed to resolve product from STRIPE_PRICE_ID:', err.message);
    }
  }
  return null;
}

/** Whether the facility must complete Stripe checkout for a recurring annual subscription. */
export function subscriptionNeedsPayment(sub: {
  status: string;
  amountCents: number;
  stripeSubscriptionId?: string | null;
}): boolean {
  if (sub.status === 'pending_payment') return true;
  if (sub.amountCents > 0 && !sub.stripeSubscriptionId) {
    return sub.status !== 'active' && sub.status !== 'trialing';
  }
  return false;
}

export type ValidatePromoOptions = {
  courtCount?: number;
  baseAmountCents?: number;
  context?: 'subscription' | 'court_add';
};

export type PromoValidationResult = {
  valid: boolean;
  promoCodeId?: string;
  discountType?: string;
  discountValue?: number;
  finalAmountCents?: number;
  trialMonths?: number;
  message?: string;
};

/**
 * Validate a promo code
 */
export async function validatePromoCode(
  code: string,
  options?: number | ValidatePromoOptions
): Promise<PromoValidationResult> {
  const opts: ValidatePromoOptions =
    typeof options === 'number' ? { courtCount: options } : (options ?? {});
  const result = await query(
    `SELECT id, code, discount_type, discount_value, max_uses, current_uses, is_active, valid_from, valid_until, trial_months
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

  // Calculate final amount based on per-court pricing or an explicit base amount
  const baseAmount =
    opts.baseAmountCents != null
      ? opts.baseAmountCents
      : opts.courtCount
        ? getAmountForCourts(opts.courtCount)
        : MAX_SUBSCRIPTION_CENTS;
  let finalAmountCents = baseAmount;
  if (promo.discount_type === 'full') {
    finalAmountCents = 0;
  } else if (promo.discount_type === 'percent') {
    finalAmountCents = Math.round(baseAmount * (1 - promo.discount_value / 100));
  } else if (promo.discount_type === 'fixed') {
    finalAmountCents = Math.max(0, baseAmount - Math.round(promo.discount_value * 100));
  }

  // Build message based on trial months or discount
  let message: string;
  const trialMonths = promo.trial_months ? Number(promo.trial_months) : undefined;
  const context = opts.context ?? 'subscription';

  if (context === 'court_add') {
    if (finalAmountCents === 0) {
      message = 'Promo code applied — court add fee waived!';
    } else {
      message = `Promo code applied — total: $${(finalAmountCents / 100).toFixed(2)}`;
    }
  } else {
    const renewalPrice = formatAnnualPricePerYear(baseAmount);
    if (trialMonths) {
      message = `Promo code applied — ${trialMonths} month${trialMonths > 1 ? 's' : ''} free trial! Card required for annual renewal (${renewalPrice}).`;
    } else if (finalAmountCents === 0) {
      message = `Promo code applied — first year free! Card required for annual renewal (${renewalPrice}).`;
    } else {
      message = `Promo code applied — total: $${(finalAmountCents / 100).toFixed(2)}`;
    }
  }

  return {
    valid: true,
    promoCodeId: promo.id,
    discountType: promo.discount_type,
    discountValue: Number(promo.discount_value),
    finalAmountCents,
    trialMonths,
    message,
  };
}

/**
 * Get or create a Stripe Coupon for a promo code discount.
 * - Internal promos (is_internal=true): 100% off forever coupon
 * - Percent discount: one-time percent-off coupon
 * - Fixed discount: one-time amount-off coupon
 */
async function getOrCreateCoupon(stripe: Stripe, promoCode: string): Promise<string | null> {
  // Look up promo details from DB
  const result = await query(
    `SELECT discount_type, discount_value, is_internal FROM promo_codes WHERE LOWER(TRIM(code)) = LOWER(TRIM($1))`,
    [promoCode]
  );
  if (result.rows.length === 0) return null;

  const promo = result.rows[0];
  const couponId = `promo_${promoCode.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;

  // Try to retrieve existing coupon first
  try {
    await stripe.coupons.retrieve(couponId);
    return couponId; // Already exists
  } catch {
    // Coupon doesn't exist, create it
  }

  if (promo.is_internal || promo.discount_type === 'full') {
    // Internal promo or full waiver — 100% off forever
    const duration = promo.is_internal ? 'forever' as const : 'once' as const;
    await stripe.coupons.create({
      id: couponId,
      percent_off: 100,
      duration,
      name: `Promo: ${promoCode}`,
    });
    return couponId;
  }

  if (promo.discount_type === 'percent') {
    await stripe.coupons.create({
      id: couponId,
      percent_off: Number(promo.discount_value),
      duration: 'once',
      name: `Promo: ${promoCode} (${promo.discount_value}% off)`,
    });
    return couponId;
  }

  if (promo.discount_type === 'fixed') {
    await stripe.coupons.create({
      id: couponId,
      amount_off: Math.round(Number(promo.discount_value) * 100),
      currency: 'usd',
      duration: 'once',
      name: `Promo: ${promoCode} ($${promo.discount_value} off)`,
    });
    return couponId;
  }

  return null;
}

/**
 * Create a Stripe Checkout Session for facility subscription.
 * Uses mode: 'subscription' with dynamic annual price_data (per-court pricing).
 * Promo codes are mapped to Stripe trials or coupons.
 */
export async function createCheckoutSession(params: {
  facilityName: string;
  courtCount: number;
  amountCents: number;
  promoCode?: string;
  successUrl: string;
  cancelUrl: string;
  facilityId?: string;
  customerId?: string;
}): Promise<{
  sessionId?: string;
  sessionUrl?: string;
  amountCents: number;
  waived: boolean;
  error?: string;
}> {
  const stripe = getStripe();

  // Dev mode — no Stripe keys
  if (!stripe) {
    const devSessionId = `dev_session_${Date.now()}`;
    return {
      sessionId: devSessionId,
      sessionUrl: null as any,
      amountCents: params.amountCents,
      waived: params.amountCents <= 0,
    };
  }

  const productId = await resolveSubscriptionProductId(stripe);
  if (!productId) {
    return {
      amountCents: params.amountCents,
      waived: false,
      error: 'Stripe subscription product is not configured (STRIPE_SUBSCRIPTION_PRODUCT_ID or STRIPE_PRICE_ID)',
    };
  }

  const listPriceCents = getAmountForCourts(params.courtCount);

  try {
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      payment_method_types: ['card'],
      mode: 'subscription',
      customer: params.customerId || undefined,
      line_items: [{
        price_data: {
          currency: 'usd',
          product: productId,
          unit_amount: params.amountCents > 0 ? params.amountCents : listPriceCents,
          recurring: { interval: 'year' },
        },
        quantity: 1,
      }],
      metadata: {
        facilityId: params.facilityId || '',
        facilityName: params.facilityName,
        courtCount: String(params.courtCount),
        promoCode: params.promoCode || '',
      },
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
    };

    // Handle promo codes
    if (params.promoCode && params.amountCents <= 0) {
      // Look up promo details
      const promoResult = await query(
        `SELECT is_internal, trial_months FROM promo_codes WHERE LOWER(TRIM(code)) = LOWER(TRIM($1))`,
        [params.promoCode]
      );
      const isInternal = promoResult.rows[0]?.is_internal;
      const trialMonths = promoResult.rows[0]?.trial_months ? Number(promoResult.rows[0].trial_months) : null;

      if (isInternal) {
        // Internal promo — use 100%-off forever coupon
        const couponId = await getOrCreateCoupon(stripe, params.promoCode);
        if (couponId) {
          sessionParams.discounts = [{ coupon: couponId }];
        }
      } else if (trialMonths) {
        // Monthly trial promo — convert months to days (approximate: 30 days per month)
        sessionParams.subscription_data = {
          trial_period_days: trialMonths * 30,
          metadata: {
            facilityName: params.facilityName,
            promoCode: params.promoCode,
            trialMonths: String(trialMonths),
          },
        };
      } else {
        // Standard full waiver — 1 year free trial, then annual renewal at list price
        sessionParams.subscription_data = {
          trial_period_days: 365,
          metadata: {
            facilityName: params.facilityName,
            promoCode: params.promoCode,
          },
        };
      }
    } else if (params.promoCode && params.amountCents > 0 && params.amountCents < listPriceCents) {
      // Partial discount — create one-time coupon
      const couponId = await getOrCreateCoupon(stripe, params.promoCode);
      if (couponId) {
        sessionParams.discounts = [{ coupon: couponId }];
      }
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    return {
      sessionId: session.id,
      sessionUrl: session.url || undefined,
      amountCents: params.amountCents,
      waived: params.amountCents <= 0,
    };
  } catch (error: any) {
    console.error('Stripe checkout session error:', error);
    return { amountCents: params.amountCents, waived: false, error: error.message };
  }
}

/**
 * Create (or refresh) Stripe Checkout for an existing facility that still needs to pay.
 * Links the session ID on facility_subscriptions for webhook matching.
 */
export async function createFacilitySubscriptionCheckout(
  facilityId: string,
  returnUrl: string
): Promise<{
  sessionId?: string;
  sessionUrl?: string;
  amountCents?: number;
  error?: string;
}> {
  const sub = await getSubscriptionByFacilityId(facilityId);
  if (!sub) {
    return { error: 'No subscription found for this facility' };
  }

  if (!subscriptionNeedsPayment(sub)) {
    return { error: 'This facility does not require payment at this time' };
  }

  const facResult = await query(`SELECT name FROM facilities WHERE id = $1`, [facilityId]);
  const facilityName = facResult.rows[0]?.name || facilityId;
  const courtCount = Number(sub.courtCount) || 1;
  const amountCents = sub.amountCents > 0 ? sub.amountCents : getAmountForCourts(courtCount);

  if (amountCents <= 0) {
    return { error: 'No payment amount configured for this facility' };
  }

  const joiner = returnUrl.includes('?') ? '&' : '?';
  const successUrl = `${returnUrl}${joiner}payment=success&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${returnUrl}${joiner}payment=cancelled`;

  const result = await createCheckoutSession({
    facilityName,
    courtCount,
    amountCents,
    successUrl,
    cancelUrl,
    facilityId,
    customerId: sub.stripeCustomerId || undefined,
  });

  if (result.error) {
    return { error: result.error };
  }

  if (result.sessionId) {
    await query(
      `UPDATE facility_subscriptions
       SET stripe_checkout_session_id = $2,
           status = 'pending_payment',
           amount_cents = $3,
           court_count = $4,
           updated_at = CURRENT_TIMESTAMP
       WHERE facility_id = $1`,
      [facilityId, result.sessionId, amountCents, courtCount]
    );
    await query(
      `UPDATE facilities SET payment_status = 'pending' WHERE id = $1`,
      [facilityId]
    );
  }

  return {
    sessionId: result.sessionId,
    sessionUrl: result.sessionUrl,
    amountCents: result.amountCents,
  };
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
    return { verified: true, paymentStatus: 'paid', amountPaid: 0 };
  }

  const stripe = getStripe();
  if (!stripe) {
    return { verified: true, paymentStatus: 'paid', amountPaid: 0 };
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    // Subscription mode — checkout complete when subscription is created
    if (session.mode === 'subscription' && session.status === 'complete') {
      return {
        verified: true,
        paymentStatus: session.payment_status === 'paid' ? 'paid' : 'subscription_active',
        amountPaid: session.amount_total || 0,
      };
    }

    // Setup mode (legacy — promo code card collection)
    if (session.mode === 'setup' && session.status === 'complete') {
      return {
        verified: true,
        paymentStatus: 'setup_complete',
        amountPaid: 0,
      };
    }

    // One-time payment mode (court add fees, legacy payments)
    if (session.mode === 'payment' && session.status === 'complete' && session.payment_status === 'paid') {
      return {
        verified: true,
        paymentStatus: session.payment_status,
        amountPaid: session.amount_total || 0,
      };
    }

    // Payment mode fallback
    if (session.payment_status === 'paid') {
      return {
        verified: true,
        paymentStatus: session.payment_status,
        amountPaid: session.amount_total || 0,
      };
    }

    return { verified: false, paymentStatus: session.payment_status || session.status, error: 'Payment not completed' };
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
  const planType = 'standard';

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
      now,
      oneYearLater,
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
      'succeeded',
      params.status === 'waived'
        ? `Registration fee waived (promo: ${params.promoCode})`
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

  if (params.promoCode) {
    await incrementPromoCodeUsage(params.promoCode, client);
  }
}

/** Increment promo code usage count */
export async function incrementPromoCodeUsage(
  code: string,
  client?: PoolClient
): Promise<void> {
  const sql = `UPDATE promo_codes SET current_uses = current_uses + 1 WHERE LOWER(TRIM(code)) = LOWER(TRIM($1))`;
  if (client) {
    await client.query(sql, [code]);
  } else {
    await query(sql, [code]);
  }
}

/**
 * Create a Stripe Customer Portal session so the facility admin can manage billing
 */
export async function createPortalSession(facilityId: string, returnUrl: string): Promise<{
  url?: string;
  error?: string;
}> {
  const stripe = getStripe();
  if (!stripe) {
    return { error: 'Stripe is not configured' };
  }

  const sub = await getSubscriptionByFacilityId(facilityId);
  if (!sub) {
    return { error: 'No subscription found' };
  }

  let customerId = sub.stripeCustomerId;

  // If no customer ID stored, retrieve it from the checkout session
  if (!customerId && sub.stripeCheckoutSessionId) {
    try {
      const session = await stripe.checkout.sessions.retrieve(sub.stripeCheckoutSessionId);
      customerId = session.customer as string;
      if (customerId) {
        await query(
          'UPDATE facility_subscriptions SET stripe_customer_id = $1 WHERE facility_id = $2',
          [customerId, facilityId]
        );
      }
    } catch (err: any) {
      console.error('Failed to retrieve checkout session:', err.message);
    }
  }

  if (!customerId) {
    return { error: 'No Stripe customer found for this facility' };
  }

  try {
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
    return { url: portalSession.url };
  } catch (err: any) {
    console.error('Stripe portal session error:', err);
    return { error: err.message };
  }
}

/**
 * Get subscription info for a facility
 */
export async function getSubscriptionByFacilityId(facilityId: string) {
  const result = await query(
    `SELECT id, facility_id as "facilityId", stripe_customer_id as "stripeCustomerId",
            stripe_checkout_session_id as "stripeCheckoutSessionId",
            stripe_subscription_id as "stripeSubscriptionId",
            stripe_price_id as "stripePriceId",
            plan_type as "planType", status, amount_cents as "amountCents",
            currency, promo_code_used as "promoCodeUsed", court_count as "courtCount",
            cancel_at_period_end as "cancelAtPeriodEnd",
            billing_period_start as "billingPeriodStart",
            billing_period_end as "billingPeriodEnd",
            current_period_start as "currentPeriodStart",
            current_period_end as "currentPeriodEnd",
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

/**
 * Cancel a facility's Stripe subscription at the end of the current billing period.
 * Does NOT immediately terminate — facility stays active until period end.
 */
/**
 * Create a one-time Stripe Checkout Session for adding courts post-registration.
 */
export async function createCourtAddCheckoutSession(params: {
  facilityId: string;
  pendingId: string;
  amountCents: number;
  returnUrl: string;
}): Promise<{
  sessionId?: string;
  sessionUrl?: string;
  error?: string;
}> {
  const stripe = getStripe();

  if (!stripe) {
    const devSessionId = `dev_session_${Date.now()}`;
    return { sessionId: devSessionId, sessionUrl: undefined };
  }

  const facResult = await query(`SELECT name FROM facilities WHERE id = $1`, [params.facilityId]);
  const facilityName = facResult.rows[0]?.name || params.facilityId;
  const sub = await getSubscriptionByFacilityId(params.facilityId);

  const joiner = params.returnUrl.includes('?') ? '&' : '?';
  const successUrl = `${params.returnUrl}${joiner}court_payment=success&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${params.returnUrl}${joiner}court_payment=cancelled`;

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer: sub?.stripeCustomerId || undefined,
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Additional Court Fee',
            description: `CourtTime platform fee — ${facilityName}`,
          },
          unit_amount: params.amountCents,
        },
        quantity: 1,
      }],
      metadata: {
        type: 'court_add',
        facilityId: params.facilityId,
        pendingId: params.pendingId,
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    return {
      sessionId: session.id,
      sessionUrl: session.url || undefined,
    };
  } catch (error: any) {
    console.error('Court add checkout session error:', error);
    return { error: error.message };
  }
}

export async function cancelSubscription(facilityId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  const stripe = getStripe();
  if (!stripe) {
    return { success: false, error: 'Stripe is not configured' };
  }

  const sub = await getSubscriptionByFacilityId(facilityId);
  if (!sub) {
    return { success: false, error: 'No subscription found' };
  }

  if (!sub.stripeSubscriptionId) {
    return { success: false, error: 'No Stripe subscription linked to this facility' };
  }

  try {
    await stripe.subscriptions.update(sub.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });

    // Update local DB
    await query(
      `UPDATE facility_subscriptions SET cancel_at_period_end = true, updated_at = CURRENT_TIMESTAMP WHERE facility_id = $1`,
      [facilityId]
    );

    return { success: true };
  } catch (error: any) {
    console.error('Cancel subscription error:', error);
    return { success: false, error: error.message };
  }
}
