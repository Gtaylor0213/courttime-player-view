import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { COURT_FEES_MODE_OPTIONS, type CourtFeesMode } from './courtFees';

type Props = {
  mode: CourtFeesMode;
  bookingFeeDollars: string;
  guestFeeDollars: string;
  courtCount: number;
  onModeChange: (mode: CourtFeesMode) => void;
  onBookingFeeChange: (value: string) => void;
  onGuestFeeChange: (value: string) => void;
};

export function FacilityCourtFeesSection({
  mode,
  bookingFeeDollars,
  guestFeeDollars,
  courtCount,
  onModeChange,
  onBookingFeeChange,
  onGuestFeeChange,
}: Props) {
  const showPaidBooking = mode === 'paid_booking' || mode === 'both';
  const showGuestFee = mode === 'guest_fee' || mode === 'both';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Court fees</CardTitle>
        <CardDescription>
          Do you want to charge fees or guest fees? These settings apply to all courts
          {courtCount > 0 ? ` (${courtCount})` : ''}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-amber-700">
          Stripe Connect can be set up after registration under Member Payments before members are
          charged. You can still save fee amounts now.
        </p>

        <div className="space-y-2">
          <Label htmlFor="courtFeesMode">Fee type</Label>
          <Select value={mode} onValueChange={(value) => onModeChange(value as CourtFeesMode)}>
            <SelectTrigger id="courtFeesMode">
              <SelectValue placeholder="Select fee type" />
            </SelectTrigger>
            <SelectContent>
              {COURT_FEES_MODE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {showPaidBooking && (
          <div className="space-y-2">
            <Label htmlFor="facilityBookingFee">Hourly rate (USD) *</Label>
            <p className="text-xs text-gray-500">
              Members pay per hour with card before the reservation is confirmed
            </p>
            <Input
              id="facilityBookingFee"
              type="number"
              min="0.01"
              step="0.01"
              value={bookingFeeDollars}
              onChange={(e) => onBookingFeeChange(e.target.value)}
              placeholder="e.g. 25.00 per hour"
            />
          </div>
        )}

        {showGuestFee && (
          <div className="space-y-2">
            <Label htmlFor="facilityGuestFee">Per-guest fee (USD) *</Label>
            <p className="text-xs text-gray-500">
              Charged per guest — members select how many guests (up to 3) when booking
            </p>
            <Input
              id="facilityGuestFee"
              type="number"
              min="0.01"
              step="0.01"
              value={guestFeeDollars}
              onChange={(e) => onGuestFeeChange(e.target.value)}
              placeholder="e.g. 10.00 per guest"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
