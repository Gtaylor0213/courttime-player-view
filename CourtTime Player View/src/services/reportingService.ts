import { query } from '../database/connection';

export type TransactionType =
  | 'court_booking'
  | 'guest_fee'
  | 'bulletin_signup'
  | 'payment_item'
  | 'annual_fee'
  | 'pro_shop';

export interface Transaction {
  id: string;
  date: string;
  member_name: string | null;
  member_email: string | null;
  type: TransactionType;
  description: string;
  amount_cents: number;
  status: string;
}

export interface ReportSummaryRow {
  type: TransactionType;
  total_cents: number;
  count: number;
}

export interface TransactionReport {
  transactions: Transaction[];
  summary: ReportSummaryRow[];
  grand_total_cents: number;
  transaction_count: number;
}

export function typeLabel(type: string): string {
  const labels: Record<string, string> = {
    court_booking:   'Court Booking',
    guest_fee:       'Guest Fee',
    bulletin_signup: 'Bulletin Signup',
    payment_item:    'Payment Item',
    annual_fee:      'Annual Fee',
    pro_shop:        'Pro Shop',
  };
  return labels[type] ?? type;
}

export async function getTransactionReport(
  facilityId: string,
  startDate: string,
  endDate: string,
  typeFilter?: string
): Promise<TransactionReport> {

  // Source 1: connect_payments (court bookings, bulletin signups, payment items)
  // Querying this table directly is more reliable than facility_revenue_log,
  // which depends on the Stripe webhook having fired and migration 045 being applied.
  let connectRows = { rows: [] as any[] };
  try {
    connectRows = await query(
      `SELECT
         cp.id,
         COALESCE(cp.paid_at, cp.created_at)  AS date,
         u.full_name                           AS member_name,
         u.email                               AS member_email,
         CASE
           WHEN cp.bulletin_post_id IS NOT NULL            THEN 'bulletin_signup'
           WHEN cp.booking_id IS NOT NULL
             OR cp.pending_booking IS NOT NULL             THEN 'court_booking'
           ELSE 'payment_item'
         END                                   AS type,
         COALESCE(
           pi.name,
           CASE WHEN cp.bulletin_post_id IS NOT NULL THEN 'Event Signup' END,
           CASE WHEN cp.booking_id IS NOT NULL
                  OR cp.pending_booking IS NOT NULL THEN 'Court Booking' END,
           'Payment'
         )                                     AS description,
         cp.amount_cents,
         lower(cp.status)                      AS status
       FROM connect_payments cp
       JOIN users u ON u.id = cp.member_id
       LEFT JOIN payment_items pi ON pi.id = cp.payment_item_id
       WHERE cp.club_id = $1
         AND cp.status = 'PAID'
         AND COALESCE(cp.paid_at, cp.created_at) >= $2::timestamptz
         AND COALESCE(cp.paid_at, cp.created_at) <  $3::timestamptz + INTERVAL '1 day'`,
      [facilityId, startDate, endDate]
    );
  } catch (err) {
    console.error('[Reports] Connect payments query failed:', err);
  }

  // Source 2: annual_fee_billing_records
  let annualRows = { rows: [] as any[] };
  try {
    annualRows = await query(
      `SELECT
         afbr.id::text            AS id,
         afbr.processed_at        AS date,
         u.full_name              AS member_name,
         u.email                  AS member_email,
         'annual_fee'             AS type,
         CONCAT(COALESCE(afbr.tier_name, 'Annual Fee'), ' (', afbr.billing_year, ')') AS description,
         afbr.amount_cents,
         afbr.status
       FROM annual_fee_billing_records afbr
       JOIN users u ON u.id = afbr.user_id
       WHERE afbr.facility_id = $1
         AND afbr.status = 'charged'
         AND afbr.processed_at >= $2::timestamptz
         AND afbr.processed_at <  $3::timestamptz + INTERVAL '1 day'`,
      [facilityId, startDate, endDate]
    );
  } catch (err) {
    console.error('[Reports] Annual fees query failed:', err);
  }

  // Source 3: pro_shop_orders
  let proShopRows = { rows: [] as any[] };
  try {
    proShopRows = await query(
      `SELECT
         o.id::text               AS id,
         o.created_at             AS date,
         u.full_name              AS member_name,
         u.email                  AS member_email,
         'pro_shop'               AS type,
         COALESCE(
           (SELECT string_agg(COALESCE(p.name, 'Item') || ' x' || oi.quantity::text, ', ')
            FROM pro_shop_order_items oi
            LEFT JOIN pro_shop_products p ON p.id = oi.product_id
            WHERE oi.order_id = o.id),
           'Pro Shop Order'
         )                        AS description,
         o.total_cents            AS amount_cents,
         o.status
       FROM pro_shop_orders o
       JOIN users u ON u.id = o.user_id
       WHERE o.facility_id = $1
         AND o.status = 'paid'
         AND o.created_at >= $2::timestamptz
         AND o.created_at <  $3::timestamptz + INTERVAL '1 day'`,
      [facilityId, startDate, endDate]
    );
  } catch (err) {
    console.error('[Reports] Pro shop query failed:', err);
  }

  // Merge all rows
  let all: Transaction[] = [
    ...connectRows.rows.map((r: any) => ({
      id: r.id,
      date: r.date,
      member_name: r.member_name,
      member_email: r.member_email,
      type: r.type as TransactionType,
      description: r.description,
      amount_cents: Number(r.amount_cents),
      status: r.status,
    })),
    ...annualRows.rows.map((r: any) => ({
      id: r.id,
      date: r.date,
      member_name: r.member_name,
      member_email: r.member_email,
      type: 'annual_fee' as TransactionType,
      description: r.description,
      amount_cents: Number(r.amount_cents),
      status: r.status,
    })),
    ...proShopRows.rows.map((r: any) => ({
      id: r.id,
      date: r.date,
      member_name: r.member_name,
      member_email: r.member_email,
      type: 'pro_shop' as TransactionType,
      description: r.description,
      amount_cents: Number(r.amount_cents),
      status: r.status,
    })),
  ];

  // Apply type filter
  if (typeFilter && typeFilter !== 'all') {
    all = all.filter(t => t.type === typeFilter);
  }

  // Sort newest first
  all.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Build summary
  const summaryMap = new Map<string, { total_cents: number; count: number }>();
  for (const t of all) {
    const key = t.type;
    const existing = summaryMap.get(key) ?? { total_cents: 0, count: 0 };
    summaryMap.set(key, { total_cents: existing.total_cents + t.amount_cents, count: existing.count + 1 });
  }
  const summary: ReportSummaryRow[] = Array.from(summaryMap.entries())
    .map(([type, data]) => ({ type: type as TransactionType, ...data }))
    .sort((a, b) => b.total_cents - a.total_cents);

  const grand_total_cents = all.reduce((sum, t) => sum + t.amount_cents, 0);

  return { transactions: all, summary, grand_total_cents, transaction_count: all.length };
}
