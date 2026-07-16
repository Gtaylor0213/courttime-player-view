/** Per-court annual platform subscription pricing (new signups). */
export const PER_COURT_CENTS = 5000;   // $50 per court
export const MIN_SUBSCRIPTION_CENTS = 20000;  // $200 minimum
export const MAX_SUBSCRIPTION_CENTS = 55000;  // $550 maximum

/** Max courts at list price before annual fee caps ($550). */
export const MAX_COURTS_AT_LIST_PRICE = 11;

/** Courts already covered by the $200 minimum subscription — adding up to this many is free. */
export const MIN_COURTS_COVERED = MIN_SUBSCRIPTION_CENTS / PER_COURT_CENTS; // 4

/**
 * Annual subscription amount in cents: $50/court, min $200, max $550.
 */
export function getAmountForCourts(courtCount: number): number {
  const raw = courtCount * PER_COURT_CENTS;
  return Math.min(MAX_SUBSCRIPTION_CENTS, Math.max(MIN_SUBSCRIPTION_CENTS, raw));
}

export function formatAnnualPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function formatAnnualPricePerYear(cents: number): string {
  return `${formatAnnualPrice(cents)}/year`;
}

/** Whether the facility is at the annual subscription cap (no per-court add fee). */
export function isAtSubscriptionCap(activeCourtCount: number, amountCents: number): boolean {
  return amountCents >= MAX_SUBSCRIPTION_CENTS
    || activeCourtCount >= MAX_COURTS_AT_LIST_PRICE;
}

/**
 * One-time platform fee in cents when adding courts post-registration.
 * The $200 minimum already covers the first 4 courts, so only courts 5-11
 * are charged $50 each; $0 once at the subscription cap.
 */
export function courtAddPaymentCents(
  courtsToAdd: number,
  activeCourtCount: number,
  amountCents: number
): number {
  if (courtsToAdd <= 0) return 0;
  if (isAtSubscriptionCap(activeCourtCount, amountCents)) return 0;
  const firstChargeable = Math.max(activeCourtCount, MIN_COURTS_COVERED);
  const lastChargeable = Math.min(activeCourtCount + courtsToAdd, MAX_COURTS_AT_LIST_PRICE);
  const chargeableCourts = Math.max(0, lastChargeable - firstChargeable);
  return chargeableCourts * PER_COURT_CENTS;
}
