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

const TYPE_LABEL: Record<string, string> = {
  COURT_BOOKING:    'Court Booking',
  GUEST_FEE:        'Guest Fee',
  BULLETIN_SIGNUP:  'Bulletin Signup',
  PAYMENT_ITEM:     'Payment Item',
  annual_fee:       'Annual Fee',
  pro_shop:         'Pro Shop',
};

export function typeLabel(type: string): string {
  return TYPE_LABEL[type] ?? type;
}

export async function getTransactionReport(
  facilityId: string,
  startDate: string,
  endDate: string,
  typeFilter?: string
): Promise<TransactionReport> {

  // Source 1: facility_revenue_log (court bookings, guest fees, payment items, etc.)
  let revenueRows = { rows: [] as any[] };
  try {
    revenueRows = await query(
      `SELECT
         frl.id,
         frl.paid_at              AS date,
         u.full_name              AS member_name,
         u.email                  AS member_email,
         frl.payment_type         AS type,
         COALESCE(pi.name, initcap(replace(lower(frl.payment_type), '_', ' '))) AS description,
         frl.amount_cents,
         'paid'                   AS status
       FROM facility_revenue_log frl
       LEFT JOIN users u ON u.id = frl.member_id
       LEFT JOIN connect_payments cp
              ON cp.id = frl.source_id AND frl.source_type = 'connect_payment'
       LEFT JOIN payment_items pi ON pi.id = cp.payment_item_id
       WHERE frl.facility_id = $1
         AND frl.payment_type != 'PLATFORM_SUBSCRIPTION'
         AND frl.paid_at >= $2::timestamptz
         AND frl.paid_at <  $3::timestamptz + INTERVAL '1 day'`,
      [facilityId, startDate, endDate]
    );
  } catch (err) {
    console.error('[Reports] Revenue log query failed:', err);
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
    ...revenueRows.rows.map((r: any) => ({
      id: r.id,
      date: r.date,
      member_name: r.member_name,
      member_email: r.member_email,
      type: (r.type as string).toLowerCase().replace(/ /g, '_') as TransactionType,
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
