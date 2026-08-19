import { query } from '../database/connection';

/** Effective paid-court settings; split children inherit unset fees from the parent court. */
export async function loadCourtPaymentSettings(courtId: string) {
  const result = await query(
    `SELECT
       c.id,
       c.name,
       c.facility_id,
       (COALESCE(c.require_payment, false) OR COALESCE(p.require_payment, false)) AS require_payment,
       COALESCE(c.booking_amount_cents, p.booking_amount_cents) AS booking_amount_cents,
       COALESCE(c.guest_fee_cents, p.guest_fee_cents) AS guest_fee_cents,
       COALESCE(c.ball_machine_fee_cents, p.ball_machine_fee_cents) AS ball_machine_fee_cents,
       f.name AS facility_name,
       f.stripe_account_id,
       f.stripe_onboarded,
       f.platform_fee_percent
     FROM courts c
     JOIN facilities f ON f.id = c.facility_id
     LEFT JOIN courts p ON p.id = c.parent_court_id
     WHERE c.id = $1`,
    [courtId]
  );
  return result.rows[0] ?? null;
}

/** Authoritative total (court + guest + ball machine fees), hours-scaled like computeSettlementAmounts. */
export function computeBookingFeeTotalCents(
  courtRow: {
    require_payment?: boolean;
    booking_amount_cents?: number | null;
    guest_fee_cents?: number | null;
    ball_machine_fee_cents?: number | null;
  } | null | undefined,
  options: { durationMinutes: number; bringGuest?: boolean; addBallMachine?: boolean }
): number {
  if (!courtRow) return 0;
  const hours = options.durationMinutes > 0 ? options.durationMinutes / 60 : 1;
  const courtFeeCents =
    courtRow.require_payment && courtRow.booking_amount_cents
      ? Math.round(Number(courtRow.booking_amount_cents) * hours)
      : 0;
  const guestFeeCents =
    options.bringGuest && courtRow.guest_fee_cents ? Number(courtRow.guest_fee_cents) : 0;
  const ballMachineFeeCents =
    options.addBallMachine && courtRow.ball_machine_fee_cents
      ? Math.round(Number(courtRow.ball_machine_fee_cents) * hours)
      : 0;
  return courtFeeCents + guestFeeCents + ballMachineFeeCents;
}

export function courtBookingNeedsPayment(
  courtRow: {
    require_payment?: boolean;
    booking_amount_cents?: number | null;
    guest_fee_cents?: number | null;
    ball_machine_fee_cents?: number | null;
  } | null | undefined,
  options?: { bringGuest?: boolean; addBallMachine?: boolean }
): boolean {
  if (!courtRow) return false;
  return Boolean(
    (courtRow.require_payment && courtRow.booking_amount_cents) ||
      (options?.bringGuest && courtRow.guest_fee_cents) ||
      (options?.addBallMachine && courtRow.ball_machine_fee_cents)
  );
}
