export interface PaymentLockoutInfo {
  facilityId?: string;
  facilityName?: string;
  lockedAt?: string;
  amountCents?: number | null;
  description?: string | null;
}

type LockoutListener = (info: PaymentLockoutInfo | null) => void;

const listeners = new Set<LockoutListener>();

export function subscribePaymentLockout(listener: LockoutListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitPaymentLocked(info: PaymentLockoutInfo): void {
  for (const listener of listeners) listener(info);
}

export function emitPaymentUnlocked(): void {
  for (const listener of listeners) listener(null);
}

export function normalizeLockoutPayload(raw: unknown): PaymentLockoutInfo | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const lockout = (record.lockout ?? record) as Record<string, unknown>;
  if (!lockout.facilityId && !lockout.facilityName) return null;
  return {
    facilityId: lockout.facilityId as string | undefined,
    facilityName: lockout.facilityName as string | undefined,
    lockedAt: lockout.lockedAt as string | undefined,
    amountCents: (lockout.amountCents as number | null | undefined) ?? null,
    description: (lockout.description as string | null | undefined) ?? null,
  };
}
