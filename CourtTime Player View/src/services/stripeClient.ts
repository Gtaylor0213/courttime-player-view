/**
 * Shared Stripe client construction and webhook-mode helpers.
 *
 * Every service that talks to Stripe used to carry its own copy of getStripe();
 * they were identical, so they live here now. (annualFeeService keeps a variant
 * that does not treat the `sk_test_xxxx` placeholder key as "unconfigured".)
 */

import Stripe from 'stripe';

/** Stripe client, or null when STRIPE_SECRET_KEY is missing or still the .env.example placeholder. */
export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key.startsWith('sk_test_xxxx')) return null;
  return new Stripe(key);
}

/** Dev-only escape hatch: accept webhook payloads without a Stripe signature. Never true in production. */
export function allowUnsignedWebhookPayloads(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.ALLOW_UNSIGNED_STRIPE_WEBHOOKS === 'true';
}
