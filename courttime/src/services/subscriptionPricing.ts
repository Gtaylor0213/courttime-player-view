/** Per-court annual platform subscription pricing (new signups). */
export const PER_COURT_CENTS = 5000;   // $50 per court
export const MIN_SUBSCRIPTION_CENTS = 20000;  // $200 minimum
export const MAX_SUBSCRIPTION_CENTS = 55000;  // $550 maximum

/** Max courts at list price before annual fee caps ($550). */
export const MAX_COURTS_AT_LIST_PRICE = 11;

/** Courts already covered by the $200 minimum subscription — adding up to this many is free. */
export const MIN_COURTS_COVERED = MIN_SUBSCRIPTION_CENTS / PER_COURT_CENTS; // 4

/**
 * Facilities exempted from the $550 annual maximum — they pay pure $50/court
 * (still subject to the $200 minimum) with no ceiling. Set by business request,
 * not derivable from court count or plan.
 */
const UNCAPPED_FACILITY_IDS = new Set(['fields-club-amberfield', 'st-marlo-tennis-pickleball']);

export function isUncappedFacility(facilityId?: string | null): boolean {
  return !!facilityId && UNCAPPED_FACILITY_IDS.has(facilityId);
}

/**
 * Annual subscription amount in cents: $50/court, min $200, max $550
 * (no max for facilities in UNCAPPED_FACILITY_IDS).
 */
export function getAmountForCourts(courtCount: number, facilityId?: string | null): number {
  const raw = courtCount * PER_COURT_CENTS;
  const floored = Math.max(MIN_SUBSCRIPTION_CENTS, raw);
  return isUncappedFacility(facilityId) ? floored : Math.min(MAX_SUBSCRIPTION_CENTS, floored);
}

export function formatAnnualPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function formatAnnualPricePerYear(cents: number): string {
  return `${formatAnnualPrice(cents)}/year`;
}

/** Whether the facility is at the annual subscription cap (no per-court add fee). */
export function isAtSubscriptionCap(
  activeCourtCount: number,
  amountCents: number,
  facilityId?: string | null
): boolean {
  if (isUncappedFacility(facilityId)) return false;
  return amountCents >= MAX_SUBSCRIPTION_CENTS
    || activeCourtCount >= MAX_COURTS_AT_LIST_PRICE;
}

/**
 * One-time platform fee in cents when adding courts post-registration.
 * The $200 minimum already covers the first 4 courts, so only courts 5-11
 * are charged $50 each; $0 once at the subscription cap. Uncapped facilities
 * keep paying $50/court past court 11 instead of getting it free.
 */
export function courtAddPaymentCents(
  courtsToAdd: number,
  activeCourtCount: number,
  amountCents: number,
  facilityId?: string | null
): number {
  if (courtsToAdd <= 0) return 0;
  if (isAtSubscriptionCap(activeCourtCount, amountCents, facilityId)) return 0;
  const firstChargeable = Math.max(activeCourtCount, MIN_COURTS_COVERED);
  const uncapped = isUncappedFacility(facilityId);
  const lastChargeable = uncapped
    ? activeCourtCount + courtsToAdd
    : Math.min(activeCourtCount + courtsToAdd, MAX_COURTS_AT_LIST_PRICE);
  const chargeableCourts = Math.max(0, lastChargeable - firstChargeable);
  return chargeableCourts * PER_COURT_CENTS;
}
