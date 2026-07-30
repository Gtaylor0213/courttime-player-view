import { query, transaction } from '../database/connection';
import { createBooking } from './bookingService';
import { isFeatureEnabled } from './featureFlagService';
import { FEATURE_FLAGS } from '../../shared/constants/featureFlags';
import { courtBookingNeedsPayment, loadCourtPaymentSettings } from './courtPaymentSettings';
import { createSplitCourtPaymentCheckoutSession } from './stripeConnectService';
import { notificationService } from './notificationService';

const HOLD_MINUTES = 15;

function splitEvenly(total: number, userIds: string[], ownerId: string): Map<string, number> {
  const base = Math.floor(total / userIds.length);
  let remainder = total - base * userIds.length;
  return new Map(userIds.map((id) => {
    const extra = id === ownerId ? remainder : 0;
    if (id === ownerId) remainder = 0;
    return [id, base + extra];
  }));
}

export async function createSplitCourtReservation(params: {
  courtId: string; userId: string; facilityId: string; bookingDate: string; startTime: string; endTime: string;
  durationMinutes: number; bookingType?: string; notes?: string; participantIds: string[];
}): Promise<any> {
  if (!(await isFeatureEnabled(params.facilityId, FEATURE_FLAGS.SPLIT_COURT_PAYMENTS))) {
    throw new Error('Split court payments are not enabled for this facility');
  }
  const ids = [...new Set([params.userId, ...params.participantIds])];
  if (ids.length < 2) throw new Error('Choose at least one other member to split this reservation');
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
  const result = await createBooking({ ...params, skipPaymentCheck: true });
  if (!result.success || !result.booking?.id) return result;
  const deadline = new Date(Date.now() + HOLD_MINUTES * 60_000);
  const shares = splitEvenly(total, ids, params.userId);
  await transaction(async (client) => {
    await client.query(
      `UPDATE bookings SET status = 'pending', payment_mode = 'split', payment_deadline_at = $2, updated_at = NOW() WHERE id = $1`,
      [result.booking!.id, deadline]
    );
    for (const userId of ids) {
      await client.query(`INSERT INTO booking_participants (booking_id, user_id, added_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [result.booking!.id, userId, params.userId]);
      await client.query(
        `INSERT INTO booking_payment_shares (booking_id, user_id, amount_cents, expires_at) VALUES ($1, $2, $3, $4)`,
        [result.booking!.id, userId, shares.get(userId), deadline]
      );
    }
  });
  // The participant's reservation is already visible in My Reservations; make
  // that discoverable immediately instead of expecting the organizer to relay it.
  const details = await query(
    `SELECT c.name AS "courtName", f.name AS "facilityName"
       FROM courts c JOIN facilities f ON f.id = c.facility_id WHERE c.id = $1`,
    [params.courtId]
  );
  const courtName = details.rows[0]?.courtName || 'court reservation';
  const facilityName = details.rows[0]?.facilityName || 'your club';
  await Promise.all(
    ids.filter((userId) => userId !== params.userId).map((userId) =>
      notificationService.createNotification(
        userId,
        'Split payment requested',
        `You were added to a ${courtName} reservation at ${facilityName}. Open My Reservations and select it to pay your share before the 15-minute hold expires.`,
        'split_payment_requested',
        { actionUrl: '/reservations', priority: 'high' }
      ).catch((error) => console.error('Split payment invitation notification failed:', error))
    )
  );
  return { success: true, booking: { ...result.booking, status: 'pending' }, paymentDeadlineAt: deadline.toISOString(), shares: [...shares].map(([userId, amountCents]) => ({ userId, amountCents })) };
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

export async function finalizeSplitPayment(connectPaymentId: string): Promise<void> {
  await transaction(async (client) => {
    const res = await client.query(`SELECT booking_id, user_id FROM booking_payment_shares WHERE connect_payment_id = $1 FOR UPDATE`, [connectPaymentId]);
    const share = res.rows[0]; if (!share) return;
    await client.query(`UPDATE booking_payment_shares SET status = 'paid', paid_at = NOW(), updated_at = NOW() WHERE connect_payment_id = $1 AND status = 'pending'`, [connectPaymentId]);
    const pending = await client.query(`SELECT 1 FROM booking_payment_shares WHERE booking_id = $1 AND status != 'paid' LIMIT 1`, [share.booking_id]);
    if (!pending.rows.length) await client.query(`UPDATE bookings SET status = 'confirmed', updated_at = NOW() WHERE id = $1 AND status = 'pending'`, [share.booking_id]);
  });
}

/** Releases court holds whose participants did not all pay before the deadline. */
export async function expireSplitCourtReservations(): Promise<number> {
  const result = await transaction(async (client) => {
    const expired = await client.query(
      `UPDATE bookings SET status = 'cancelled', updated_at = NOW()
       WHERE status = 'pending' AND payment_mode = 'split' AND payment_deadline_at <= NOW()
       RETURNING id`
    );
    if (expired.rows.length) {
      await client.query(
        `UPDATE booking_payment_shares SET status = 'cancelled', updated_at = NOW()
         WHERE booking_id = ANY($1::uuid[]) AND status = 'pending'`,
        [expired.rows.map((row) => row.id)]
      );
    }
    return expired.rows.length;
  });
  return result;
}
