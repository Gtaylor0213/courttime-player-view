import { query, transaction } from '../database/connection';
import { FEATURE_FLAGS } from '../../shared/constants/featureFlags';
import { isFeatureEnabled } from './featureFlagService';
import { courtBookingNeedsPayment, loadCourtPaymentSettings } from './courtPaymentSettings';
import { getStripe } from './stripeConnectService';

export type SettlementStatus =
  | 'not_applicable'
  | 'unsettled'
  | 'settling'
  | 'settled'
  | 'cancelled_unpaid';

export type SettlementChargeStatus = 'pending' | 'charged' | 'failed' | 'cash' | 'waived';

export interface BookingParticipant {
  id: string;
  bookingId: string;
  userId: string;
  fullName: string;
  email: string;
  addedBy: string | null;
  addedAt: string;
  hasSavedCard: boolean;
  cardLast4: string | null;
}

export interface SettlementChargeLine {
  id: string;
  bookingId: string;
  userId: string;
  fullName: string;
  email: string;
  amountCents: number;
  status: SettlementChargeStatus;
  stripePaymentIntentId: string | null;
  errorMessage: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
}

export interface SettlementPreview {
  bookingId: string;
  settlementStatus: SettlementStatus;
  courtFeeCents: number;
  guestFeeCents: number;
  ballMachineFeeCents: number;
  totalCents: number;
  lines: Array<{
    userId: string;
    fullName: string;
    email: string;
    amountCents: number;
    isOwner: boolean;
    hasSavedCard: boolean;
    cardLast4: string | null;
  }>;
}

async function assertCanManageRoster(
  bookingId: string,
  actorUserId: string
): Promise<{
  facilityId: string;
  ownerId: string;
  settlementStatus: SettlementStatus;
  isAdmin: boolean;
  isOwner: boolean;
}> {
  const result = await query(
    `SELECT
       b.facility_id AS "facilityId",
       b.user_id AS "ownerId",
       b.settlement_status AS "settlementStatus",
       b.status
     FROM bookings b
     WHERE b.id = $1`,
    [bookingId]
  );
  const booking = result.rows[0];
  if (!booking) throw new Error('Booking not found');
  if (booking.status === 'cancelled') throw new Error('Booking is cancelled');

  const isOwner = booking.ownerId === actorUserId;
  const adminResult = await query(
    `SELECT 1 FROM facility_admins
     WHERE user_id = $1 AND facility_id = $2 AND status = 'active'
     LIMIT 1`,
    [actorUserId, booking.facilityId]
  );
  const membershipAdmin = await query(
    `SELECT 1 FROM facility_memberships
     WHERE user_id = $1 AND facility_id = $2 AND is_facility_admin = true
     LIMIT 1`,
    [actorUserId, booking.facilityId]
  );
  const isAdmin = adminResult.rows.length > 0 || membershipAdmin.rows.length > 0;

  if (!isOwner && !isAdmin) throw new Error('Not authorized to manage this reservation');

  return {
    facilityId: booking.facilityId,
    ownerId: booking.ownerId,
    settlementStatus: booking.settlementStatus,
    isAdmin,
    isOwner,
  };
}

async function assertFacilityAdmin(actorUserId: string, facilityId: string): Promise<void> {
  const adminResult = await query(
    `SELECT 1 FROM facility_admins
     WHERE user_id = $1 AND facility_id = $2 AND status = 'active'
     LIMIT 1`,
    [actorUserId, facilityId]
  );
  const membershipAdmin = await query(
    `SELECT 1 FROM facility_memberships
     WHERE user_id = $1 AND facility_id = $2 AND is_facility_admin = true
     LIMIT 1`,
    [actorUserId, facilityId]
  );
  if (adminResult.rows.length === 0 && membershipAdmin.rows.length === 0) {
    throw new Error('Facility admin access required');
  }
}

export async function seedBookingOwnerParticipant(
  bookingId: string,
  ownerUserId: string,
  addedBy?: string | null
): Promise<void> {
  await query(
    `INSERT INTO booking_participants (booking_id, user_id, added_by)
     VALUES ($1, $2, $3)
     ON CONFLICT (booking_id, user_id) DO NOTHING`,
    [bookingId, ownerUserId, addedBy ?? ownerUserId]
  );
}

export async function listBookingParticipants(bookingId: string): Promise<BookingParticipant[]> {
  const result = await query(
    `SELECT
       bp.id,
       bp.booking_id AS "bookingId",
       bp.user_id AS "userId",
       u.full_name AS "fullName",
       u.email,
       bp.added_by AS "addedBy",
       bp.added_at AS "addedAt",
       (fm.stripe_default_payment_method_id IS NOT NULL AND fm.card_last4 IS NOT NULL) AS "hasSavedCard",
       fm.card_last4 AS "cardLast4"
     FROM booking_participants bp
     JOIN users u ON u.id = bp.user_id
     JOIN bookings b ON b.id = bp.booking_id
     LEFT JOIN facility_memberships fm
       ON fm.user_id = bp.user_id AND fm.facility_id = b.facility_id
     WHERE bp.booking_id = $1
     ORDER BY bp.added_at ASC, u.full_name ASC`,
    [bookingId]
  );
  return result.rows.map((row) => ({
    ...row,
    hasSavedCard: row.hasSavedCard === true,
  }));
}

export async function addBookingParticipant(params: {
  bookingId: string;
  userId: string;
  actorUserId: string;
}): Promise<BookingParticipant[]> {
  const meta = await assertCanManageRoster(params.bookingId, params.actorUserId);
  if (!['unsettled'].includes(meta.settlementStatus)) {
    throw new Error('Roster can only be changed before the reservation is settled');
  }
  if (!(await isFeatureEnabled(meta.facilityId, FEATURE_FLAGS.POST_PLAY_SETTLEMENT))) {
    throw new Error('Post-play settlement is not enabled for this facility');
  }

  const membership = await query(
    `SELECT 1 FROM facility_memberships
     WHERE user_id = $1 AND facility_id = $2 AND status = 'active'
     LIMIT 1`,
    [params.userId, meta.facilityId]
  );
  if (membership.rows.length === 0) {
    throw new Error('User is not an active member of this facility');
  }

  await query(
    `INSERT INTO booking_participants (booking_id, user_id, added_by)
     VALUES ($1, $2, $3)
     ON CONFLICT (booking_id, user_id) DO NOTHING`,
    [params.bookingId, params.userId, params.actorUserId]
  );

  return listBookingParticipants(params.bookingId);
}

export async function removeBookingParticipant(params: {
  bookingId: string;
  userId: string;
  actorUserId: string;
}): Promise<BookingParticipant[]> {
  const meta = await assertCanManageRoster(params.bookingId, params.actorUserId);
  if (!['unsettled'].includes(meta.settlementStatus)) {
    throw new Error('Roster can only be changed before the reservation is settled');
  }
  if (params.userId === meta.ownerId) {
    throw new Error('Cannot remove the reservation owner from the roster');
  }

  await query(
    `DELETE FROM booking_participants WHERE booking_id = $1 AND user_id = $2`,
    [params.bookingId, params.userId]
  );

  return listBookingParticipants(params.bookingId);
}

function computeSettlementAmounts(params: {
  ownerId: string;
  participantIds: string[];
  bookingAmountCents: number | null;
  requirePayment: boolean;
  guestFeeCents: number | null;
  ballMachineFeeCents: number | null;
  durationMinutes: number;
  bringGuest: boolean;
  addBallMachine: boolean;
}): {
  courtFeeCents: number;
  guestFeeCents: number;
  ballMachineFeeCents: number;
  totalCents: number;
  amountsByUser: Map<string, number>;
} {
  const hours = params.durationMinutes > 0 ? params.durationMinutes / 60 : 1;
  const courtFeeCents =
    params.requirePayment && params.bookingAmountCents
      ? Math.round(Number(params.bookingAmountCents) * hours)
      : 0;
  const guestFeeCents =
    params.bringGuest && params.guestFeeCents ? Number(params.guestFeeCents) : 0;
  const ballMachineFeeCents =
    params.addBallMachine && params.ballMachineFeeCents
      ? Math.round(Number(params.ballMachineFeeCents) * hours)
      : 0;

  const n = Math.max(1, params.participantIds.length);
  const baseShare = Math.floor(courtFeeCents / n);
  const remainder = courtFeeCents - baseShare * n;

  const amountsByUser = new Map<string, number>();
  for (const userId of params.participantIds) {
    let amount = baseShare;
    if (userId === params.ownerId) {
      amount += remainder + guestFeeCents + ballMachineFeeCents;
    }
    amountsByUser.set(userId, amount);
  }

  // If owner is somehow missing from roster, put remainder + add-ons on first participant
  if (!amountsByUser.has(params.ownerId) && params.participantIds.length > 0) {
    const first = params.participantIds[0];
    amountsByUser.set(
      first,
      (amountsByUser.get(first) || 0) + remainder + guestFeeCents + ballMachineFeeCents
    );
  }

  return {
    courtFeeCents,
    guestFeeCents,
    ballMachineFeeCents,
    totalCents: courtFeeCents + guestFeeCents + ballMachineFeeCents,
    amountsByUser,
  };
}

export async function previewSettlement(
  bookingId: string,
  actorUserId: string
): Promise<SettlementPreview> {
  const bookingResult = await query(
    `SELECT
       b.id,
       b.user_id AS "ownerId",
       b.facility_id AS "facilityId",
       b.court_id AS "courtId",
       b.duration_minutes AS "durationMinutes",
       b.settlement_status AS "settlementStatus",
       COALESCE(b.bring_guest, false) AS "bringGuest",
       COALESCE(b.add_ball_machine, false) AS "addBallMachine",
       b.status
     FROM bookings b
     WHERE b.id = $1`,
    [bookingId]
  );
  const booking = bookingResult.rows[0];
  if (!booking) throw new Error('Booking not found');
  if (booking.status === 'cancelled') throw new Error('Booking is cancelled');

  await assertFacilityAdmin(actorUserId, booking.facilityId);

  const participants = await listBookingParticipants(bookingId);
  if (participants.length === 0) {
    throw new Error('No participants on this reservation');
  }

  const court = await loadCourtPaymentSettings(booking.courtId);
  const computed = computeSettlementAmounts({
    ownerId: booking.ownerId,
    participantIds: participants.map((p) => p.userId),
    bookingAmountCents: court?.booking_amount_cents ?? null,
    requirePayment: Boolean(court?.require_payment),
    guestFeeCents: court?.guest_fee_cents ?? null,
    ballMachineFeeCents: court?.ball_machine_fee_cents ?? null,
    durationMinutes: Number(booking.durationMinutes) || 60,
    bringGuest: booking.bringGuest === true,
    addBallMachine: booking.addBallMachine === true,
  });

  return {
    bookingId,
    settlementStatus: booking.settlementStatus,
    courtFeeCents: computed.courtFeeCents,
    guestFeeCents: computed.guestFeeCents,
    ballMachineFeeCents: computed.ballMachineFeeCents,
    totalCents: computed.totalCents,
    lines: participants.map((p) => ({
      userId: p.userId,
      fullName: p.fullName,
      email: p.email,
      amountCents: computed.amountsByUser.get(p.userId) || 0,
      isOwner: p.userId === booking.ownerId,
      hasSavedCard: p.hasSavedCard,
      cardLast4: p.cardLast4,
    })),
  };
}

export async function listSettlementCharges(bookingId: string): Promise<SettlementChargeLine[]> {
  const result = await query(
    `SELECT
       c.id,
       c.booking_id AS "bookingId",
       c.user_id AS "userId",
       u.full_name AS "fullName",
       u.email,
       c.amount_cents AS "amountCents",
       c.status,
       c.stripe_payment_intent_id AS "stripePaymentIntentId",
       c.error_message AS "errorMessage",
       c.resolved_by AS "resolvedBy",
       c.resolved_at AS "resolvedAt"
     FROM booking_settlement_charges c
     JOIN users u ON u.id = c.user_id
     WHERE c.booking_id = $1
     ORDER BY u.full_name ASC`,
    [bookingId]
  );
  return result.rows;
}

async function refreshBookingSettlementStatus(bookingId: string, settledBy?: string): Promise<SettlementStatus> {
  const charges = await query(
    `SELECT status FROM booking_settlement_charges WHERE booking_id = $1`,
    [bookingId]
  );
  if (charges.rows.length === 0) {
    await query(
      `UPDATE bookings
       SET settlement_status = 'unsettled', settled_at = NULL, settled_by = NULL, updated_at = NOW()
       WHERE id = $1 AND settlement_status IN ('unsettled', 'settling')`,
      [bookingId]
    );
    return 'unsettled';
  }

  const allResolved = charges.rows.every((r) =>
    ['charged', 'cash', 'waived'].includes(r.status)
  );
  if (allResolved) {
    await query(
      `UPDATE bookings
       SET settlement_status = 'settled',
           settled_at = NOW(),
           settled_by = COALESCE($2, settled_by),
           status = CASE WHEN status = 'confirmed' THEN 'completed' ELSE status END,
           updated_at = NOW()
       WHERE id = $1`,
      [bookingId, settledBy ?? null]
    );
    return 'settled';
  }

  await query(
    `UPDATE bookings
     SET settlement_status = 'settling', settled_at = NULL, updated_at = NOW()
     WHERE id = $1`,
    [bookingId]
  );
  return 'settling';
}

export async function closeOutBooking(params: {
  bookingId: string;
  actorUserId: string;
}): Promise<{
  settlementStatus: SettlementStatus;
  charges: SettlementChargeLine[];
  preview: SettlementPreview;
}> {
  const preview = await previewSettlement(params.bookingId, params.actorUserId);
  if (!['unsettled', 'settling'].includes(preview.settlementStatus)) {
    throw new Error('This reservation is already settled or not eligible for close-out');
  }
  if (preview.totalCents <= 0) {
    await query(
      `UPDATE bookings
       SET settlement_status = 'settled', settled_at = NOW(), settled_by = $2,
           status = CASE WHEN status = 'confirmed' THEN 'completed' ELSE status END,
           updated_at = NOW()
       WHERE id = $1`,
      [params.bookingId, params.actorUserId]
    );
    return {
      settlementStatus: 'settled',
      charges: [],
      preview,
    };
  }

  const bookingMeta = await query(
    `SELECT facility_id AS "facilityId", court_id AS "courtId" FROM bookings WHERE id = $1`,
    [params.bookingId]
  );
  const facilityId = bookingMeta.rows[0].facilityId;

  const facility = await query(
    `SELECT stripe_account_id, stripe_onboarded, platform_fee_percent
     FROM facilities WHERE id = $1`,
    [facilityId]
  );
  const stripeAccountId = facility.rows[0]?.stripe_account_id as string | null;
  const stripeOnboarded = facility.rows[0]?.stripe_onboarded === true;
  const platformFeePercent = Number(facility.rows[0]?.platform_fee_percent ?? 0);

  await query(
    `UPDATE bookings SET settlement_status = 'settling', updated_at = NOW() WHERE id = $1`,
    [params.bookingId]
  );

  const stripe = getStripe();

  for (const line of preview.lines) {
    if (line.amountCents <= 0) {
      await query(
        `INSERT INTO booking_settlement_charges
           (booking_id, user_id, amount_cents, status, resolved_by, resolved_at, updated_at)
         VALUES ($1, $2, 0, 'waived', $3, NOW(), NOW())
         ON CONFLICT (booking_id, user_id) DO UPDATE
           SET amount_cents = 0, status = 'waived', resolved_by = $3, resolved_at = NOW(),
               error_message = NULL, updated_at = NOW()
           WHERE booking_settlement_charges.status NOT IN ('charged', 'cash', 'waived')`,
        [params.bookingId, line.userId, params.actorUserId]
      );
      continue;
    }

    const existing = await query(
      `SELECT status FROM booking_settlement_charges
       WHERE booking_id = $1 AND user_id = $2`,
      [params.bookingId, line.userId]
    );
    if (existing.rows[0] && ['charged', 'cash', 'waived'].includes(existing.rows[0].status)) {
      continue;
    }

    const member = await query(
      `SELECT stripe_customer_id, stripe_default_payment_method_id, card_last4
       FROM facility_memberships
       WHERE user_id = $1 AND facility_id = $2`,
      [line.userId, facilityId]
    );
    const m = member.rows[0];
    const hasCard =
      !!m?.stripe_customer_id &&
      !!m?.stripe_default_payment_method_id &&
      !!m?.card_last4;

    if (!hasCard || !stripe || !stripeAccountId || !stripeOnboarded) {
      const err = !hasCard
        ? 'No saved card on file'
        : 'Stripe is not configured for this facility';
      await query(
        `INSERT INTO booking_settlement_charges
           (booking_id, user_id, amount_cents, status, error_message, updated_at)
         VALUES ($1, $2, $3, 'failed', $4, NOW())
         ON CONFLICT (booking_id, user_id) DO UPDATE
           SET amount_cents = $3, status = 'failed', error_message = $4,
               stripe_payment_intent_id = NULL, updated_at = NOW()
           WHERE booking_settlement_charges.status NOT IN ('charged', 'cash', 'waived')`,
        [params.bookingId, line.userId, line.amountCents, err]
      );
      continue;
    }

    const platformFeeCents = Math.max(
      0,
      Math.round((line.amountCents * platformFeePercent) / 100)
    );

    try {
      const pi = await stripe.paymentIntents.create(
        {
          amount: line.amountCents,
          currency: 'usd',
          customer: m.stripe_customer_id,
          payment_method: m.stripe_default_payment_method_id,
          off_session: true,
          confirm: true,
          application_fee_amount: platformFeeCents > 0 ? platformFeeCents : undefined,
          description: `Court reservation close-out (${params.bookingId})`,
          metadata: {
            booking_id: params.bookingId,
            facility_id: facilityId,
            settlement: 'post_play',
          },
        },
        { stripeAccount: stripeAccountId }
      );

      await query(
        `INSERT INTO booking_settlement_charges
           (booking_id, user_id, amount_cents, status, stripe_payment_intent_id,
            resolved_by, resolved_at, updated_at)
         VALUES ($1, $2, $3, 'charged', $4, $5, NOW(), NOW())
         ON CONFLICT (booking_id, user_id) DO UPDATE
           SET amount_cents = $3, status = 'charged', stripe_payment_intent_id = $4,
               error_message = NULL, resolved_by = $5, resolved_at = NOW(), updated_at = NOW()`,
        [params.bookingId, line.userId, line.amountCents, pi.id, params.actorUserId]
      );
    } catch (err: any) {
      const message = err?.message ?? 'Stripe charge failed';
      await query(
        `INSERT INTO booking_settlement_charges
           (booking_id, user_id, amount_cents, status, error_message, updated_at)
         VALUES ($1, $2, $3, 'failed', $4, NOW())
         ON CONFLICT (booking_id, user_id) DO UPDATE
           SET amount_cents = $3, status = 'failed', error_message = $4,
               stripe_payment_intent_id = NULL, updated_at = NOW()
           WHERE booking_settlement_charges.status NOT IN ('charged', 'cash', 'waived')`,
        [params.bookingId, line.userId, line.amountCents, message]
      );
    }
  }

  const settlementStatus = await refreshBookingSettlementStatus(
    params.bookingId,
    params.actorUserId
  );
  const charges = await listSettlementCharges(params.bookingId);
  return { settlementStatus, charges, preview };
}

export async function resolveSettlementCharge(params: {
  bookingId: string;
  userId: string;
  actorUserId: string;
  resolution: 'cash' | 'waived' | 'retry';
}): Promise<{
  settlementStatus: SettlementStatus;
  charges: SettlementChargeLine[];
}> {
  const bookingResult = await query(
    `SELECT facility_id AS "facilityId", settlement_status AS "settlementStatus"
     FROM bookings WHERE id = $1`,
    [params.bookingId]
  );
  const booking = bookingResult.rows[0];
  if (!booking) throw new Error('Booking not found');
  await assertFacilityAdmin(params.actorUserId, booking.facilityId);

  if (params.resolution === 'retry') {
    await query(
      `UPDATE booking_settlement_charges
       SET status = 'pending', error_message = NULL, updated_at = NOW()
       WHERE booking_id = $1 AND user_id = $2 AND status = 'failed'`,
      [params.bookingId, params.userId]
    );
    await query(
      `UPDATE bookings SET settlement_status = 'unsettled', updated_at = NOW() WHERE id = $1`,
      [params.bookingId]
    );
    const result = await closeOutBooking({
      bookingId: params.bookingId,
      actorUserId: params.actorUserId,
    });
    return { settlementStatus: result.settlementStatus, charges: result.charges };
  }

  await query(
    `UPDATE booking_settlement_charges
     SET status = $3,
         error_message = NULL,
         resolved_by = $4,
         resolved_at = NOW(),
         updated_at = NOW()
     WHERE booking_id = $1 AND user_id = $2
       AND status IN ('failed', 'pending')`,
    [params.bookingId, params.userId, params.resolution, params.actorUserId]
  );

  const settlementStatus = await refreshBookingSettlementStatus(
    params.bookingId,
    params.actorUserId
  );
  return {
    settlementStatus,
    charges: await listSettlementCharges(params.bookingId),
  };
}

export async function updateUnsettledBooking(params: {
  bookingId: string;
  actorUserId: string;
  courtId: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  notes?: string;
}): Promise<{ success: boolean; booking?: any; error?: string }> {
  try {
    const meta = await assertCanManageRoster(params.bookingId, params.actorUserId);
    if (meta.settlementStatus !== 'unsettled') {
      return {
        success: false,
        error: 'Only unsettled post-play reservations can be moved in place',
      };
    }

    const updated = await transaction(async (client) => {
      await client.query(`SELECT id FROM courts WHERE id = $1 FOR UPDATE`, [params.courtId]);

      const conflicts = await client.query(
        `SELECT id FROM bookings
         WHERE court_id = $1
           AND booking_date = $2
           AND status != 'cancelled'
           AND id != $5
           AND (
             (start_time <= $3 AND end_time > $3)
             OR (start_time < $4 AND end_time >= $4)
             OR (start_time >= $3 AND end_time <= $4)
           )`,
        [
          params.courtId,
          params.bookingDate,
          params.startTime,
          params.endTime,
          params.bookingId,
        ]
      );
      if (conflicts.rows.length > 0) {
        throw Object.assign(new Error('Time slot is already booked'), {
          code: 'BOOKING_CONFLICT',
        });
      }

      const splitAvailability = await client.query(
        `SELECT check_split_court_availability($1, $2::date, $3::time, $4::time) as available`,
        [params.courtId, params.bookingDate, params.startTime, params.endTime]
      );
      // Exclude self: split check may see this booking; re-check excluding it if function doesn't
      if (!splitAvailability.rows[0]?.available) {
        // Allow when the only occupancy is this booking itself on old slot; verify manually
        const related = await client.query(
          `SELECT b.id FROM bookings b
           WHERE b.id != $5
             AND b.status != 'cancelled'
             AND b.booking_date = $2
             AND (
               b.court_id = $1
               OR b.court_id IN (
                 SELECT id FROM courts WHERE parent_court_id = $1 OR id = (
                   SELECT parent_court_id FROM courts WHERE id = $1
                 )
               )
               OR b.court_id IN (
                 SELECT id FROM courts WHERE parent_court_id = (
                   SELECT parent_court_id FROM courts WHERE id = $1
                 ) AND parent_court_id IS NOT NULL
               )
             )
             AND (
               (start_time <= $3 AND end_time > $3)
               OR (start_time < $4 AND end_time >= $4)
               OR (start_time >= $3 AND end_time <= $4)
             )`,
          [
            params.courtId,
            params.bookingDate,
            params.startTime,
            params.endTime,
            params.bookingId,
          ]
        );
        if (related.rows.length > 0) {
          throw Object.assign(
            new Error('A related parent or split court is already booked at this time'),
            { code: 'BOOKING_CONFLICT' }
          );
        }
      }

      const ins = await client.query(
        `UPDATE bookings
         SET court_id = $2,
             booking_date = $3,
             start_time = $4,
             end_time = $5,
             duration_minutes = $6,
             notes = COALESCE($7, notes),
             updated_at = NOW()
         WHERE id = $1 AND settlement_status = 'unsettled' AND status != 'cancelled'
         RETURNING
           id,
           series_id as "seriesId",
           court_id as "courtId",
           user_id as "userId",
           facility_id as "facilityId",
           TO_CHAR(booking_date, 'YYYY-MM-DD') as "bookingDate",
           start_time as "startTime",
           end_time as "endTime",
           duration_minutes as "durationMinutes",
           status,
           settlement_status as "settlementStatus",
           booking_type as "bookingType",
           notes,
           created_at as "createdAt",
           updated_at as "updatedAt"`,
        [
          params.bookingId,
          params.courtId,
          params.bookingDate,
          params.startTime,
          params.endTime,
          params.durationMinutes,
          params.notes ?? null,
        ]
      );
      return ins.rows[0];
    });

    if (!updated) {
      return { success: false, error: 'Booking could not be updated' };
    }
    return { success: true, booking: updated };
  } catch (err: any) {
    if (err.code === 'BOOKING_CONFLICT') {
      return { success: false, error: err.message };
    }
    console.error('updateUnsettledBooking error:', err);
    return { success: false, error: err.message || 'Failed to update booking' };
  }
}

/** Whether create should use post-play unsettled path instead of Checkout. */
export async function shouldUsePostPlaySettlement(
  facilityId: string,
  courtId: string,
  options?: { bringGuest?: boolean; addBallMachine?: boolean }
): Promise<{ usePostPlay: boolean; needsPayment: boolean }> {
  const courtRow = await loadCourtPaymentSettings(courtId);
  const needsPayment = courtBookingNeedsPayment(courtRow, options);
  const enabled = await isFeatureEnabled(facilityId, FEATURE_FLAGS.POST_PLAY_SETTLEMENT);
  // When the flag is on, every booking is unsettled so staff can close out
  // (including free courts — useful for testing and ops without paid rates).
  return { usePostPlay: enabled, needsPayment };
}
