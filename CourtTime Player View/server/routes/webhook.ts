import express from 'express';
import Stripe from 'stripe';
import { query } from '../../src/database/connection';

const router = express.Router();

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key.startsWith('sk_test_xxxx')) return null;
  return new Stripe(key);
}

/**
 * POST /api/webhooks/stripe
 * Stripe webhook endpoint — must receive raw body for signature verification.
 * This route is mounted BEFORE express.json() in server/index.ts.
 */
router.post(
  '/stripe',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const stripe = getStripe();
    if (!stripe) {
      console.log('[WEBHOOK] Stripe not configured, ignoring webhook');
      return res.status(200).json({ received: true });
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    let event: Stripe.Event;

    try {
      if (webhookSecret) {
        const sig = req.headers['stripe-signature'] as string;
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
      } else {
        // No webhook secret — parse directly (dev/testing only)
        event = JSON.parse(req.body.toString()) as Stripe.Event;
        console.warn('[WEBHOOK] No STRIPE_WEBHOOK_SECRET set — skipping signature verification');
      }
    } catch (err: any) {
      console.error('[WEBHOOK] Signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    console.log(`[WEBHOOK] Received event: ${event.type} (${event.id})`);

    try {
      switch (event.type) {
        case 'checkout.session.completed':
          await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
          break;
        case 'invoice.payment_succeeded':
          await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
          break;
        case 'invoice.payment_failed':
          await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
          break;
        case 'customer.subscription.updated':
          await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
          break;
        case 'customer.subscription.deleted':
          await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
          break;
        default:
          console.log(`[WEBHOOK] Unhandled event type: ${event.type}`);
      }
    } catch (err: any) {
      console.error(`[WEBHOOK] Error handling ${event.type}:`, err);
      // Return 200 anyway — Stripe retries on non-2xx, we don't want infinite retries for bugs
    }

    res.status(200).json({ received: true });
  }
);

/**
 * checkout.session.completed
 * Links the Stripe subscription and customer IDs to our facility_subscriptions record.
 */
async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const sessionId = session.id;
  const subscriptionId = session.subscription as string | null;
  const customerId = session.customer as string | null;

  if (!subscriptionId) {
    console.log('[WEBHOOK] checkout.session.completed — no subscription (one-time or setup)');
    return;
  }

  console.log(`[WEBHOOK] Linking session ${sessionId} → subscription ${subscriptionId}, customer ${customerId}`);

  await query(
    `UPDATE facility_subscriptions
     SET stripe_subscription_id = $1,
         stripe_customer_id = $2,
         status = 'active',
         updated_at = CURRENT_TIMESTAMP
     WHERE stripe_checkout_session_id = $3`,
    [subscriptionId, customerId, sessionId]
  );

  // Also update facility payment_status
  const subResult = await query(
    `SELECT facility_id FROM facility_subscriptions WHERE stripe_checkout_session_id = $1`,
    [sessionId]
  );
  if (subResult.rows.length > 0) {
    await query(
      `UPDATE facilities SET payment_status = 'paid' WHERE id = $1`,
      [subResult.rows[0].facility_id]
    );
  }
}

/**
 * invoice.payment_succeeded
 * Updates billing period and records payment in history.
 */
async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  const subscriptionId = invoice.subscription as string | null;
  if (!subscriptionId) return;

  const periodStart = invoice.period_start ? new Date(invoice.period_start * 1000) : null;
  const periodEnd = invoice.period_end ? new Date(invoice.period_end * 1000) : null;
  const amountPaid = invoice.amount_paid || 0;

  console.log(`[WEBHOOK] invoice.payment_succeeded — sub ${subscriptionId}, amount ${amountPaid}`);

  // Update subscription record
  await query(
    `UPDATE facility_subscriptions
     SET status = 'active',
         current_period_start = COALESCE($2, current_period_start),
         current_period_end = COALESCE($3, current_period_end),
         billing_period_start = COALESCE($2, billing_period_start),
         billing_period_end = COALESCE($3, billing_period_end),
         updated_at = CURRENT_TIMESTAMP
     WHERE stripe_subscription_id = $1`,
    [subscriptionId, periodStart, periodEnd]
  );

  // Get facility ID for payment history
  const subResult = await query(
    `SELECT id, facility_id FROM facility_subscriptions WHERE stripe_subscription_id = $1`,
    [subscriptionId]
  );

  if (subResult.rows.length > 0) {
    const { id: subDbId, facility_id: facilityId } = subResult.rows[0];

    // Record payment history
    await query(
      `INSERT INTO payment_history (
         facility_id, subscription_id, stripe_invoice_id,
         amount_cents, status, description, payment_method_type
       ) VALUES ($1, $2, $3, $4, 'succeeded', $5, 'card')`,
      [
        facilityId,
        subDbId,
        invoice.id,
        amountPaid,
        amountPaid === 0 ? 'Trial period — no charge' : 'Annual subscription renewal',
      ]
    );

    // Ensure facility is marked as paid
    await query(
      `UPDATE facilities SET payment_status = 'paid' WHERE id = $1`,
      [facilityId]
    );
  }
}

/**
 * invoice.payment_failed
 * Marks subscription as past_due.
 */
async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const subscriptionId = invoice.subscription as string | null;
  if (!subscriptionId) return;

  console.log(`[WEBHOOK] invoice.payment_failed — sub ${subscriptionId}`);

  await query(
    `UPDATE facility_subscriptions
     SET status = 'past_due', updated_at = CURRENT_TIMESTAMP
     WHERE stripe_subscription_id = $1`,
    [subscriptionId]
  );

  // Update facility payment_status
  const subResult = await query(
    `SELECT facility_id FROM facility_subscriptions WHERE stripe_subscription_id = $1`,
    [subscriptionId]
  );
  if (subResult.rows.length > 0) {
    await query(
      `UPDATE facilities SET payment_status = 'past_due' WHERE id = $1`,
      [subResult.rows[0].facility_id]
    );
  }
}

/**
 * customer.subscription.updated
 * Syncs cancel_at_period_end and status changes.
 */
async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const subscriptionId = subscription.id;
  const cancelAtPeriodEnd = subscription.cancel_at_period_end;
  const status = subscription.status; // active, past_due, canceled, trialing, etc.
  const currentPeriodStart = new Date(subscription.current_period_start * 1000);
  const currentPeriodEnd = new Date(subscription.current_period_end * 1000);

  console.log(`[WEBHOOK] subscription.updated — ${subscriptionId}, status=${status}, cancel=${cancelAtPeriodEnd}`);

  // Map Stripe status to our status
  let ourStatus = status;
  if (status === 'canceled') ourStatus = 'cancelled'; // normalize spelling

  await query(
    `UPDATE facility_subscriptions
     SET status = $2,
         cancel_at_period_end = $3,
         current_period_start = $4,
         current_period_end = $5,
         updated_at = CURRENT_TIMESTAMP
     WHERE stripe_subscription_id = $1`,
    [subscriptionId, ourStatus, cancelAtPeriodEnd, currentPeriodStart, currentPeriodEnd]
  );
}

/**
 * customer.subscription.deleted
 * Subscription is fully cancelled — suspend the facility.
 */
async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const subscriptionId = subscription.id;

  console.log(`[WEBHOOK] subscription.deleted — ${subscriptionId}`);

  await query(
    `UPDATE facility_subscriptions
     SET status = 'cancelled', cancel_at_period_end = false, updated_at = CURRENT_TIMESTAMP
     WHERE stripe_subscription_id = $1`,
    [subscriptionId]
  );

  // Suspend the facility
  const subResult = await query(
    `SELECT facility_id FROM facility_subscriptions WHERE stripe_subscription_id = $1`,
    [subscriptionId]
  );
  if (subResult.rows.length > 0) {
    await query(
      `UPDATE facilities SET payment_status = 'suspended' WHERE id = $1`,
      [subResult.rows[0].facility_id]
    );
  }
}

export default router;
