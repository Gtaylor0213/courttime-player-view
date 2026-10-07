import type { PaidCourtFormFields } from '../admin/PaidCourtBookingFields';
import type { RegistrationCourt } from './registrationTypes';

export type CourtFeesMode = 'none' | 'paid_booking' | 'guest_fee' | 'both';

export const COURT_FEES_MODE_OPTIONS: Array<{ value: CourtFeesMode; label: string }> = [
  { value: 'none', label: 'No fees' },
  { value: 'paid_booking', label: 'Paid court booking' },
  { value: 'guest_fee', label: 'Guest fee' },
  { value: 'both', label: 'Paid booking & guest fee' },
];

export function courtFeeFieldsFromSettings(
  mode: CourtFeesMode,
  bookingFeeDollars: string,
  guestFeeDollars: string,
  ballMachineEnabled: boolean,
  ballMachineFeeDollars: string,
): Pick<
  PaidCourtFormFields,
  | 'requirePayment'
  | 'bookingFeeDollars'
  | 'enableGuestFee'
  | 'guestFeeDollars'
  | 'guestFeeCents'
  | 'enableBallMachineFee'
  | 'ballMachineFeeDollars'
  | 'ballMachineFeeCents'
> {
  const wantsPaidBooking = mode === 'paid_booking' || mode === 'both';
  const wantsGuestFee = mode === 'guest_fee' || mode === 'both';

  return {
    requirePayment: wantsPaidBooking,
    bookingFeeDollars: wantsPaidBooking ? bookingFeeDollars : '',
    enableGuestFee: wantsGuestFee,
    guestFeeDollars: wantsGuestFee ? guestFeeDollars : '',
    guestFeeCents: null,
    enableBallMachineFee: ballMachineEnabled,
    ballMachineFeeDollars: ballMachineEnabled ? ballMachineFeeDollars : '',
    ballMachineFeeCents: null,
  };
}

export function applyCourtFeesToCourts(
  courts: RegistrationCourt[],
  mode: CourtFeesMode,
  bookingFeeDollars: string,
  guestFeeDollars: string,
  ballMachineEnabled: boolean,
  ballMachineFeeDollars: string,
): RegistrationCourt[] {
  const feeFields = courtFeeFieldsFromSettings(
    mode,
    bookingFeeDollars,
    guestFeeDollars,
    ballMachineEnabled,
    ballMachineFeeDollars,
  );
  return courts.map((court) => ({ ...court, ...feeFields }));
}
