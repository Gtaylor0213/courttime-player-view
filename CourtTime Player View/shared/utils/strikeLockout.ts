export interface StrikeLockoutStatus {
  isLockedOut: boolean;
  activeStrikes: number;
  threshold: number;
  lockoutEndsAt?: string | null;
  facilityName?: string;
}

type ApiGet = (
  path: string
) => Promise<{ success: boolean; data?: unknown; error?: string }>;

export function parseStrikeLockoutStatus(data: unknown): StrikeLockoutStatus | null {
  if (!data || typeof data !== 'object') return null;
  const row = data as Record<string, unknown>;
  return {
    isLockedOut: Boolean(row.isLockedOut ?? row.is_locked_out),
    activeStrikes: Number(row.activeStrikes ?? row.active_strikes ?? 0),
    threshold: Number(row.threshold ?? 0),
    lockoutEndsAt:
      row.lockoutEndsAt != null
        ? String(row.lockoutEndsAt)
        : row.lockout_ends_at != null
          ? String(row.lockout_ends_at)
          : null,
    facilityName: row.facilityName ? String(row.facilityName) : undefined,
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
