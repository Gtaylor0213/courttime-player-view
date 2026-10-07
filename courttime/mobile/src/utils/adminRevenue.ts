import { unwrapApiPayload } from '../../../shared/api/core';

export type RevenuePaymentType =
  | 'COURT_BOOKING'
  | 'BULLETIN_SIGNUP'
  | 'PAYMENT_ITEM'
  | 'GUEST_FEE'
  | 'PLATFORM_SUBSCRIPTION'
  | string;

export type RevenueMonthlyRow = {
  month: string;
  total_cents?: number;
  totalCents?: number;
  payment_type?: RevenuePaymentType;
  paymentType?: RevenuePaymentType;
};

export type RevenueTransaction = {
  id: string;
  amount_cents?: number;
  amountCents?: number;
  payment_type?: RevenuePaymentType;
  paymentType?: RevenuePaymentType;
  paid_at?: string;
  paidAt?: string;
  member_name?: string | null;
  memberName?: string | null;
  member_email?: string | null;
  memberEmail?: string | null;
};

export type RevenueTotals = {
  allTimeCents: number;
  thisMonthCents: number;
  lastMonthCents: number;
  thisYearCents: number;
};

export type AdminRevenueData = {
  totals: RevenueTotals;
  breakdownCents: Record<string, number>;
  transactions: RevenueTransaction[];
};

export const REVENUE_BREAKDOWN_ROWS: Array<{ type: RevenuePaymentType; label: string }> = [
  { type: 'COURT_BOOKING', label: 'Court' },
  { type: 'BULLETIN_SIGNUP', label: 'Drill' },
  { type: 'PAYMENT_ITEM', label: 'Dues' },
  { type: 'GUEST_FEE', label: 'Guest fee' },
];

export function formatCentsAsDollars(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function revenuePaymentTypeLabel(type: RevenuePaymentType | undefined): string {
  switch (type) {
    case 'COURT_BOOKING':
      return 'Court booking';
    case 'BULLETIN_SIGNUP':
      return 'Drill signup';
    case 'PAYMENT_ITEM':
      return 'Dues / payment';
    case 'GUEST_FEE':
      return 'Guest fee';
    case 'PLATFORM_SUBSCRIPTION':
      return 'Platform subscription';
    default:
      return type ? String(type).replace(/_/g, ' ').toLowerCase() : 'Payment';
  }
}

export function currentMonthKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function rowMonth(row: RevenueMonthlyRow): string {
  return String(row.month ?? '');
}

function rowPaymentType(row: RevenueMonthlyRow): string {
  return String(row.payment_type ?? row.paymentType ?? '');
}

function rowCents(row: RevenueMonthlyRow): number {
  return Number(row.total_cents ?? row.totalCents ?? 0);
}

/** Sum this month's revenue by payment type from the monthly API rows. */
export function aggregateThisMonthBreakdown(
  monthly: RevenueMonthlyRow[],
  monthKey = currentMonthKey()
): Record<string, number> {
  const breakdown: Record<string, number> = {};
  for (const row of monthly) {
    if (rowMonth(row) !== monthKey) continue;
    const type = rowPaymentType(row);
    if (!type) continue;
    breakdown[type] = (breakdown[type] ?? 0) + rowCents(row);
  }
  return breakdown;
}

export function transactionAmountCents(tx: RevenueTransaction): number {
  return Number(tx.amount_cents ?? tx.amountCents ?? 0);
}

export function transactionPaidAt(tx: RevenueTransaction): string | undefined {
  return tx.paid_at ?? tx.paidAt;
}

export function transactionPaymentType(tx: RevenueTransaction): RevenuePaymentType | undefined {
  return tx.payment_type ?? tx.paymentType;
}

export function transactionMemberName(tx: RevenueTransaction): string {
  const name = tx.member_name ?? tx.memberName;
  if (name && String(name).trim()) return String(name).trim();
  const email = tx.member_email ?? tx.memberEmail;
  if (email && String(email).trim()) return String(email).trim();
  return 'Member';
}

export function formatRevenuePaidAt(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function parseAdminRevenueResponse(responseData: unknown): AdminRevenueData | null {
  const payload = unwrapApiPayload<{
    totals?: Partial<RevenueTotals>;
    monthly?: RevenueMonthlyRow[];
    transactions?: RevenueTransaction[];
  }>(responseData);

  if (!payload?.totals) return null;

  const monthly = Array.isArray(payload.monthly) ? payload.monthly : [];
  const transactions = Array.isArray(payload.transactions) ? payload.transactions : [];

  return {
    totals: {
      allTimeCents: Number(payload.totals.allTimeCents ?? 0),
      thisMonthCents: Number(payload.totals.thisMonthCents ?? 0),
      lastMonthCents: Number(payload.totals.lastMonthCents ?? 0),
      thisYearCents: Number(payload.totals.thisYearCents ?? 0),
    },
    breakdownCents: aggregateThisMonthBreakdown(monthly),
    transactions,
  };
}
