import { query, transaction } from '../database/connection';
import { createBooking } from './bookingService';
import { isFeatureEnabled } from './featureFlagService';
import { FEATURE_FLAGS } from '../../shared/constants/featureFlags';
import { courtBookingNeedsPayment, loadCourtPaymentSettings, computeCourtFeeCents } from './courtPaymentSettings';
import { createSplitCourtPaymentCheckoutSession, refundSplitPaymentShares, refundSplitShareDifference } from './stripeConnectService';
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
  const total = computeCourtFeeCents(court, params.durationMinutes);
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
    // Authorization is "is the viewer the owner or ANY participant" — but once authorized,
    // every share row for the booking must come back, not just the viewer's own. The old
    // WHERE (b.user_id = $2 OR s.user_id = $2) applied that OR per-JOINED-ROW, so a
    // non-owner viewer silently only ever got their own single row back (shares.length
    // effectively meaningless for them). Also aliases b.status/s.status distinctly —
    // both were previously unaliased "status" columns, so s.status silently clobbered
    // b.status in every row object.
    `SELECT b.id, b.user_id AS "ownerId", b.status AS "bookingStatus", b.payment_deadline_at AS "paymentDeadlineAt",
            s.user_id AS "userId", s.amount_cents AS "amountCents", s.status AS "status", s.paid_at AS "paidAt", u.full_name AS "fullName"
     FROM bookings b JOIN booking_payment_shares s ON s.booking_id = b.id JOIN users u ON u.id = s.user_id
     WHERE b.id = $1
       AND (b.user_id = $2 OR EXISTS (
         SELECT 1 FROM booking_payment_shares viewer_share
          WHERE viewer_share.booking_id = b.id AND viewer_share.user_id = $2
       ))
     ORDER BY u.full_name`, [bookingId, viewerId]);
  if (!result.rows.length) throw new Error('Split reservation not found');
  const first = result.rows[0];
  return { bookingId, ownerId: first.ownerId, status: first.bookingStatus, paymentDeadlineAt: first.paymentDeadlineAt, shares: result.rows };
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

/**
 * Organizer edits who is splitting the fee, while the hold is still open.
 *
 * The fee is fixed, so changing headcount changes everyone's even share. Each
 * already-paid member is auto-settled against their new amount:
 *   - unchanged (a straight swap)      → left alone, no money moves
 *   - lower (someone was added)        → partial refund of just the difference
 *   - higher (someone was removed)     → full refund, share reset to pending to re-pay
 * Removed members are always refunded in full. This keeps shares equal without
 * ever charging a card twice for the same amount.
 */
export async function updateSplitPaymentParticipants(params: {
  bookingId: string;
  actorUserId: string;
  participantIds: string[];
}): Promise<{ shares: Array<{ userId: string; amountCents: number; status: string }> }> {
  const bookingRes = await query(
    `SELECT b.id, b.user_id AS "ownerId", b.status, b.facility_id AS "facilityId", b.court_id AS "courtId",
            b.duration_minutes AS "durationMinutes", b.payment_mode AS "paymentMode", b.payment_deadline_at AS "deadline"
       FROM bookings b WHERE b.id = $1`,
    [params.bookingId]
  );
  const booking = bookingRes.rows[0];
  if (!booking || booking.paymentMode !== 'split') throw new Error('Split reservation not found');
  if (booking.ownerId !== params.actorUserId) throw new Error('Only the member who booked the court can change who is splitting it');
  if (booking.status !== 'pending') throw new Error('This reservation is no longer awaiting payment');
  if (booking.deadline && new Date(booking.deadline) <= new Date()) throw new Error('The payment window for this reservation has closed');

  const ids = [...new Set([booking.ownerId, ...params.participantIds])];
  if (ids.length < 2) throw new Error('Choose at least one other member to split this reservation');
  if (ids.length > MAX_PARTICIPANTS) throw new Error(`A split reservation can include at most ${MAX_PARTICIPANTS} people (you plus ${MAX_PARTICIPANTS - 1} others)`);

  const memberships = await query(
    `SELECT user_id FROM facility_memberships WHERE facility_id = $1 AND status = 'active' AND user_id = ANY($2::uuid[])`,
    [booking.facilityId, ids]
  );
  if (memberships.rows.length !== ids.length) throw new Error('Every participant must be an active facility member');

  const court = await loadCourtPaymentSettings(booking.courtId);
  if (!court) throw new Error('This court is no longer available');
  const total = computeCourtFeeCents(court, Number(booking.durationMinutes));
  if (total <= 0) throw new Error('This reservation has no fee to split');

  const existing = await query(
    `SELECT id, user_id AS "userId", amount_cents AS "amountCents", status
       FROM booking_payment_shares WHERE booking_id = $1`,
    [params.bookingId]
  );
  const currentById = new Map<string, any>(existing.rows.map((row: any) => [row.userId, row]));
  const newShares = splitEvenly(total, ids, booking.ownerId);

  const removed = existing.rows.filter((row: any) => !ids.includes(row.userId));
  const partialRefunds: Array<{ shareId: string; refundAmountCents: number }> = [];
  const resetToPending: string[] = [];

  for (const userId of ids) {
    const current = currentById.get(userId);
    if (!current || current.status !== 'paid') continue;
    const paid = Number(current.amountCents);
    const owed = newShares.get(userId)!;
    if (owed < paid) partialRefunds.push({ shareId: current.id, refundAmountCents: paid - owed });
    else if (owed > paid) resetToPending.push(current.id);
  }

  // Refund fully first: removed members, and members whose share went up (they re-pay the new amount).
  for (const row of removed) {
    if (row.status === 'paid') {
      await refundSplitShareDifference({ shareId: row.id, refundAmountCents: Number(row.amountCents) })
        .catch((error) => console.error(`[split-payment-roster] Refund failed for removed share ${row.id}:`, error));
    }
  }
  for (const shareId of resetToPending) {
    const row = existing.rows.find((r: any) => r.id === shareId);
    await refundSplitShareDifference({ shareId, refundAmountCents: Number(row.amountCents) })
      .catch((error) => console.error(`[split-payment-roster] Refund failed for share ${shareId}:`, error));
  }
  for (const refund of partialRefunds) {
    await refundSplitShareDifference(refund)
      .catch((error) => console.error(`[split-payment-roster] Partial refund failed for share ${refund.shareId}:`, error));
  }

  await transaction(async (client) => {
    if (removed.length) {
      await client.query(
        `UPDATE booking_payment_shares SET status = CASE WHEN status = 'paid' THEN 'refunded' ELSE 'cancelled' END, updated_at = NOW()
          WHERE id = ANY($1::uuid[])`,
        [removed.map((row: any) => row.id)]
      );
      await client.query(
        `DELETE FROM booking_participants WHERE booking_id = $1 AND user_id = ANY($2::uuid[])`,
        [params.bookingId, removed.map((row: any) => row.userId)]
      );
    }
    for (const userId of ids) {
      const current = currentById.get(userId);
      const amount = newShares.get(userId)!;
      if (!current) {
        await client.query(
          `INSERT INTO booking_participants (booking_id, user_id, added_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          [params.bookingId, userId, booking.ownerId]
        );
        await client.query(
          `INSERT INTO booking_payment_shares (booking_id, user_id, amount_cents, expires_at) VALUES ($1, $2, $3, $4)`,
          [params.bookingId, userId, amount, booking.deadline]
        );
        continue;
      }
      const mustRePay = resetToPending.includes(current.id);
      await client.query(
        `UPDATE booking_payment_shares
            SET amount_cents = $2,
                status = CASE WHEN $3::boolean THEN 'pending' ELSE status END,
                connect_payment_id = CASE WHEN $3::boolean THEN NULL ELSE connect_payment_id END,
                stripe_checkout_session_id = CASE WHEN $3::boolean THEN NULL ELSE stripe_checkout_session_id END,
                paid_at = CASE WHEN $3::boolean THEN NULL ELSE paid_at END,
                updated_at = NOW()
          WHERE id = $1`,
        [current.id, amount, mustRePay]
      );
    }
  });

  const { courtName, facilityName } = await loadBookingNoticeDetails(booking.courtId);
  const added = ids.filter((userId) => !currentById.has(userId));
  await Promise.all([
    ...added.map((userId) =>
      notificationService.createNotification(
        userId,
        'Split payment requested',
        `You were added to a ${courtName} reservation at ${facilityName}. Open My Reservations and select it to pay your share before the hold expires.`,
        'split_payment_requested',
        { actionUrl: '/reservations', priority: 'high' }
      ).catch((error) => console.error('Split payment invitation notification failed:', error))
    ),
    ...removed.map((row: any) =>
      notificationService.createNotification(
        row.userId,
        'Removed from split reservation',
        `You were removed from the ${courtName} reservation at ${facilityName}.${row.status === 'paid' ? ' Your payment has been refunded.' : ''}`,
        'split_payment_cancelled',
        { actionUrl: '/reservations', priority: 'high' }
      ).catch((error) => console.error('Split payment removal notification failed:', error))
    ),
    ...resetToPending.map((shareId) => {
      const row = existing.rows.find((r: any) => r.id === shareId);
      return notificationService.createNotification(
        row.userId,
        'Your split share changed',
        `The ${courtName} reservation at ${facilityName} now splits fewer ways, so your share went up. Your earlier payment was refunded — open My Reservations to pay the new amount before the hold expires.`,
        'split_payment_requested',
        { actionUrl: '/reservations', priority: 'high' }
      ).catch((error) => console.error('Split payment re-pay notification failed:', error));
    }),
  ]);

  // A roster change can leave every remaining share already paid (e.g. removing the
  // only unpaid member), which should confirm the booking just like a final payment.
  await confirmSplitBookingIfFullyPaid(params.bookingId);

  return {
    shares: ids.map((userId) => ({
      userId,
      amountCents: newShares.get(userId)!,
      status: resetToPending.includes(currentById.get(userId)?.id)
        ? 'pending'
        : currentById.get(userId)?.status ?? 'pending',
    })),
  };
}

/** Flips a split booking to confirmed once no share is left unpaid. */
async function confirmSplitBookingIfFullyPaid(bookingId: string): Promise<void> {
  await query(
    `UPDATE bookings SET status = 'confirmed', updated_at = NOW()
      WHERE id = $1 AND status = 'pending' AND payment_mode = 'split'
        AND NOT EXISTS (SELECT 1 FROM booking_payment_shares WHERE booking_id = $1 AND status != 'paid')`,
    [bookingId]
  );
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
