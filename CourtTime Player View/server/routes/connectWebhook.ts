/**
 * Stripe Connect webhook — handles checkout.session.completed events for
 * member→club payments. This is a SEPARATE webhook endpoint from
 * /api/webhooks/stripe (which is used for the platform's annual subscription
 * billing). It uses its own signing secret: STRIPE_WEBHOOK_SECRET_CONNECT.
 *
 * Mount this router BEFORE express.json() in server/index.ts so the raw body
 * is available for signature verification.
 */

import express from 'express';
import Stripe from 'stripe';
import { getStripe, markCheckoutSessionPaid } from '../../src/services/stripeConnectService';
import { query } from '../../src/database/connection';

const router = express.Router();

function allowUnsignedWebhookPayloads(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.ALLOW_UNSIGNED_STRIPE_WEBHOOKS === 'true';
}

router.post(
  '/stripe-connect',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const stripe = getStripe();
    if (!stripe) {
      console.log('[CONNECT-WEBHOOK] Stripe not configured, ignoring webhook');
      return res.status(200).json({ received: true });
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET_CONNECT;
    let event: Stripe.Event;

    try {
      if (webhookSecret) {
        const sig = req.headers['stripe-signature'] as string;
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
      } else if (allowUnsignedWebhookPayloads()) {
        event = JSON.parse(req.body.toString()) as Stripe.Event;
        console.warn(
          '[CONNECT-WEBHOOK] Signature verification skipped by ALLOW_UNSIGNED_STRIPE_WEBHOOKS'
        );
      } else {
        console.error('[CONNECT-WEBHOOK] STRIPE_WEBHOOK_SECRET_CONNECT is required when Stripe is configured');
        return res.status(500).send('Webhook signing secret is not configured');
      }
    } catch (err: any) {
      console.error('[CONNECT-WEBHOOK] Signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    console.log(`[CONNECT-WEBHOOK] Received event: ${event.type} (${event.id})`);

    try {
      switch (event.type) {
        case 'checkout.session.completed':
          await markCheckoutSessionPaid(event.data.object as Stripe.Checkout.Session);
          break;
        case 'payment_intent.payment_failed': {
          const intent = event.data.object as Stripe.PaymentIntent;
          await query(
            `UPDATE connect_payments
               SET status = 'FAILED'
             WHERE stripe_payment_intent_id = $1 AND status = 'PENDING'`,
            [intent.id]
          );
          break;
        }
        case 'charge.refunded': {
          const charge = event.data.object as Stripe.Charge;
          if (charge.payment_intent) {
            await query(
              `UPDATE connect_payments
                 SET status = 'REFUNDED'
               WHERE stripe_payment_intent_id = $1`,
              [charge.payment_intent]
            );
          }
          break;
        }
        default:
          console.log(`[CONNECT-WEBHOOK] Unhandled event type: ${event.type}`);
      }
    } catch (err: any) {
      console.error(`[CONNECT-WEBHOOK] Error handling ${event.type}:`, err);
      // Always return 200 — Stripe retries on non-2xx and we don't want infinite retries for bugs.
    }

    return res.status(200).json({ received: true });
  }
);

export default router;
