/** Per-court annual platform subscription pricing (new signups). */
export const PER_COURT_CENTS = 5000;   // $50 per court
export const MIN_SUBSCRIPTION_CENTS = 20000;  // $200 minimum
export const MAX_SUBSCRIPTION_CENTS = 55000;  // $550 maximum

/** Max courts at list price before annual fee caps ($550). */
export const MAX_COURTS_AT_LIST_PRICE = Math.floor(MAX_SUBSCRIPTION_CENTS / PER_COURT_CENTS);

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
