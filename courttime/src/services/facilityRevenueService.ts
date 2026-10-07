import { query } from '../database/connection';
import { reconcileStuckFacilityConnectPayments } from './stripeConnectService';

export type FacilityRevenuePaymentType =
  | 'COURT_BOOKING'
  | 'BULLETIN_SIGNUP'
  | 'PAYMENT_ITEM'
  | 'GUEST_FEE';

export interface FacilityRevenueBreakdown {
  courtBooking: number;
  bulletinSignup: number;
  paymentItem: number;
}

export interface FacilityRevenueMonthRow {
  month: string;
  total_cents: number;
  payment_type: FacilityRevenuePaymentType;
}

export interface FacilityRevenueTransaction {
  id: string;
  amount_cents: number;
  payment_type: FacilityRevenuePaymentType;
  source_id: string | null;
  source_type: string;
  paid_at: string;
  member_name: string | null;
  member_email: string | null;
}

export interface FacilityRevenueTotals {
  allTimeCents: number;
  thisMonthCents: number;
  lastMonthCents: number;
  thisYearCents: number;
}

/**
 * Club revenue ledger — same sources as Admin Reports (reportingService):
 * connect_payments, post-play settlement charges, annual_fee_billing_records
 * and pro_shop_orders. Amounts are net of CourtTime's Stripe Connect
 * application fee (platform_fee_cents on connect_payments; the facility's
 * platform_fee_percent for off-session charges, which don't store it).
 * Cash close-outs and cash pro shop sales carry no application fee.
 *
 * The club's own CourtTime subscription is NOT club revenue — it is CourtTime
 * revenue and is reported on the developer dashboard instead.
 *
 * Pass a facility id to scope to one club ($1); omit it for every club.
 */
export function revenueEventsCte(scopeToFacility = true): string {
  const scope = (col: string) => (scopeToFacility ? `AND ${col} = $1` : '');
  return `
  WITH revenue_events AS (
    SELECT
      cp.club_id AS facility_id,
      cp.amount_cents AS gross_cents,
      COALESCE(cp.platform_fee_cents, 0) AS platform_fee_cents,
      CASE
        WHEN cp.bulletin_post_id IS NOT NULL THEN 'BULLETIN_SIGNUP'
        WHEN cp.booking_id IS NOT NULL OR cp.pending_booking IS NOT NULL THEN 'COURT_BOOKING'
        ELSE 'PAYMENT_ITEM'
      END AS payment_type,
      COALESCE(cp.paid_at, cp.created_at) AS paid_at
    FROM connect_payments cp
    WHERE cp.status = 'PAID'
      ${scope('cp.club_id')}

    UNION ALL

    SELECT
      b.facility_id,
      bsc.amount_cents,
      CASE
        WHEN bsc.status = 'charged'
          THEN GREATEST(0, ROUND(bsc.amount_cents * COALESCE(f.platform_fee_percent, 0) / 100.0))::int
        ELSE 0
      END,
      'COURT_BOOKING',
      COALESCE(bsc.resolved_at, bsc.updated_at)
    FROM booking_settlement_charges bsc
    JOIN bookings b ON b.id = bsc.booking_id
    JOIN facilities f ON f.id = b.facility_id
    WHERE bsc.status IN ('charged', 'cash')
      AND bsc.amount_cents > 0
      ${scope('b.facility_id')}

    UNION ALL

    SELECT
      afbr.facility_id,
      afbr.amount_cents,
      GREATEST(0, ROUND(afbr.amount_cents * COALESCE(f.platform_fee_percent, 0) / 100.0))::int,
      'PAYMENT_ITEM',
      afbr.processed_at
    FROM annual_fee_billing_records afbr
    JOIN facilities f ON f.id = afbr.facility_id
    WHERE afbr.status = 'charged'
      ${scope('afbr.facility_id')}

    UNION ALL

    SELECT
      o.facility_id,
      o.total_cents,
      o.platform_fee_cents,
      'PAYMENT_ITEM',
      o.created_at
    FROM pro_shop_orders o
    WHERE o.status = 'paid'
      ${scope('o.facility_id')}
  )
`;
}

const REVENUE_EVENTS_CTE = `${revenueEventsCte()}, net_revenue_events AS (
    SELECT facility_id, payment_type, paid_at,
           (gross_cents - platform_fee_cents) AS amount_cents
    FROM revenue_events
  )
`;

function mapBreakdownRow(paymentType: string, cents: number, breakdown: FacilityRevenueBreakdown) {
  switch (paymentType) {
    case 'COURT_BOOKING':
      breakdown.courtBooking += cents;
      break;
    case 'BULLETIN_SIGNUP':
      breakdown.bulletinSignup += cents;
      break;
    default:
      breakdown.paymentItem += cents;
      break;
  }
}

export async function getFacilityRevenueThisMonth(facilityId: string): Promise<{
  revenueCents: number;
  breakdown: FacilityRevenueBreakdown;
}> {
  await reconcileStuckFacilityConnectPayments(facilityId).catch(err =>
    console.error('[Revenue] Connect payment reconcile failed:', err)
  );

  let rows: Array<{ payment_type: string; total_cents: number }> = [];
  try {
    const result = await query(
      `${REVENUE_EVENTS_CTE}
       SELECT payment_type, COALESCE(SUM(amount_cents), 0)::int AS total_cents
       FROM net_revenue_events
       WHERE paid_at >= DATE_TRUNC('month', CURRENT_DATE)
         AND paid_at < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'
       GROUP BY payment_type`,
      [facilityId]
    );
    rows = result.rows;
  } catch (err) {
    console.error('[Revenue] This-month query failed:', err);
    return {
      revenueCents: 0,
      breakdown: { courtBooking: 0, bulletinSignup: 0, paymentItem: 0 },
    };
  }

  const breakdown: FacilityRevenueBreakdown = {
    courtBooking: 0,
    bulletinSignup: 0,
    paymentItem: 0,
  };
  let revenueCents = 0;
  for (const row of rows) {
    const cents = Number(row.total_cents || 0);
    revenueCents += cents;
    mapBreakdownRow(row.payment_type, cents, breakdown);
  }

  return { revenueCents, breakdown };
}

export async function getFacilityRevenueReport(
  facilityId: string,
  months: number,
  limit: number
): Promise<{
  totals: FacilityRevenueTotals;
  monthly: FacilityRevenueMonthRow[];
  transactions: FacilityRevenueTransaction[];
}> {
  const emptyTotals: FacilityRevenueTotals = {
    allTimeCents: 0,
    thisMonthCents: 0,
    lastMonthCents: 0,
    thisYearCents: 0,
  };

  await reconcileStuckFacilityConnectPayments(facilityId).catch(err =>
    console.error('[Revenue] Connect payment reconcile failed:', err)
  );

  let totals = { ...emptyTotals };
  let monthly: FacilityRevenueMonthRow[] = [];

  try {
    const totalsResult = await query(
      `${REVENUE_EVENTS_CTE}
       SELECT
         COALESCE(SUM(amount_cents), 0)::int AS all_time_cents,
         COALESCE(SUM(CASE
           WHEN paid_at >= DATE_TRUNC('month', CURRENT_DATE) THEN amount_cents ELSE 0 END), 0)::int AS this_month_cents,
         COALESCE(SUM(CASE
           WHEN paid_at >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month'
            AND paid_at < DATE_TRUNC('month', CURRENT_DATE) THEN amount_cents ELSE 0 END), 0)::int AS last_month_cents,
         COALESCE(SUM(CASE
           WHEN paid_at >= DATE_TRUNC('year', CURRENT_DATE) THEN amount_cents ELSE 0 END), 0)::int AS this_year_cents
       FROM net_revenue_events`,
      [facilityId]
    );
    const t = totalsResult.rows[0] || {};
    totals = {
      allTimeCents: Number(t.all_time_cents || 0),
      thisMonthCents: Number(t.this_month_cents || 0),
      lastMonthCents: Number(t.last_month_cents || 0),
      thisYearCents: Number(t.this_year_cents || 0),
    };

    const monthlyResult = await query(
      `${REVENUE_EVENTS_CTE}
       SELECT
         TO_CHAR(DATE_TRUNC('month', paid_at), 'YYYY-MM') AS month,
         payment_type,
         SUM(amount_cents)::int AS total_cents
       FROM net_revenue_events
       WHERE paid_at >= DATE_TRUNC('month', CURRENT_DATE) - ($2 || ' months')::interval
       GROUP BY DATE_TRUNC('month', paid_at), payment_type
       ORDER BY DATE_TRUNC('month', paid_at) DESC`,
      [facilityId, months]
    );
    monthly = monthlyResult.rows;
  } catch (err) {
    console.error('[Revenue] Totals/monthly query failed:', err);
  }

  let transactions: FacilityRevenueTransaction[] = [];
  try {
    const txResult = await query(
      `SELECT * FROM (
         SELECT
           cp.id,
           cp.amount_cents - COALESCE(cp.platform_fee_cents, 0) AS amount_cents,
           CASE
             WHEN cp.bulletin_post_id IS NOT NULL THEN 'BULLETIN_SIGNUP'
             WHEN cp.booking_id IS NOT NULL OR cp.pending_booking IS NOT NULL THEN 'COURT_BOOKING'
             ELSE 'PAYMENT_ITEM'
           END AS payment_type,
           cp.id AS source_id,
           'connect_payment' AS source_type,
           COALESCE(cp.paid_at, cp.created_at) AS paid_at,
           u.full_name AS member_name,
           u.email AS member_email
         FROM connect_payments cp
         LEFT JOIN users u ON cp.member_id = u.id
         WHERE cp.club_id = $1 AND cp.status = 'PAID'

         UNION ALL

         SELECT
           bsc.id::text,
           bsc.amount_cents - CASE
             WHEN bsc.status = 'charged'
               THEN GREATEST(0, ROUND(bsc.amount_cents * COALESCE(f.platform_fee_percent, 0) / 100.0))::int
             ELSE 0
           END,
           'COURT_BOOKING',
           bsc.id::text,
           'booking_settlement_charge',
           COALESCE(bsc.resolved_at, bsc.updated_at),
           u.full_name,
           u.email
         FROM booking_settlement_charges bsc
         JOIN bookings b ON b.id = bsc.booking_id
         JOIN facilities f ON f.id = b.facility_id
         LEFT JOIN users u ON u.id = bsc.user_id
         WHERE b.facility_id = $1
           AND bsc.status IN ('charged', 'cash')
           AND bsc.amount_cents > 0

         UNION ALL

         SELECT
           afbr.id::text,
           afbr.amount_cents
             - GREATEST(0, ROUND(afbr.amount_cents * COALESCE(f.platform_fee_percent, 0) / 100.0))::int,
           'PAYMENT_ITEM',
           afbr.id::text,
           'annual_fee',
           afbr.processed_at,
           u.full_name,
           u.email
         FROM annual_fee_billing_records afbr
         JOIN facilities f ON f.id = afbr.facility_id
         JOIN users u ON u.id = afbr.user_id
         WHERE afbr.facility_id = $1 AND afbr.status = 'charged'

         UNION ALL

         SELECT
           o.id::text,
           o.total_cents - o.platform_fee_cents,
           'PAYMENT_ITEM',
           o.id::text,
           'pro_shop',
           o.created_at,
           COALESCE(u.full_name, o.guest_name),
           COALESCE(u.email, o.guest_email)
         FROM pro_shop_orders o
         LEFT JOIN users u ON u.id = o.user_id
         WHERE o.facility_id = $1 AND o.status = 'paid'
       ) all_tx
       ORDER BY paid_at DESC
       LIMIT $2`,
      [facilityId, limit]
    );
    transactions = txResult.rows;
  } catch (err) {
    console.error('[Revenue] Transactions query failed:', err);
  }

  return { totals, monthly, transactions };
}
