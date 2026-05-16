export type AdminLockoutMember = {
  userId: string;
  fullName: string;
  email: string;
  isPaymentLocked: boolean;
  lockoutAmountCents?: number | null;
};

export function parseAdminLockoutMembers(raw: unknown): AdminLockoutMember[] {
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map((m: Record<string, unknown>) => {
      const userId = String(m.userId ?? m.id ?? '').trim();
      if (!userId) return null;
      return {
        userId,
        fullName: String(m.fullName ?? m.userName ?? m.name ?? 'Member').trim() || 'Member',
        email: String(m.email ?? '').trim(),
        isPaymentLocked: Boolean(m.isPaymentLocked),
        lockoutAmountCents:
          typeof m.lockoutAmountCents === 'number' ? m.lockoutAmountCents : null,
      };
    })
    .filter((m): m is AdminLockoutMember => m !== null);
}

export function filterMembersBySearch(
  members: AdminLockoutMember[],
  query: string
): AdminLockoutMember[] {
  const q = query.trim().toLowerCase();
  if (!q) return members;
  return members.filter(
    (m) =>
      m.fullName.toLowerCase().includes(q) ||
      m.email.toLowerCase().includes(q) ||
      m.userId.toLowerCase().includes(q)
  );
}

/** Matches web MemberManagement payment lock badge copy. */
export function paymentLockBadgeLabel(
  member: Pick<AdminLockoutMember, 'isPaymentLocked' | 'lockoutAmountCents'>
): string | null {
  if (!member.isPaymentLocked) return null;
  if (member.lockoutAmountCents && member.lockoutAmountCents > 0) {
    return `Payment Locked · $${(member.lockoutAmountCents / 100).toFixed(2)}`;
  }
  return 'Payment Locked';
}

export function parseLockoutAmountCents(
  dollarsInput: string
): { ok: true; cents: number } | { ok: false; message: string } {
  const amount = Number(dollarsInput);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, message: 'Enter a valid amount greater than $0' };
  }
  return { ok: true, cents: Math.round(amount * 100) };
}
