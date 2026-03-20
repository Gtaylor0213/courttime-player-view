import Stripe from 'stripe';
import { query } from '../database/connection';
import type { PoolClient } from 'pg';

const STANDARD_AMOUNT_CENTS = 40406; // $404.06 ($375 + fees)

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
  trialMonths?: number;
  message?: string;
}> {
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

  // Calculate final amount
  let finalAmountCents = STANDARD_AMOUNT_CENTS;
  if (promo.discount_type === 'full') {
    finalAmountCents = 0;
  } else if (promo.discount_type === 'percent') {
    finalAmountCents = Math.round(STANDARD_AMOUNT_CENTS * (1 - promo.discount_value / 100));
  } else if (promo.discount_type === 'fixed') {
    finalAmountCents = Math.max(0, STANDARD_AMOUNT_CENTS - Math.round(promo.discount_value * 100));
  }

  // Build message based on trial months or discount
  let message: string;
  const trialMonths = promo.trial_months ? Number(promo.trial_months) : undefined;

  if (trialMonths) {
    message = `Promo code applied — ${trialMonths} month${trialMonths > 1 ? 's' : ''} free trial! Card required for annual renewal ($404.06/year).`;
  } else if (finalAmountCents === 0) {
    message = 'Promo code applied — first year free! Card required for annual renewal ($404.06/year).';
  } else {
    message = `Promo code applied — total: $${(finalAmountCents / 100).toFixed(2)}`;
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
 * Uses mode: 'subscription' with a pre-created Stripe Price (STRIPE_PRICE_ID env var).
 * Promo codes are mapped to Stripe trials or coupons.
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
  const stripe = getStripe();

  // Dev mode — no Stripe keys
  if (!stripe) {
    const devSessionId = `dev_session_${Date.now()}`;
    console.log(`[DEV MODE] Stripe not configured. Mock session: ${devSessionId}`);
    return {
      sessionId: devSessionId,
      sessionUrl: null as any,
      amountCents: params.amountCents,
      waived: params.amountCents <= 0,
    };
  }

  const priceId = process.env.STRIPE_PRICE_ID;
  if (!priceId) {
    return { amountCents: params.amountCents, waived: false, error: 'STRIPE_PRICE_ID not configured' };
  }

  try {
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: {
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
        // Standard full waiver — 1 year free trial, then $404.06/yr auto-renewal
        sessionParams.subscription_data = {
          trial_period_days: 365,
          metadata: {
            facilityName: params.facilityName,
            promoCode: params.promoCode,
          },
        };
      }
    } else if (params.promoCode && params.amountCents > 0 && params.amountCents < STANDARD_AMOUNT_CENTS) {
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

    // Payment mode (legacy)
    if (session.payment_status === 'paid') {
      return {
        verified: true,
        paymentStatus: session.payment_status,
        amountPaid: session.amount_total || STANDARD_AMOUNT_CENTS,
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
