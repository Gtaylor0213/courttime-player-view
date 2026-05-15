import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';

export type PaidCourtFormFields = {
  requirePayment?: boolean;
  bookingAmountCents?: number | null;
  bookingFeeDollars?: string;
};

export function formatCentsToDollars(cents: number | null | undefined): string {
  if (cents == null || cents <= 0) return '';
  return (cents / 100).toFixed(2);
}

export function parseBookingFeeDollars(dollars: string | undefined): number | null {
  if (!dollars?.trim()) return null;
  const n = parseFloat(dollars);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

export function PaidCourtBookingFields<T extends PaidCourtFormFields>({
  court,
  onChange,
  stripeOnboarded,
  stripeStatusLoading,
  paymentsTabHint = 'Facility Management → Payments',
}: {
  court: T;
  onChange: (patch: Partial<T>) => void;
  stripeOnboarded: boolean | null;
  stripeStatusLoading: boolean;
  paymentsTabHint?: string;
}) {
  return (
    <div className="mt-4 space-y-3 border rounded-md p-3 bg-white">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium">Paid court booking</p>
          <p className="text-xs text-gray-500">
            Members pay with card before the reservation is confirmed
          </p>
        </div>
        <Switch
          checked={Boolean(court.requirePayment)}
          onCheckedChange={(checked) =>
            onChange({
              requirePayment: checked,
              bookingFeeDollars: checked ? court.bookingFeeDollars : '',
            } as Partial<T>)
          }
        />
      </div>
      {stripeStatusLoading && <p className="text-xs text-gray-500">Checking Stripe Connect status…</p>}
      {!stripeStatusLoading && stripeOnboarded === false && (
        <p className="text-xs text-amber-700">
          Stripe Connect is not set up yet. Complete setup under {paymentsTabHint} before enabling
          paid courts.
        </p>
      )}
      {!stripeStatusLoading && stripeOnboarded === true && (
        <p className="text-xs text-green-700">Stripe Connect is active for this facility.</p>
      )}
      {court.requirePayment && (
        <div className="space-y-2">
          <Label>Booking fee (USD) *</Label>
          <Input
            type="number"
            min="0.01"
            step="0.01"
            value={court.bookingFeeDollars || ''}
            onChange={(e) => onChange({ bookingFeeDollars: e.target.value } as Partial<T>)}
            placeholder="e.g. 25.00"
          />
        </div>
      )}
    </div>
  );
}
