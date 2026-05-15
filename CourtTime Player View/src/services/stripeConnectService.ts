/**
 * Stripe Connect Service
 *
 * Member → Club (facility) payments via Stripe Connect Express (direct charges).
 *
 * Built ALONGSIDE the existing platform-subscription Stripe integration in
 * paymentService.ts — none of that code is touched here. We re-read the same
 * STRIPE_SECRET_KEY (already in .env) and use a SEPARATE webhook secret
 * (STRIPE_WEBHOOK_SECRET_CONNECT) so the two webhook endpoints can be
 * registered independently on the Stripe side.
 */

import Stripe from 'stripe';
import { query } from '../database/connection';

export type PaymentCategory = 'BALL_MACHINE' | 'CLINIC' | 'DRILL' | 'DUES' | 'OTHER';
export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';

export interface PaymentItem {
  id: string;
  clubId: string;
  name: string;
  description: string | null;
  amountCents: number;
  category: PaymentCategory;
  isRecurring: boolean;
  recurringInterval: 'month' | 'year' | null;
  stripePriceId: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface ConnectPayment {
  id: string;
  clubId: string;
  memberId: string;
  paymentItemId: string | null;
  bulletinPostId?: string | null;
  amountCents: number;
  platformFeeCents: number;
  status: PaymentStatus;
  stripePaymentIntentId: string | null;
  stripeCheckoutSessionId: string | null;
  paidAt: string | null;
  createdAt: string;
  itemName?: string;
  itemCategory?: PaymentCategory;
  memberName?: string;
  memberEmail?: string;
}

/**
 * Lazily-instantiated Stripe client. Returns null in local/dev environments
 * where the secret key has not been configured yet.
 */
export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key.startsWith('sk_test_xxxx')) return null;
  return new Stripe(key);
}

function rowToPaymentItem(row: any): PaymentItem {
  return {
    id: row.id,
    clubId: row.club_id,
    name: row.name,
    description: row.description,
    amountCents: Number(row.amount_cents),
    category: row.category,
    isRecurring: row.is_recurring,
    recurringInterval: row.recurring_interval,
    stripePriceId: row.stripe_price_id,
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}

function rowToConnectPayment(row: any): ConnectPayment {
  return {
    id: row.id,
    clubId: row.club_id,
    memberId: row.member_id,
    paymentItemId: row.payment_item_id ?? null,
    bulletinPostId: row.bulletin_post_id ?? null,
    amountCents: Number(row.amount_cents),
    platformFeeCents: Number(row.platform_fee_cents),
    status: row.status,
    stripePaymentIntentId: row.stripe_payment_intent_id,
    stripeCheckoutSessionId: row.stripe_checkout_session_id,
    paidAt: row.paid_at,
    createdAt: row.created_at,
    itemName: row.item_name,
    itemCategory: row.item_category,
    memberName: row.member_name,
    memberEmail: row.member_email,
  };
}

// ---------------------------------------------------------------------------
// Connect onboarding
// ---------------------------------------------------------------------------

/**
 * Stripe rejects empty strings and many non-RFC placeholders as "invalid email".
 * Only pass an email to accounts.create when it looks usable; otherwise omit
 * so Stripe collects it during Express onboarding.
 */
function pickStripeConnectAccountEmail(
  ...candidates: Array<string | null | undefined>
): string | undefined {
  const basic = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  for (const raw of candidates) {
    if (raw == null) continue;
    const s = String(raw).trim();
    if (!s) continue;
    const lower = s.toLowerCase();
    if (['n/a', 'na', 'none', 'no email', 'noemail', 'tbd'].includes(lower)) continue;
    if (basic.test(s)) return s;
  }
  return undefined;
}

/**
 * Create (or reuse) a Stripe Express account for a club and return an
 * AccountLink the admin can visit to complete onboarding.
 */
export async function createConnectOnboardingLink(params: {
  clubId: string;
  clubName: string;
  clubEmail?: string | null;
  /** Used when the facility row has no valid email (common cause of Stripe "invalid email"). */
  adminEmail?: string | null;
  returnUrl: string;
  refreshUrl: string;
}): Promise<{ url: string; accountId: string }> {
  const stripe = getStripe();
  if (!stripe) {
    throw new Error('Stripe is not configured on this server');
  }

  const facilityResult = await query(
    'SELECT id, name, email, stripe_account_id FROM facilities WHERE id = $1',
    [params.clubId]
  );
  if (facilityResult.rows.length === 0) {
    throw new Error('Club not found');
  }
  const facility = facilityResult.rows[0];

  let accountId: string = facility.stripe_account_id;

  const accountEmail = pickStripeConnectAccountEmail(
    params.clubEmail,
    facility.email,
    params.adminEmail
  );

  if (!accountId) {
    const createParams: Stripe.AccountCreateParams = {
      type: 'express',
      business_profile: {
        name: params.clubName ?? facility.name,
      },
      capabilities: {
        transfers: { requested: true },
        card_payments: { requested: true },
      },
      metadata: { clubId: params.clubId },
    };
    if (accountEmail) {
      createParams.email = accountEmail;
    }

    const account = await stripe.accounts.create(createParams);
    accountId = account.id;

    await query(
      'UPDATE facilities SET stripe_account_id = $1 WHERE id = $2',
      [accountId, params.clubId]
    );
  } else if (accountEmail) {
    try {
      await stripe.accounts.update(accountId, { email: accountEmail });
    } catch (err: any) {
      console.warn('[STRIPE-CONNECT] could not update connected account email:', err?.message || err);
    }
  }

  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: params.refreshUrl,
    return_url: params.returnUrl,
    type: 'account_onboarding',
  });

  return { url: accountLink.url, accountId };
}

/**
 * Reads the connected account from Stripe to decide whether onboarding is
 * complete (charges_enabled + details_submitted), and persists the result.
 */
export async function syncConnectOnboardingStatus(clubId: string): Promise<{
  onboarded: boolean;
  accountId: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
}> {
  const stripe = getStripe();
  const facilityResult = await query(
    'SELECT stripe_account_id FROM facilities WHERE id = $1',
    [clubId]
  );
  if (facilityResult.rows.length === 0) {
    throw new Error('Club not found');
  }
  const accountId: string | null = facilityResult.rows[0].stripe_account_id ?? null;
  if (!accountId || !stripe) {
    return { onboarded: false, accountId, chargesEnabled: false, payoutsEnabled: false };
  }

  const account = await stripe.accounts.retrieve(accountId);
  const onboarded = Boolean(account.charges_enabled && account.details_submitted);

  await query(
    'UPDATE facilities SET stripe_onboarded = $1 WHERE id = $2',
    [onboarded, clubId]
  );

  return {
    onboarded,
    accountId,
    chargesEnabled: Boolean(account.charges_enabled),
    payoutsEnabled: Boolean(account.payouts_enabled),
  };
}

// ---------------------------------------------------------------------------
// Payment item CRUD
// ---------------------------------------------------------------------------

export async function createPaymentItem(params: {
  clubId: string;
  name: string;
  description?: string | null;
  amountCents: number;
  category: PaymentCategory;
  isRecurring?: boolean;
  recurringInterval?: 'month' | 'year' | null;
}): Promise<PaymentItem> {
  if (!Number.isInteger(params.amountCents) || params.amountCents <= 0) {
    throw new Error('amountCents must be a positive integer');
  }
  if (params.isRecurring && !params.recurringInterval) {
    throw new Error('Recurring items require a recurring interval');
  }

  const result = await query(
    `INSERT INTO payment_items
       (club_id, name, description, amount_cents, category, is_recurring, recurring_interval)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      params.clubId,
      params.name,
      params.description ?? null,
      params.amountCents,
      params.category,
      Boolean(params.isRecurring),
      params.isRecurring ? params.recurringInterval ?? null : null,
    ]
  );
  return rowToPaymentItem(result.rows[0]);
}

export async function updatePaymentItem(
  id: string,
  clubId: string,
  updates: Partial<{
    name: string;
    description: string | null;
    amountCents: number;
    category: PaymentCategory;
    isRecurring: boolean;
    recurringInterval: 'month' | 'year' | null;
    isActive: boolean;
  }>
): Promise<PaymentItem | null> {
  const fields: string[] = [];
  const values: any[] = [];
  let idx = 1;

  const set = (column: string, value: any) => {
    fields.push(`${column} = $${idx++}`);
    values.push(value);
  };

  if (updates.name !== undefined) set('name', updates.name);
  if (updates.description !== undefined) set('description', updates.description);
  if (updates.amountCents !== undefined) {
    if (!Number.isInteger(updates.amountCents) || updates.amountCents <= 0) {
      throw new Error('amountCents must be a positive integer');
    }
    set('amount_cents', updates.amountCents);
  }
  if (updates.category !== undefined) set('category', updates.category);
  if (updates.isRecurring !== undefined) set('is_recurring', updates.isRecurring);
  if (updates.recurringInterval !== undefined) set('recurring_interval', updates.recurringInterval);
  if (updates.isActive !== undefined) set('is_active', updates.isActive);

  if (fields.length === 0) {
    const existing = await query(
      'SELECT * FROM payment_items WHERE id = $1 AND club_id = $2',
      [id, clubId]
    );
    return existing.rows[0] ? rowToPaymentItem(existing.rows[0]) : null;
  }

  values.push(id, clubId);
  const result = await query(
    `UPDATE payment_items
       SET ${fields.join(', ')}
     WHERE id = $${idx++} AND club_id = $${idx}
     RETURNING *`,
    values
  );
  return result.rows[0] ? rowToPaymentItem(result.rows[0]) : null;
}

export async function getActivePaymentItemsForClub(clubId: string): Promise<PaymentItem[]> {
  const result = await query(
    `SELECT * FROM payment_items
       WHERE club_id = $1 AND is_active = true
       ORDER BY category, name`,
    [clubId]
  );
  return result.rows.map(rowToPaymentItem);
}

export async function getAllPaymentItemsForClub(clubId: string): Promise<PaymentItem[]> {
  const result = await query(
    `SELECT * FROM payment_items
       WHERE club_id = $1
       ORDER BY is_active DESC, category, name`,
    [clubId]
  );
  return result.rows.map(rowToPaymentItem);
}

export async function getPaymentItem(id: string): Promise<PaymentItem | null> {
  const result = await query('SELECT * FROM payment_items WHERE id = $1', [id]);
  return result.rows[0] ? rowToPaymentItem(result.rows[0]) : null;
}

// ---------------------------------------------------------------------------
// Checkout (direct charges on the connected account)
// ---------------------------------------------------------------------------

export interface CheckoutResult {
  url: string;
  paymentId: string;
}

export async function createMemberCheckoutSession(params: {
  paymentItemId: string;
  memberId: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<CheckoutResult> {
  const stripe = getStripe();
  if (!stripe) {
    throw new Error('Stripe is not configured on this server');
  }

  const item = await getPaymentItem(params.paymentItemId);
  if (!item) throw new Error('Payment item not found');
  if (!item.isActive) throw new Error('Payment item is not active');

  const clubResult = await query(
    `SELECT id, name, stripe_account_id, stripe_onboarded, platform_fee_percent
       FROM facilities WHERE id = $1`,
    [item.clubId]
  );
  if (clubResult.rows.length === 0) throw new Error('Club not found');
  const club = clubResult.rows[0];

  if (!club.stripe_account_id || !club.stripe_onboarded) {
    throw new Error('This club has not finished Stripe Connect onboarding yet');
  }

  const platformFeePercent = Number(club.platform_fee_percent ?? 0);
  const platformFeeCents = Math.max(
    0,
    Math.round((item.amountCents * platformFeePercent) / 100)
  );

  // Insert a PENDING payment row up front so we have a stable ID to put in
  // the session metadata; the webhook will flip it to PAID.
  const insertResult = await query(
    `INSERT INTO connect_payments
       (club_id, member_id, payment_item_id, amount_cents, platform_fee_cents, status)
     VALUES ($1, $2, $3, $4, $5, 'PENDING')
     RETURNING id`,
    [item.clubId, params.memberId, item.id, item.amountCents, platformFeeCents]
  );
  const paymentId: string = insertResult.rows[0].id;

  const session = await stripe.checkout.sessions.create(
    {
      mode: item.isRecurring ? 'subscription' : 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: item.amountCents,
            product_data: {
              name: item.name,
              description: item.description ?? undefined,
            },
            ...(item.isRecurring && item.recurringInterval
              ? { recurring: { interval: item.recurringInterval } }
              : {}),
          },
        },
      ],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      metadata: {
        connectPaymentId: paymentId,
        clubId: item.clubId,
        memberId: params.memberId,
        paymentItemId: item.id,
      },
      ...(item.isRecurring
        ? {
            subscription_data: {
              application_fee_percent: platformFeePercent,
              metadata: { connectPaymentId: paymentId, clubId: item.clubId },
            },
          }
        : {
            payment_intent_data: {
              application_fee_amount: platformFeeCents,
              metadata: { connectPaymentId: paymentId, clubId: item.clubId },
            },
          }),
    },
    // Stripe-Account header — direct charges on behalf of the connected club.
    { stripeAccount: club.stripe_account_id }
  );

  await query(
    `UPDATE connect_payments SET stripe_checkout_session_id = $1 WHERE id = $2`,
    [session.id, paymentId]
  );

  if (!session.url) {
    throw new Error('Stripe did not return a Checkout URL');
  }
  return { url: session.url, paymentId };
}

/**
 * One-off Checkout for a bulletin event signup (no payment_items catalog row).
 */
export async function createBulletinSignupCheckoutSession(params: {
  bulletinPostId: string;
  memberId: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<CheckoutResult> {
  const stripe = getStripe();
  if (!stripe) {
    throw new Error('Stripe is not configured on this server');
  }

  const postResult = await query(
    `SELECT
       bp.id,
       bp.title,
       bp.facility_id,
       bp.require_payment,
       bp.signup_amount_cents,
       bp.category,
       bp.drill_gender_restriction,
       bp.drill_max_participants,
       f.name AS facility_name,
       f.stripe_account_id,
       f.stripe_onboarded,
       f.platform_fee_percent
     FROM bulletin_posts bp
     JOIN facilities f ON f.id = bp.facility_id
     WHERE bp.id = $1
       AND bp.category IN ('event', 'drill', 'social', 'clinic', 'tournament')
       AND (bp.status = 'active' OR bp.status IS NULL)`,
    [params.bulletinPostId]
  );
  if (postResult.rows.length === 0) {
    throw new Error('Event post not found');
  }
  const post = postResult.rows[0];
  if (!post.require_payment || !post.signup_amount_cents) {
    throw new Error('This event does not require payment to sign up');
  }
  if (!post.stripe_account_id || !post.stripe_onboarded) {
    throw new Error('This club has not finished Stripe Connect onboarding yet');
  }

  const amountCents = Number(post.signup_amount_cents);
  const platformFeePercent = Number(post.platform_fee_percent ?? 0);
  const platformFeeCents = Math.max(0, Math.round((amountCents * platformFeePercent) / 100));

  const existingSignup = await query(
    `SELECT 1 FROM bulletin_drill_signups
     WHERE bulletin_post_id = $1 AND user_id = $2`,
    [params.bulletinPostId, params.memberId]
  );
  if (existingSignup.rows.length > 0) {
    throw new Error('You are already signed up for this event');
  }

  const pendingPayment = await query(
    `SELECT id FROM connect_payments
     WHERE bulletin_post_id = $1 AND member_id = $2 AND status = 'PENDING'
     ORDER BY created_at DESC
     LIMIT 1`,
    [params.bulletinPostId, params.memberId]
  );
  if (pendingPayment.rows.length > 0) {
    const sessionResult = await query(
      `SELECT stripe_checkout_session_id FROM connect_payments WHERE id = $1`,
      [pendingPayment.rows[0].id]
    );
    const sessionId = sessionResult.rows[0]?.stripe_checkout_session_id;
    if (sessionId) {
      const existingSession = await stripe.checkout.sessions.retrieve(sessionId, {
        stripeAccount: post.stripe_account_id,
      });
      if (existingSession.url && existingSession.status === 'open') {
        return { url: existingSession.url, paymentId: pendingPayment.rows[0].id };
      }
    }
  }

  const insertResult = await query(
    `INSERT INTO connect_payments
       (club_id, member_id, payment_item_id, bulletin_post_id, amount_cents, platform_fee_cents, status)
     VALUES ($1, $2, NULL, $3, $4, $5, 'PENDING')
     RETURNING id`,
    [post.facility_id, params.memberId, params.bulletinPostId, amountCents, platformFeeCents]
  );
  const paymentId: string = insertResult.rows[0].id;

  const eventLabel = post.title || 'Event signup';
  const session = await stripe.checkout.sessions.create(
    {
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: amountCents,
            product_data: {
              name: eventLabel,
              description: `Signup for ${post.facility_name}`,
            },
          },
        },
      ],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      metadata: {
        connectPaymentId: paymentId,
        clubId: post.facility_id,
        memberId: params.memberId,
        bulletinPostId: params.bulletinPostId,
        signupPayment: 'true',
      },
      payment_intent_data: {
        application_fee_amount: platformFeeCents,
        metadata: {
          connectPaymentId: paymentId,
          clubId: post.facility_id,
          bulletinPostId: params.bulletinPostId,
        },
      },
    },
    { stripeAccount: post.stripe_account_id }
  );

  await query(
    `UPDATE connect_payments SET stripe_checkout_session_id = $1 WHERE id = $2`,
    [session.id, paymentId]
  );

  if (!session.url) {
    throw new Error('Stripe did not return a Checkout URL');
  }
  return { url: session.url, paymentId };
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

export async function getClubPaymentHistory(clubId: string): Promise<ConnectPayment[]> {
  const result = await query(
    `SELECT cp.*,
            COALESCE(pi.name, bp.title || ' signup') AS item_name,
            COALESCE(pi.category, 'OTHER') AS item_category,
            u.full_name AS member_name,
            u.email AS member_email
       FROM connect_payments cp
       LEFT JOIN payment_items pi ON pi.id = cp.payment_item_id
       LEFT JOIN bulletin_posts bp ON bp.id = cp.bulletin_post_id
       JOIN users u ON u.id = cp.member_id
      WHERE cp.club_id = $1
      ORDER BY cp.created_at DESC`,
    [clubId]
  );
  return result.rows.map(rowToConnectPayment);
}

export async function getMemberPaymentHistory(memberId: string): Promise<ConnectPayment[]> {
  const result = await query(
    `SELECT cp.*,
            COALESCE(pi.name, bp.title || ' signup') AS item_name,
            COALESCE(pi.category, 'OTHER') AS item_category
       FROM connect_payments cp
       LEFT JOIN payment_items pi ON pi.id = cp.payment_item_id
       LEFT JOIN bulletin_posts bp ON bp.id = cp.bulletin_post_id
      WHERE cp.member_id = $1
      ORDER BY cp.created_at DESC`,
    [memberId]
  );
  return result.rows.map(rowToConnectPayment);
}

// ---------------------------------------------------------------------------
// Webhook handler — marks the PENDING row as PAID once Checkout completes.
// ---------------------------------------------------------------------------

async function finalizeSignupPaymentRow(row: {
  id: string;
  bulletin_post_id: string | null;
  member_id: string;
}): Promise<void> {
  if (!row.bulletin_post_id) return;
  const { finalizeBulletinSignupAfterPayment } = await import('./bulletinBoardService');
  await finalizeBulletinSignupAfterPayment({
    bulletinPostId: row.bulletin_post_id,
    memberId: row.member_id,
    connectPaymentId: row.id,
  });
}

export async function markCheckoutSessionPaid(session: Stripe.Checkout.Session): Promise<void> {
  const paymentId = session.metadata?.connectPaymentId;
  const paymentIntentId =
    typeof session.payment_intent === 'string' ? session.payment_intent : null;
  const bulletinPostId = session.metadata?.bulletinPostId || null;
  const isSignupPayment = session.metadata?.signupPayment === 'true' || Boolean(bulletinPostId);

  let paidRow: { id: string; bulletin_post_id: string | null; member_id: string } | null = null;

  if (paymentId) {
    const result = await query(
      `UPDATE connect_payments
         SET status = 'PAID',
             paid_at = CURRENT_TIMESTAMP,
             stripe_payment_intent_id = COALESCE($1, stripe_payment_intent_id),
             stripe_checkout_session_id = COALESCE($2, stripe_checkout_session_id)
       WHERE id = $3
       RETURNING id, bulletin_post_id, member_id`,
      [paymentIntentId, session.id, paymentId]
    );
    paidRow = result.rows[0] ?? null;
  } else {
    const fallback = await query(
      `UPDATE connect_payments
         SET status = 'PAID',
             paid_at = CURRENT_TIMESTAMP,
             stripe_payment_intent_id = COALESCE($1, stripe_payment_intent_id)
       WHERE stripe_checkout_session_id = $2
       RETURNING id, bulletin_post_id, member_id`,
      [paymentIntentId, session.id]
    );
    paidRow = fallback.rows[0] ?? null;
  }

  if (paidRow && isSignupPayment) {
    await finalizeSignupPaymentRow(paidRow);
    const signupCheck = await query(
      `SELECT 1 FROM bulletin_drill_signups
        WHERE bulletin_post_id = $1 AND user_id = $2`,
      [paidRow.bulletin_post_id, paidRow.member_id]
    );
    if (signupCheck.rows.length === 0 && paidRow.bulletin_post_id) {
      const { finalizeBulletinSignupAfterPayment } = await import('./bulletinBoardService');
      await finalizeBulletinSignupAfterPayment({
        bulletinPostId: paidRow.bulletin_post_id,
        memberId: paidRow.member_id,
        connectPaymentId: paidRow.id,
      });
    }
  }
}

/**
 * After Stripe redirects back to the app, confirm the session and create the signup.
 * Works even when the Connect webhook has not reached the server (common in local dev).
 */
function sameMemberId(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return String(a).toLowerCase() === String(b).toLowerCase();
}

export async function confirmBulletinSignupCheckout(params: {
  sessionId: string;
  memberId: string;
}): Promise<{
  bulletinPostId: string;
  status: 'confirmed' | 'waitlist';
  waitlistPosition: number | null;
}> {
  const stripe = getStripe();
  if (!stripe) {
    throw new Error('Stripe is not configured on this server');
  }

  let payment: {
    id: string;
    member_id: string;
    bulletin_post_id: string | null;
    status: string;
    stripe_account_id: string;
  } | null = null;

  const paymentResult = await query(
    `SELECT cp.id, cp.member_id, cp.bulletin_post_id, cp.status, f.stripe_account_id
       FROM connect_payments cp
       JOIN facilities f ON f.id = cp.club_id
      WHERE cp.stripe_checkout_session_id = $1`,
    [params.sessionId]
  );
  if (paymentResult.rows.length > 0) {
    payment = paymentResult.rows[0];
  } else {
    const recentPayments = await query(
      `SELECT cp.id, cp.member_id, cp.bulletin_post_id, cp.status, f.stripe_account_id
         FROM connect_payments cp
         JOIN facilities f ON f.id = cp.club_id
        WHERE cp.member_id = $1
          AND cp.bulletin_post_id IS NOT NULL
          AND cp.status IN ('PENDING', 'PAID')
        ORDER BY cp.created_at DESC
        LIMIT 15`,
      [params.memberId]
    );
    for (const row of recentPayments.rows) {
      try {
        const probe = await stripe.checkout.sessions.retrieve(params.sessionId, {
          stripeAccount: row.stripe_account_id,
        });
        if (probe.id === params.sessionId) {
          payment = row;
          await query(
            `UPDATE connect_payments SET stripe_checkout_session_id = $1 WHERE id = $2`,
            [params.sessionId, row.id]
          );
          break;
        }
      } catch {
        // Session belongs to a different connected account — try next row.
      }
    }
  }

  if (!payment) {
    throw new Error('Payment session not found');
  }
  if (!sameMemberId(payment.member_id, params.memberId)) {
    throw new Error('This payment does not belong to your account');
  }
  if (!payment.bulletin_post_id) {
    throw new Error('This payment is not linked to an event signup');
  }

  const session = await stripe.checkout.sessions.retrieve(params.sessionId, {
    stripeAccount: payment.stripe_account_id,
  });

  if (session.payment_status !== 'paid') {
    throw new Error('Payment has not completed yet');
  }

  await markCheckoutSessionPaid(session);

  let signupResult = await query(
    `SELECT status, waitlist_position
       FROM bulletin_drill_signups
      WHERE bulletin_post_id = $1 AND user_id = $2`,
    [payment.bulletin_post_id, params.memberId]
  );
  if (signupResult.rows.length === 0) {
    const { finalizeBulletinSignupAfterPayment } = await import('./bulletinBoardService');
    await finalizeBulletinSignupAfterPayment({
      bulletinPostId: payment.bulletin_post_id,
      memberId: params.memberId,
      connectPaymentId: payment.id,
    });
    signupResult = await query(
      `SELECT status, waitlist_position
         FROM bulletin_drill_signups
        WHERE bulletin_post_id = $1 AND user_id = $2`,
      [payment.bulletin_post_id, params.memberId]
    );
  }
  if (signupResult.rows.length === 0) {
    throw new Error('Signup could not be completed. Please contact the club.');
  }

  return {
    bulletinPostId: payment.bulletin_post_id,
    status: signupResult.rows[0].status,
    waitlistPosition: signupResult.rows[0].waitlist_position,
  };
}

// ---------------------------------------------------------------------------
// Authorization helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if the user is an active admin of the given club.
 */
export async function isClubAdmin(userId: string, clubId: string): Promise<boolean> {
  const result = await query(
    `SELECT 1 FROM facility_admins
       WHERE user_id = $1 AND facility_id = $2 AND status = 'active'
       LIMIT 1`,
    [userId, clubId]
  );
  return result.rows.length > 0;
}

/**
 * Returns true if the user has an active (non-suspended) membership at the club.
 */
export async function isClubMember(userId: string, clubId: string): Promise<boolean> {
  const result = await query(
    `SELECT 1 FROM facility_memberships
       WHERE user_id = $1 AND facility_id = $2 AND status IN ('active','pending')
       LIMIT 1`,
    [userId, clubId]
  );
  return result.rows.length > 0;
}
