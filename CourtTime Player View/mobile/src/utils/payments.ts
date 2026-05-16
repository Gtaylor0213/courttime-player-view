import { Linking } from 'react-native';
import { unwrapApiPayload } from '../../../shared/api/core';

export function formatCentsAsUsd(cents?: number | null): string {
  if (cents == null || !Number.isFinite(cents)) return '';
  return `$${(cents / 100).toFixed(2)}`;
}

export function extractCheckoutUrl(data: unknown): string | null {
  const payload = unwrapApiPayload<{ checkoutUrl?: string; url?: string }>(data) ?? data;
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as { checkoutUrl?: string; url?: string };
  return record.checkoutUrl ?? record.url ?? null;
}

export async function openStripeCheckout(checkoutUrl: string): Promise<boolean> {
  try {
    const canOpen = await Linking.canOpenURL(checkoutUrl);
    if (!canOpen) return false;
    await Linking.openURL(checkoutUrl);
    return true;
  } catch {
    return false;
  }
}

export function courtRequiresPayment(court: {
  requirePayment?: boolean;
  bookingAmountCents?: number | null;
}): boolean {
  const cents = court.bookingAmountCents != null ? Number(court.bookingAmountCents) : 0;
  return Boolean(court.requirePayment && Number.isFinite(cents) && cents > 0);
}

export function courtGuestFeeCents(court: { guestFeeCents?: number | null }): number | null {
  const cents = court.guestFeeCents != null ? Number(court.guestFeeCents) : 0;
  return Number.isFinite(cents) && cents > 0 ? cents : null;
}

export function isPaidBulletinSignup(post: {
  requirePayment?: boolean;
  signupAmountCents?: number | null;
}): boolean {
  const cents = post.signupAmountCents != null ? Number(post.signupAmountCents) : 0;
  if (!Number.isFinite(cents) || cents <= 0) return false;
  if (post.requirePayment === false) return false;
  return post.requirePayment === true || cents > 0;
}
