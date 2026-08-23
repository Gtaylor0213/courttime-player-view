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
       COALESCE(c.billing_mode, p.billing_mode, 'hourly') AS billing_mode,
       COALESCE(c.daily_rate_cents, p.daily_rate_cents) AS daily_rate_cents,
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

type CourtFeeRow = {
  require_payment?: boolean;
  booking_amount_cents?: number | null;
  billing_mode?: string | null;
  daily_rate_cents?: number | null;
};

/** Court fee only — hourly rate scaled by duration, or a flat day rate when billing_mode is 'daily'. */
export function computeCourtFeeCents(
  courtRow: CourtFeeRow | null | undefined,
  durationMinutes: number
): number {
  if (!courtRow?.require_payment) return 0;
  if (courtRow.billing_mode === 'daily') {
    return courtRow.daily_rate_cents ? Number(courtRow.daily_rate_cents) : 0;
  }
  if (!courtRow.booking_amount_cents) return 0;
  const hours = durationMinutes > 0 ? durationMinutes / 60 : 1;
  return Math.round(Number(courtRow.booking_amount_cents) * hours);
}

/** Authoritative total (court + guest + ball machine fees), hours-scaled like computeSettlementAmounts. */
export function computeBookingFeeTotalCents(
  courtRow:
    | (CourtFeeRow & {
        guest_fee_cents?: number | null;
        ball_machine_fee_cents?: number | null;
      })
    | null
    | undefined,
  options: { durationMinutes: number; bringGuest?: boolean; addBallMachine?: boolean }
): number {
  if (!courtRow) return 0;
  const hours = options.durationMinutes > 0 ? options.durationMinutes / 60 : 1;
  const courtFeeCents = computeCourtFeeCents(courtRow, options.durationMinutes);
  const guestFeeCents =
    options.bringGuest && courtRow.guest_fee_cents ? Number(courtRow.guest_fee_cents) : 0;
  const ballMachineFeeCents =
    options.addBallMachine && courtRow.ball_machine_fee_cents
      ? Math.round(Number(courtRow.ball_machine_fee_cents) * hours)
      : 0;
  return courtFeeCents + guestFeeCents + ballMachineFeeCents;
}

export function courtBookingNeedsPayment(
  courtRow:
    | (CourtFeeRow & {
        guest_fee_cents?: number | null;
        ball_machine_fee_cents?: number | null;
      })
    | null
    | undefined,
  options?: { bringGuest?: boolean; addBallMachine?: boolean }
): boolean {
  if (!courtRow) return false;
  const hasCourtFee =
    courtRow.billing_mode === 'daily'
      ? Boolean(courtRow.require_payment && courtRow.daily_rate_cents)
      : Boolean(courtRow.require_payment && courtRow.booking_amount_cents);
  return Boolean(
    hasCourtFee ||
      (options?.bringGuest && courtRow.guest_fee_cents) ||
      (options?.addBallMachine && courtRow.ball_machine_fee_cents)
  );
}
