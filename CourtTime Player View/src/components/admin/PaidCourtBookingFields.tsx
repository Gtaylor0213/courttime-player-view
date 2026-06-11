import React from 'react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';

export type PaidCourtFormFields = {
  requirePayment?: boolean;
  bookingAmountCents?: number | null;
  bookingFeeDollars?: string;
  enableGuestFee?: boolean;
  guestFeeCents?: number | null;
  guestFeeDollars?: string;
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
  paymentsTabHint = 'Member Payments',
}: {
  court: T;
  onChange: (patch: Partial<T>) => void;
  stripeOnboarded: boolean | null;
  stripeStatusLoading: boolean;
  paymentsTabHint?: string;
}) {
  return (
    <div className="mt-4 space-y-3 border rounded-md p-3 bg-white">
      {/* Stripe status */}
      {stripeStatusLoading && <p className="text-xs text-gray-500">Checking Stripe Connect status…</p>}
      {!stripeStatusLoading && stripeOnboarded === false && (
        <p className="text-xs text-amber-700">
          Stripe Connect is not set up yet. Complete setup under {paymentsTabHint} before members
          can be charged for paid courts or guest fees. You can still save fee amounts below.
        </p>
      )}
      {!stripeStatusLoading && stripeOnboarded === true && (
        <p className="text-xs text-green-700">Stripe Connect is active for this facility.</p>
      )}

      {/* Paid court booking */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium">Paid court booking</p>
          <p className="text-xs text-gray-500">
            Members pay per hour with card before the reservation is confirmed
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
      {court.requirePayment && (
        <div className="space-y-2">
          <Label>Hourly rate (USD) *</Label>
          <Input
            type="number"
            min="0.01"
            step="0.01"
            value={court.bookingFeeDollars || ''}
            onChange={(e) => onChange({ bookingFeeDollars: e.target.value } as Partial<T>)}
            placeholder="e.g. 25.00 per hour"
          />
        </div>
      )}

      {/* Guest fee */}
      <div className="flex items-center justify-between gap-4 pt-1 border-t">
        <div>
          <p className="text-sm font-medium">Per-guest fee</p>
          <p className="text-xs text-gray-500">
            Charged per guest — members select how many guests (up to 3) when booking
          </p>
        </div>
        <Switch
          checked={Boolean(court.enableGuestFee)}
          onCheckedChange={(checked) =>
            onChange({
              enableGuestFee: checked,
              guestFeeDollars: checked ? court.guestFeeDollars : '',
              guestFeeCents: checked ? court.guestFeeCents : null,
            } as Partial<T>)
          }
        />
      </div>
      {court.enableGuestFee && (
        <div className="space-y-2">
          <Label>Per-guest fee (USD) *</Label>
          <Input
            type="number"
            min="0.01"
            step="0.01"
            value={court.guestFeeDollars || ''}
            onChange={(e) => onChange({ guestFeeDollars: e.target.value } as Partial<T>)}
            placeholder="e.g. 10.00 per guest"
          />
        </div>
      )}
    </div>
  );
}
