/**
 * Reset a facility platform subscription and create a new Stripe checkout (full annual charge).
 *
 * Usage:
 *   node scripts/fix-facility-subscription.js --facility-id peachtree-station-swim-tennis --courts 8
 *   node scripts/fix-facility-subscription.js --dry-run ...
 */

require('dotenv').config();
const { Pool } = require('pg');
const Stripe = require('stripe');

const PER_COURT_CENTS = 5000;
const MIN_SUBSCRIPTION_CENTS = 20000;
const MAX_SUBSCRIPTION_CENTS = 55000;

function getAmountForCourts(courtCount) {
  const raw = courtCount * PER_COURT_CENTS;
  return Math.min(MAX_SUBSCRIPTION_CENTS, Math.max(MIN_SUBSCRIPTION_CENTS, raw));
}

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { dryRun: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dry-run') opts.dryRun = true;
    else if (args[i] === '--facility-id') opts.facilityId = args[++i];
    else if (args[i] === '--courts') opts.courts = Number(args[++i]);
    else if (args[i] === '--product-id') opts.productId = args[++i];
  }
  if (!opts.facilityId || !opts.courts) {
    console.error('Usage: node scripts/fix-facility-subscription.js --facility-id <id> --courts <n> [--dry-run]');
    process.exit(1);
  }
  return opts;
}

async function main() {
  const opts = parseArgs();
  const amountCents = getAmountForCourts(opts.courts);
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const productId =
    opts.productId ||
    process.env.STRIPE_SUBSCRIPTION_PRODUCT_ID ||
    'prod_U3YbQMPY8VT376';
  const appUrl = (process.env.APP_URL || 'https://www.courttimeapp.com').replace(/\/$/, '');

  if (!stripeKey) {
    console.error('STRIPE_SECRET_KEY is required');
    process.exit(1);
  }

  const stripe = new Stripe(stripeKey);

  const facRes = await pool.query(
    `SELECT id, name, payment_status FROM facilities WHERE id = $1`,
    [opts.facilityId]
  );
  if (facRes.rows.length === 0) {
    console.error('Facility not found:', opts.facilityId);
    process.exit(1);
  }
  const facility = facRes.rows[0];

  const subRes = await pool.query(
    `SELECT * FROM facility_subscriptions WHERE facility_id = $1`,
    [opts.facilityId]
  );
  if (subRes.rows.length === 0) {
    console.error('No facility_subscriptions row for', opts.facilityId);
    process.exit(1);
  }
  const sub = subRes.rows[0];

  console.log('\n=== Facility subscription fix ===');
  console.log('Facility:', facility.id, '-', facility.name);
  console.log('Current payment_status:', facility.payment_status);
  console.log('Current subscription status:', sub.status, 'amount_cents:', sub.amount_cents);
  console.log('stripe_subscription_id:', sub.stripe_subscription_id);
  console.log('stripe_checkout_session_id:', sub.stripe_checkout_session_id);
  console.log('Target: courts =', opts.courts, 'amount =', amountCents, `($${(amountCents / 100).toFixed(2)}/yr)`);
  console.log('Dry run:', opts.dryRun);
  console.log('');

  let stripeSubId = sub.stripe_subscription_id;
  if (!stripeSubId && sub.stripe_checkout_session_id) {
    try {
      const oldSession = await stripe.checkout.sessions.retrieve(sub.stripe_checkout_session_id);
      if (oldSession.subscription) {
        stripeSubId = oldSession.subscription;
        console.log('Found Stripe subscription from old checkout:', stripeSubId);
      }
    } catch (e) {
      console.warn('Could not retrieve old checkout session:', e.message);
    }
  }

  if (stripeSubId) {
    const existing = await stripe.subscriptions.retrieve(stripeSubId);
    console.log('Existing Stripe sub status:', existing.status);
    if (!opts.dryRun && ['trialing', 'active', 'past_due', 'unpaid'].includes(existing.status)) {
      await stripe.subscriptions.cancel(stripeSubId);
      console.log('Cancelled Stripe subscription:', stripeSubId);
    }
  }

  if (opts.dryRun) {
    console.log('\n[DRY RUN] Would update DB and create checkout. Exiting.');
    await pool.end();
    return;
  }

  await pool.query(
    `UPDATE facility_subscriptions SET
       court_count = $2,
       amount_cents = $3,
       status = 'pending_payment',
       promo_code_used = NULL,
       stripe_subscription_id = NULL,
       stripe_price_id = NULL,
       stripe_checkout_session_id = NULL,
       billing_period_start = NULL,
       billing_period_end = NULL,
       current_period_start = NULL,
       current_period_end = NULL,
       cancel_at_period_end = false,
       updated_at = CURRENT_TIMESTAMP
     WHERE facility_id = $1`,
    [opts.facilityId, opts.courts, amountCents]
  );

  await pool.query(
    `UPDATE facilities SET payment_status = 'pending' WHERE id = $1`,
    [opts.facilityId]
  );

  const successUrl = `${appUrl}/?payment=success&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${appUrl}/?payment=cancelled`;

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    mode: 'subscription',
    customer: sub.stripe_customer_id || undefined,
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product: productId,
          unit_amount: amountCents,
          recurring: { interval: 'year' },
        },
        quantity: 1,
      },
    ],
    metadata: {
      facilityId: opts.facilityId,
      facilityName: facility.name,
      courtCount: String(opts.courts),
    },
    success_url: successUrl,
    cancel_url: cancelUrl,
  });

  await pool.query(
    `UPDATE facility_subscriptions SET stripe_checkout_session_id = $2 WHERE facility_id = $1`,
    [opts.facilityId, session.id]
  );

  const adminRes = await pool.query(
    `SELECT u.email, u.full_name
     FROM facility_admins fa
     JOIN users u ON u.id = fa.user_id
     WHERE fa.facility_id = $1 AND fa.status = 'active'
     UNION
     SELECT u.email, u.full_name
     FROM facility_memberships fm
     JOIN users u ON u.id = fm.user_id
     WHERE fm.facility_id = $1 AND (fm.is_facility_admin = true OR fm.membership_type = 'admin')
     LIMIT 5`,
    [opts.facilityId]
  );

  console.log('\n=== Done ===');
  console.log('Checkout session:', session.id);
  console.log('Payment URL:\n', session.url);
  console.log('\nAdmin contacts:');
  for (const a of adminRes.rows) {
    console.log(`  - ${a.full_name} <${a.email}>`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
