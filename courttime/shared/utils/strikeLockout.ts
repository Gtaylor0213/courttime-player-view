import { unwrapApiPayload } from '../api/core';

export interface StrikeLockoutStatus {
  isLockedOut: boolean;
  activeStrikes: number;
  threshold: number;
  lockoutEndsAt?: string | null;
  facilityName?: string;
  strikeSystemEnabled?: boolean;
}

export interface StrikeLockoutConfig {
  strike_threshold: number;
  strike_window_days: number;
  lockout_days: number;
}

export interface StrikeRecordForLockout {
  issuedAt: string | Date;
  revoked?: boolean;
  expiresAt?: string | Date | null;
}

type ApiGet = (
  path: string
) => Promise<{ success: boolean; data?: unknown; error?: string }>;

function toPositiveInt(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.floor(n);
}

/** Normalize ACC-009 rule config from DB / admin forms. */
export function parseStrikeRuleConfig(raw: unknown): StrikeLockoutConfig {
  const c = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    strike_threshold: toPositiveInt(c.strike_threshold, 3),
    strike_window_days: toPositiveInt(c.strike_window_days, 30),
    lockout_days: toPositiveInt(c.lockout_days, 7),
  };
}

/**
 * Single source of truth for strike lockout (matches booking rules ACC-009).
 * Locked only when active strikes meet threshold AND lockout period has not ended.
 */
export function evaluateStrikeLockout(
  strikes: StrikeRecordForLockout[],
  config: StrikeLockoutConfig,
  now: Date = new Date()
): StrikeLockoutStatus {
  const windowStart = new Date(now);
  windowStart.setDate(windowStart.getDate() - config.strike_window_days);

  const activeStrikes = strikes.filter((strike) => {
    if (strike.revoked) return false;
    if (strike.expiresAt != null && new Date(strike.expiresAt) <= now) return false;
    const issuedAt = new Date(strike.issuedAt);
    return issuedAt >= windowStart;
  });

  const threshold = config.strike_threshold;
  const count = activeStrikes.length;

  if (count < threshold) {
    return {
      isLockedOut: false,
      activeStrikes: count,
      threshold,
      lockoutEndsAt: null,
      strikeSystemEnabled: true,
    };
  }

  const mostRecent = activeStrikes.reduce((latest, strike) =>
    new Date(strike.issuedAt) > new Date(latest.issuedAt) ? strike : latest
  );
  const lockoutEnds = new Date(mostRecent.issuedAt);
  lockoutEnds.setDate(lockoutEnds.getDate() + config.lockout_days);

  const isLockedOut = lockoutEnds > now;

  return {
    isLockedOut,
    activeStrikes: count,
    threshold,
    lockoutEndsAt: isLockedOut ? lockoutEnds.toISOString() : null,
    strikeSystemEnabled: true,
  };
}

export function parseStrikeLockoutStatus(data: unknown): StrikeLockoutStatus | null {
  const payload = unwrapApiPayload<Record<string, unknown>>(data) ?? data;
  if (!payload || typeof payload !== 'object') return null;
  const row = payload as Record<string, unknown>;

  const isLockedOut = row.isLockedOut ?? row.is_locked_out;
  if (isLockedOut === undefined && row.activeStrikes === undefined && row.active_strikes === undefined) {
    return null;
  }

  return {
    isLockedOut: isLockedOut === true || isLockedOut === 'true',
    activeStrikes: Number(row.activeStrikes ?? row.active_strikes ?? 0),
    threshold: Number(row.threshold ?? 0),
    lockoutEndsAt:
      row.lockoutEndsAt != null
        ? String(row.lockoutEndsAt)
        : row.lockout_ends_at != null
          ? String(row.lockout_ends_at)
          : null,
    facilityName: row.facilityName ? String(row.facilityName) : undefined,
    strikeSystemEnabled:
      row.strikeSystemEnabled !== undefined
        ? row.strikeSystemEnabled === true || row.strikeSystemEnabled === 'true'
        : undefined,
  };
}

export async function fetchStrikeLockout(
  apiGet: ApiGet,
  userId: string,
  facilityId: string
): Promise<StrikeLockoutStatus | null> {
  const res = await apiGet(
    `/api/strikes/check/${encodeURIComponent(userId)}?facilityId=${encodeURIComponent(facilityId)}`
  );
  if (!res.success) return null;
  return parseStrikeLockoutStatus(res.data);
}

export function formatLockoutEndDate(iso?: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function strikeLockoutMessage(status: StrikeLockoutStatus): string {
  const strikes = `You have ${status.activeStrikes} strike${status.activeStrikes !== 1 ? 's' : ''} (threshold: ${status.threshold}).`;
  const end = status.lockoutEndsAt
    ? ` Lockout ends ${formatLockoutEndDate(status.lockoutEndsAt)}.`
    : '';
  return strikes + end;
}

export function strikeWarningMessage(status: StrikeLockoutStatus): string {
  return `You have ${status.activeStrikes} of ${status.threshold} strikes. Additional violations may result in a lockout.`;
}
