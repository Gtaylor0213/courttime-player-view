/**
 * One-off helper: register (or reuse) the Stripe Connect webhook endpoint
 * for member→club Connect payments and write its signing secret into .env
 * as STRIPE_WEBHOOK_SECRET_CONNECT.
 *
 * Usage:
 *   node scripts/register-connect-webhook.js
 *   node scripts/register-connect-webhook.js https://example.com  (override APP_URL)
 *
 * Idempotent — if an endpoint already exists at the target URL it is reused.
 * Signing secret is only returned by Stripe at creation time; if you re-run
 * after creating it, this script tells you to look up the secret in the
 * Stripe Dashboard (or rotate it).
 */
require('dotenv').config();
const Stripe = require('stripe');
const fs = require('fs');
const path = require('path');

const ENABLED_EVENTS = [
  'checkout.session.completed',
  'payment_intent.payment_failed',
  'charge.refunded',
];

const WEBHOOK_PATH = '/api/webhooks/stripe-connect';

function getAppUrl() {
  const arg = process.argv[2];
  if (arg) return arg.replace(/\/+$/, '');
  const env = process.env.APP_URL;
  if (env) return env.replace(/\/+$/, '');
  throw new Error('APP_URL is not set in .env and no URL was passed as an argument');
}

function writeEnvSecret(secret) {
  const envPath = path.resolve(__dirname, '..', '.env');
  const exists = fs.existsSync(envPath);
  const original = exists ? fs.readFileSync(envPath, 'utf8') : '';

  const lineRegex = /^STRIPE_WEBHOOK_SECRET_CONNECT=.*$/m;
  const nextLine = `STRIPE_WEBHOOK_SECRET_CONNECT=${secret}`;
  const next = lineRegex.test(original)
    ? original.replace(lineRegex, nextLine)
    : (original.endsWith('\n') || original.length === 0
        ? `${original}${nextLine}\n`
        : `${original}\n${nextLine}\n`);
  fs.writeFileSync(envPath, next);
  console.log(`✏️  Wrote STRIPE_WEBHOOK_SECRET_CONNECT to ${envPath}`);
}

async function main() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key.startsWith('sk_test_xxxx')) {
    throw new Error('STRIPE_SECRET_KEY is not configured in .env');
  }
  const stripe = new Stripe(key);
  const appUrl = getAppUrl();
  const targetUrl = `${appUrl}${WEBHOOK_PATH}`;

  console.log(`🔎 Looking for existing webhook endpoint at: ${targetUrl}`);
  const existing = await stripe.webhookEndpoints.list({ limit: 100 });
  const match = existing.data.find(e => e.url === targetUrl);

  if (match) {
    console.log(`ℹ️  Webhook endpoint already exists: ${match.id}`);
    console.log(`   Events:   ${match.enabled_events.join(', ')}`);
    console.log(`   Connect:  ${match.metadata && match.metadata.connect ? match.metadata.connect : '(see API)'}`);
    console.log(`   Status:   ${match.status}`);

    // Make sure the right events are enabled.
    const missing = ENABLED_EVENTS.filter(e => !match.enabled_events.includes(e));
    if (missing.length > 0) {
      console.log(`🔧 Adding missing events: ${missing.join(', ')}`);
      const merged = Array.from(new Set([...match.enabled_events, ...ENABLED_EVENTS]));
      await stripe.webhookEndpoints.update(match.id, { enabled_events: merged });
    }

    console.log(`\n⚠️  Stripe only returns the signing secret at creation time.`);
    console.log(`   - Open https://dashboard.stripe.com/webhooks/${match.id}, click`);
    console.log(`     "Reveal" next to the signing secret, copy it, and paste into .env as`);
    console.log(`     STRIPE_WEBHOOK_SECRET_CONNECT=...`);
    console.log(`   - Or rotate it with:`);
    console.log(`     node -e "require('stripe')(process.env.STRIPE_SECRET_KEY).webhookEndpoints.update('${match.id}', { /* no-op */ })"`);
    console.log(`     (rotation requires deleting & recreating — see the Stripe docs).`);
    return;
  }

  console.log(`➕ Creating new webhook endpoint…`);
  const endpoint = await stripe.webhookEndpoints.create({
    url: targetUrl,
    enabled_events: ENABLED_EVENTS,
    connect: true,
    description: 'CourtTime — member→club Stripe Connect payments',
  });
  console.log(`✅ Created webhook endpoint: ${endpoint.id}`);
  console.log(`   URL:     ${endpoint.url}`);
  console.log(`   Events:  ${endpoint.enabled_events.join(', ')}`);

  if (endpoint.secret) {
    writeEnvSecret(endpoint.secret);
    console.log(`\n🎉 Done. The signing secret has been written to .env.`);
    console.log(`   Restart the API server so the new secret is picked up.`);
  } else {
    console.log(`\n⚠️  Stripe did not return a signing secret. Check the Dashboard.`);
  }
}

main().catch(err => {
  console.error('\n❌ Failed:', err.message || err);
  process.exit(1);
});
