/**
 * Convert a dollar amount (string or number) to integer cents without float drift
 * (e.g. avoids 25 → 2499 when using `parseFloat("24.99") * 100` patterns).
 */
export function parseDollarsToCents(value: string | number): number {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 0;
    return parseDollarsToCents(value.toFixed(2));
  }

  const normalized = String(value).trim().replace(/[$,\s]/g, '');
  if (!normalized) return 0;

  const match = normalized.match(/^(\d+)(?:\.(\d{0,2}))?/);
  if (!match) return 0;

  const dollars = parseInt(match[1], 10);
  const fraction = (match[2] ?? '').padEnd(2, '0').slice(0, 2);
  const centsPart = parseInt(fraction, 10);

  return dollars * 100 + centsPart;
}

/** Format integer cents as USD (e.g. 2500 → "$25.00"). */
export function formatCentsAsUsd(cents: number): string {
  const safe = Math.round(cents);
  const dollars = Math.trunc(safe / 100);
  const remainder = Math.abs(safe % 100);
  const amount = Number(`${dollars}.${String(remainder).padStart(2, '0')}`);
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}
