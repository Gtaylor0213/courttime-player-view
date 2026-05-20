import { parseApiBoolean } from '../../../shared/api/core';

export const EVENT_SIGNUP_TYPES = new Set([
  'event',
  'drill',
  'social',
  'clinic',
  'tournament',
]);

export const BULLETIN_ACTIVITY_BOOKING_TYPES = new Set([
  'clinic',
  'drill',
  'event',
  'tournament',
  'social',
]);

export interface BulletinPostView {
  id: string;
  title: string;
  description: string;
  type: string;
  facilityId: string;
  facilityName?: string;
  authorId?: string;
  authorName?: string;
  drillStartAt?: string;
  drillCourtName?: string;
  drillMaxParticipants?: number;
  maxParticipants?: number;
  minParticipants?: number;
  drillConfirmedCount?: number;
  drillWaitlistCount?: number;
  currentUserSignupStatus?: 'confirmed' | 'waitlist' | null;
  currentUserWaitlistPosition?: number | null;
  currentUserCanSignup?: boolean;
  signupBlockedReason?: string | null;
  requirePayment?: boolean;
  signupAmountCents?: number | null;
  drillShowParticipants?: boolean;
  participants?: Array<{
    userId: string;
    fullName: string;
    status: 'confirmed' | 'waitlist';
    waitlistPosition: number | null;
  }>;
}

export function isPaidSignupPost(post: {
  requirePayment?: boolean;
  signupAmountCents?: number | null;
}): boolean {
  const cents = post.signupAmountCents != null ? Number(post.signupAmountCents) : 0;
  if (!Number.isFinite(cents) || cents <= 0) return false;
  if (post.requirePayment === false) return false;
  return parseApiBoolean(post.requirePayment ?? true) || cents > 0;
}

export function formatSignupFee(cents?: number | null): string {
  if (cents == null || !Number.isFinite(Number(cents))) return '';
  return `$${(Number(cents) / 100).toFixed(2)}`;
}

export function bulletinSignupReturnUrls(
  postId: string,
  returnPath: 'bulletin-board' | 'calendar' = 'bulletin-board'
) {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const base = origin || '';
  const path = returnPath === 'calendar' ? '/calendar' : '/bulletin-board';
  return {
    successUrl: `${base}${path}?signupSuccess=1&postId=${encodeURIComponent(postId)}&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${base}${path}?postId=${encodeURIComponent(postId)}`,
  };
}

export function mapPostFromApi(post: Record<string, unknown>): BulletinPostView {
  return {
    id: String(post.id),
    title: String(post.title),
    description: String(post.content || post.description || ''),
    type: String(post.category || post.type || 'announcement'),
    facilityId: String(post.facilityId),
    facilityName: post.facilityName ? String(post.facilityName) : undefined,
    authorId: post.authorId ? String(post.authorId) : undefined,
    authorName: post.authorName ? String(post.authorName) : 'Unknown',
    drillStartAt: post.drillStartAt ? String(post.drillStartAt) : undefined,
    drillCourtName: post.drillCourtName ? String(post.drillCourtName) : undefined,
    drillMaxParticipants:
      post.drillMaxParticipants != null ? Number(post.drillMaxParticipants) : undefined,
    maxParticipants: post.maxParticipants != null ? Number(post.maxParticipants) : undefined,
    minParticipants: post.minParticipants != null ? Number(post.minParticipants) : undefined,
    drillConfirmedCount:
      post.drillConfirmedCount != null ? Number(post.drillConfirmedCount) : undefined,
    drillWaitlistCount:
      post.drillWaitlistCount != null ? Number(post.drillWaitlistCount) : undefined,
    currentUserSignupStatus: post.currentUserSignupStatus as BulletinPostView['currentUserSignupStatus'],
    currentUserWaitlistPosition: post.currentUserWaitlistPosition as number | null | undefined,
    currentUserCanSignup: post.currentUserCanSignup as boolean | undefined,
    signupBlockedReason: post.signupBlockedReason ? String(post.signupBlockedReason) : null,
    requirePayment: parseApiBoolean(post.requirePayment ?? post.require_payment),
    signupAmountCents:
      post.signupAmountCents != null && post.signupAmountCents !== ''
        ? Number(post.signupAmountCents)
        : post.signup_amount_cents != null
          ? Number(post.signup_amount_cents)
          : null,
    drillShowParticipants: Boolean(post.drillShowParticipants),
    participants: (post.participants as BulletinPostView['participants']) || [],
  };
}

export function isBulletinActivityBooking(booking: {
  bulletinPostId?: string | null;
  bookingType?: string | null;
}): boolean {
  if (booking.bulletinPostId) return true;
  const t = String(booking.bookingType || '').toLowerCase();
  return BULLETIN_ACTIVITY_BOOKING_TYPES.has(t);
}

function bulletinPostType(post: { type?: string; category?: string }): string {
  return String(post.type || post.category || '').toLowerCase();
}

/** When the post is for a scheduled activity, returns when it happens; otherwise optional legacy event date. */
export function getBulletinPostEventAt(post: {
  type?: string;
  category?: string;
  drillStartAt?: string | null;
  eventDate?: string | null;
  eventTime?: string | null;
}): Date | null {
  const type = bulletinPostType(post);

  if (post.drillStartAt) {
    const d = new Date(post.drillStartAt);
    if (!Number.isNaN(d.getTime())) return d;
  }

  if (EVENT_SIGNUP_TYPES.has(type)) return null;

  if (post.eventDate) {
    const datePart = String(post.eventDate).split('T')[0];
    const timePart = post.eventTime ? String(post.eventTime).trim() : '00:00';
    const combined = new Date(`${datePart}T${timePart}`);
    if (!Number.isNaN(combined.getTime())) return combined;
    const fallback = new Date(post.eventDate);
    if (!Number.isNaN(fallback.getTime())) return fallback;
  }

  return null;
}

/** Date shown prominently on cards (event date when scheduled, otherwise posted date). */
export function getBulletinPostProminentDate(post: {
  type?: string;
  category?: string;
  drillStartAt?: string | null;
  eventDate?: string | null;
  eventTime?: string | null;
  createdAt?: string | null;
  postedDate?: string | null;
}): Date | null {
  const eventAt = getBulletinPostEventAt(post);
  if (eventAt) return eventAt;

  const posted = post.createdAt || post.postedDate;
  if (!posted) return null;
  const d = new Date(posted);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function getBulletinPostSortTimestamp(post: Parameters<typeof getBulletinPostProminentDate>[0]): number {
  return getBulletinPostProminentDate(post)?.getTime() ?? 0;
}

type BulletinDateFormat = 'card' | 'cardWithTime' | 'detail' | 'short';

export function formatBulletinPostDate(
  date: Date,
  format: BulletinDateFormat = 'card'
): string {
  switch (format) {
    case 'cardWithTime':
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    case 'detail':
      return date.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
    case 'short':
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    case 'card':
    default:
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
  }
}

export function formatBulletinPostProminentDate(
  post: Parameters<typeof getBulletinPostProminentDate>[0],
  format: BulletinDateFormat = 'short'
): string {
  const date = getBulletinPostProminentDate(post);
  if (!date) return '';
  const type = bulletinPostType(post);
  const useTime =
    EVENT_SIGNUP_TYPES.has(type) &&
    Boolean(post.drillStartAt) &&
    (format === 'short' || format === 'cardWithTime');
  return formatBulletinPostDate(date, useTime ? 'cardWithTime' : format);
}
