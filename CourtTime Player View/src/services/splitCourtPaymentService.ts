import { query, transaction } from '../database/connection';
import { createBooking } from './bookingService';
import { isFeatureEnabled } from './featureFlagService';
import { FEATURE_FLAGS } from '../../shared/constants/featureFlags';
import { courtBookingNeedsPayment, loadCourtPaymentSettings } from './courtPaymentSettings';
import { createSplitCourtPaymentCheckoutSession, refundSplitPaymentShares } from './stripeConnectService';
import { notificationService } from './notificationService';

const HOLD_MINUTES = 120;
const MAX_PARTICIPANTS = 4;

function splitEvenly(total: number, userIds: string[], ownerId: string): Map<string, number> {
  const base = Math.floor(total / userIds.length);
  let remainder = total - base * userIds.length;
  return new Map(userIds.map((id) => {
    const extra = id === ownerId ? remainder : 0;
    if (id === ownerId) remainder = 0;
    return [id, base + extra];
  }));
}

async function loadBookingNoticeDetails(courtId: string): Promise<{ courtName: string; facilityName: string }> {
  const details = await query(
    `SELECT c.name AS "courtName", f.name AS "facilityName"
       FROM courts c JOIN facilities f ON f.id = c.facility_id WHERE c.id = $1`,
    [courtId]
  );
  return {
    courtName: details.rows[0]?.courtName || 'court reservation',
    facilityName: details.rows[0]?.facilityName || 'your club',
  };
}

export async function createSplitCourtReservation(params: {
  courtId: string; userId: string; facilityId: string; bookingDate: string; startTime: string; endTime: string;
  durationMinutes: number; bookingType?: string; notes?: string; participantIds: string[];
  successUrl?: string; cancelUrl?: string;
}): Promise<any> {
  if (!(await isFeatureEnabled(params.facilityId, FEATURE_FLAGS.SPLIT_COURT_PAYMENTS))) {
    throw new Error('Split court payments are not enabled for this facility');
  }
  const ids = [...new Set([params.userId, ...params.participantIds])];
  if (ids.length < 2) throw new Error('Choose at least one other member to split this reservation');
  if (ids.length > MAX_PARTICIPANTS) throw new Error(`A split reservation can include at most ${MAX_PARTICIPANTS} people (you plus ${MAX_PARTICIPANTS - 1} others)`);
  const memberships = await query(
    `SELECT user_id FROM facility_memberships WHERE facility_id = $1 AND status = 'active' AND user_id = ANY($2::uuid[])`,
    [params.facilityId, ids]
  );
  if (memberships.rows.length !== ids.length) throw new Error('Every participant must be an active facility member');
  const court = await loadCourtPaymentSettings(params.courtId);
  if (!court || !courtBookingNeedsPayment(court, {})) throw new Error('This court does not require a payment');
  // Split v1 intentionally excludes add-ons: guests and machines have one clear owner, not an equal split.
  const total = Math.round(Number(court.booking_amount_cents) * (params.durationMinutes / 60));
  if (total <= 0) throw new Error('This reservation has no fee to split');

  const deadline = new Date(Date.now() + HOLD_MINUTES * 60_000);
  // Insert directly as pending/split so the slot is never briefly "confirmed" and unpaid —
  // a failure below leaves at worst a pending hold that self-expires, never an occupied
  // slot nobody is on the hook for.
  const result = await createBooking({
    ...params,
    skipPaymentCheck: true,
    initialStatus: 'pending',
    paymentMode: 'split',
    paymentDeadlineAt: deadline,
  });
  if (!result.success || !result.booking?.id) return result;
  const bookingId = result.booking.id;

  const shares = splitEvenly(total, ids, params.userId);
  const shareIds = new Map<string, string>();
  await transaction(async (client) => {
    for (const userId of ids) {
      await client.query(`INSERT INTO booking_participants (booking_id, user_id, added_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [bookingId, userId, params.userId]);
      const inserted = await client.query(
        `INSERT INTO booking_payment_shares (booking_id, user_id, amount_cents, expires_at) VALUES ($1, $2, $3, $4) RETURNING id`,
        [bookingId, userId, shares.get(userId), deadline]
      );
      shareIds.set(userId, inserted.rows[0].id);
    }
  });

  const { courtName, facilityName } = await loadBookingNoticeDetails(params.courtId);
  await Promise.all(
    ids.filter((userId) => userId !== params.userId).map((userId) =>
      notificationService.createNotification(
        userId,
        'Split payment requested',
        `You were added to a ${courtName} reservation at ${facilityName}. Open My Reservations and select it to pay your share before the 2-hour hold expires.`,
        'split_payment_requested',
        { actionUrl: '/reservations', priority: 'high' }
      ).catch((error) => console.error('Split payment invitation notification failed:', error))
    )
  );

  // The organizer's own share is charged immediately, just like a normal paid booking —
  // they shouldn't have to separately discover a "pay my share" button for money they
  // already committed to by creating the reservation.
  const base =
    params.successUrl?.replace(/\?.*$/, '').replace(/\/calendar$/, '') ||
    (process.env.NODE_ENV !== 'production'
      ? process.env.DEV_APP_URL || 'http://localhost:5173'
      : process.env.APP_URL || 'http://localhost:5173');
  const { url } = await createSplitCourtPaymentCheckoutSession({
    bookingId,
    shareId: shareIds.get(params.userId)!,
    facilityId: params.facilityId,
    memberId: params.userId,
    amountCents: shares.get(params.userId)!,
    successUrl: params.successUrl || `${base}/calendar?splitOrganizerPaymentSuccess=1`,
    cancelUrl: params.cancelUrl || `${base}/calendar?splitOrganizerPaymentCancelled=1`,
  });

  return {
    success: true,
    requiresPayment: true,
    checkoutUrl: url,
    booking: { ...result.booking, status: 'pending' },
    paymentDeadlineAt: deadline.toISOString(),
    shares: [...shares].map(([userId, amountCents]) => ({ userId, amountCents })),
  };
}

export async function getSplitPaymentSummary(bookingId: string, viewerId: string): Promise<any> {
  const result = await query(
    `SELECT b.id, b.user_id AS "ownerId", b.status, b.payment_deadline_at AS "paymentDeadlineAt", s.user_id AS "userId", s.amount_cents AS "amountCents", s.status, s.paid_at AS "paidAt", u.full_name AS "fullName"
     FROM bookings b JOIN booking_payment_shares s ON s.booking_id = b.id JOIN users u ON u.id = s.user_id
     WHERE b.id = $1 AND (b.user_id = $2 OR s.user_id = $2) ORDER BY u.full_name`, [bookingId, viewerId]);
  if (!result.rows.length) throw new Error('Split reservation not found');
  const first = result.rows[0];
  return { bookingId, ownerId: first.ownerId, status: first.status, paymentDeadlineAt: first.paymentDeadlineAt, shares: result.rows };
}

export async function checkoutSplitPayment(params: { bookingId: string; userId: string; successUrl: string; cancelUrl: string }): Promise<{ url: string }> {
  const row = await query(
    `SELECT s.id, s.amount_cents AS "amountCents", s.status AS "shareStatus", b.facility_id AS "facilityId", b.status AS "bookingStatus", b.payment_deadline_at AS "deadline"
     FROM booking_payment_shares s JOIN bookings b ON b.id = s.booking_id WHERE s.booking_id = $1 AND s.user_id = $2`, [params.bookingId, params.userId]);
  const share = row.rows[0];
  if (!share || share.shareStatus !== 'pending' || share.bookingStatus !== 'pending' || new Date(share.deadline) <= new Date()) throw new Error('This payment share is no longer available');
  return createSplitCourtPaymentCheckoutSession({ bookingId: params.bookingId, shareId: share.id, facilityId: share.facilityId, memberId: params.userId, amountCents: Number(share.amountCents), successUrl: params.successUrl, cancelUrl: params.cancelUrl });
}

/** A participant declines their share — strictly cancels the whole hold and refunds anyone already paid. */
export async function declineSplitPayment(bookingId: string, userId: string, reason?: string): Promise<void> {
  const row = await query(
    `SELECT s.id, s.status AS "shareStatus", b.status AS "bookingStatus"
       FROM booking_payment_shares s JOIN bookings b ON b.id = s.booking_id
      WHERE s.booking_id = $1 AND s.user_id = $2`,
    [bookingId, userId]
  );
  const share = row.rows[0];
  if (!share) throw new Error('You are not a participant in this split reservation');
  if (share.bookingStatus !== 'pending') throw new Error('This reservation is no longer pending payment');
  if (share.shareStatus !== 'pending') throw new Error('Your share has already been resolved');

  await transaction(async (client) => {
    await client.query(
      `UPDATE booking_payment_shares SET status = 'declined', responded_at = NOW(), decline_reason = $2, updated_at = NOW() WHERE id = $1`,
      [share.id, reason || null]
    );
    await client.query(`UPDATE bookings SET status = 'cancelled', updated_at = NOW() WHERE id = $1`, [bookingId]);
    await client.query(
      `UPDATE booking_payment_shares SET status = 'cancelled', updated_at = NOW() WHERE booking_id = $1 AND status = 'pending'`,
      [bookingId]
    );
  });

  const { refunded } = await refundSplitPaymentShares(bookingId);
  await notifySplitBookingCancelled(bookingId, 'declined', refunded > 0, userId);
}

export async function finalizeSplitPayment(connectPaymentId: string): Promise<void> {
  await transaction(async (client) => {
    const res = await client.query(`SELECT booking_id, user_id FROM booking_payment_shares WHERE connect_payment_id = $1 FOR UPDATE`, [connectPaymentId]);
    const share = res.rows[0]; if (!share) return;
    await client.query(`UPDATE booking_payment_shares SET status = 'paid', paid_at = NOW(), updated_at = NOW() WHERE connect_payment_id = $1 AND status = 'pending'`, [connectPaymentId]);
    const pending = await client.query(`SELECT 1 FROM booking_payment_shares WHERE booking_id = $1 AND status != 'paid' LIMIT 1`, [share.booking_id]);
    if (!pending.rows.length) await client.query(`UPDATE bookings SET status = 'confirmed', updated_at = NOW() WHERE id = $1 AND status = 'pending'`, [share.booking_id]);
  });
}

/** Releases court holds whose participants did not all pay before the deadline, refunding anyone who did. */
export async function expireSplitCourtReservations(): Promise<number> {
  const expired = await transaction(async (client) => {
    const rows = await client.query(
      `UPDATE bookings SET status = 'cancelled', updated_at = NOW()
       WHERE status = 'pending' AND payment_mode = 'split' AND payment_deadline_at <= NOW()
       RETURNING id`
    );
    if (rows.rows.length) {
      await client.query(
        `UPDATE booking_payment_shares SET status = 'cancelled', updated_at = NOW()
         WHERE booking_id = ANY($1::uuid[]) AND status = 'pending'`,
        [rows.rows.map((row) => row.id)]
      );
    }
    return rows.rows;
  });
  for (const row of expired) {
    const { refunded, failed } = await refundSplitPaymentShares(row.id);
    if (failed > 0) console.error(`[split-payment-expiry] ${failed} refund(s) failed for booking ${row.id}`);
    await notifySplitBookingCancelled(row.id, 'expired', refunded > 0).catch((error) =>
      console.error('Split payment expiry notification failed:', error)
    );
  }
  return expired.length;
}

/** Notifies everyone on a split reservation that the whole hold was cancelled, and why. */
export async function notifySplitBookingCancelled(
  bookingId: string,
  cause: 'declined' | 'expired' | 'cancelled',
  anyoneRefunded: boolean,
  excludeUserId?: string
): Promise<void> {
  const details = await query(
    `SELECT s.user_id AS "userId", c.name AS "courtName", f.name AS "facilityName"
       FROM booking_payment_shares s
       JOIN bookings b ON b.id = s.booking_id
       JOIN courts c ON c.id = b.court_id
       JOIN facilities f ON f.id = b.facility_id
      WHERE s.booking_id = $1`,
    [bookingId]
  );
  if (!details.rows.length) return;
  const { courtName, facilityName } = details.rows[0];
  const refundNote = anyoneRefunded ? ' Any payments made have been refunded.' : '';
  const message = {
    declined: `A participant declined their share of the ${courtName} reservation at ${facilityName}, so it was cancelled.${refundNote}`,
    expired: `Not everyone paid their share of the ${courtName} reservation at ${facilityName} in time, so it was cancelled.${refundNote}`,
    cancelled: `Your split ${courtName} reservation at ${facilityName} was cancelled.${refundNote}`,
  }[cause];
  await Promise.all(
    details.rows
      .map((row: any) => row.userId)
      .filter((userId: string) => userId !== excludeUserId)
      .map((userId: string) =>
        notificationService.createNotification(
          userId,
          'Split reservation cancelled',
          message,
          'split_payment_cancelled',
          { actionUrl: '/reservations', priority: 'high' }
        ).catch((error) => console.error('Split payment cancellation notification failed:', error))
      )
  );
}
