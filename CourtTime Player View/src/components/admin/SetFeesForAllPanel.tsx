import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Checkbox } from '../ui/checkbox';
import { Save, X } from 'lucide-react';
import { toast } from 'sonner';
import { adminApi } from '../../api/client';
import { sortCourtsForDisplay } from '../../../shared/utils/courtDisplayOrder';
import {
  PaidCourtBookingFields,
  parseBookingFeeDollars,
  type PaidCourtFormFields,
} from './PaidCourtBookingFields';

type PanelCourt = { id: string; name: string; courtNumber?: number };

export function SetFeesForAllPanel({
  courts,
  stripeOnboarded,
  stripeStatusLoading,
  onClose,
  onApplied,
}: {
  courts: PanelCourt[];
  stripeOnboarded: boolean | null;
  stripeStatusLoading: boolean;
  onClose: () => void;
  onApplied: () => void | Promise<void>;
}) {
  const [form, setForm] = useState<PaidCourtFormFields>({
    requirePayment: false,
    bookingFeeDollars: '',
    enableGuestFee: false,
    guestFeeDollars: '',
    enableBallMachineFee: false,
    ballMachineFeeDollars: '',
  });
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const sortedCourts = sortCourtsForDisplay(courts);
  const targetCount = courts.filter((c) => !excluded.has(c.id)).length;

  const toggleCourt = (courtId: string) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(courtId)) {
        next.delete(courtId);
      } else {
        next.add(courtId);
      }
      return next;
    });
  };

  const handleApply = async () => {
    const targetIds = courts.filter((c) => !excluded.has(c.id)).map((c) => c.id);
    if (targetIds.length === 0) {
      toast.error('Select at least one court to apply fees to');
      return;
    }

    const wantsPayment = Boolean(form.requirePayment);
    const bookingAmountCents = parseBookingFeeDollars(form.bookingFeeDollars);
    if (wantsPayment && !bookingAmountCents) {
      toast.error('Enter an hourly rate when paid court booking is enabled');
      return;
    }
    const hasGuestFee = Boolean(form.enableGuestFee);
    const guestFeeCents = parseBookingFeeDollars(form.guestFeeDollars);
    if (hasGuestFee && !guestFeeCents) {
      toast.error('Enter a valid guest fee amount');
      return;
    }
    const hasBallMachineFee = Boolean(form.enableBallMachineFee);
    const ballMachineFeeCents = parseBookingFeeDollars(form.ballMachineFeeDollars);
    if (hasBallMachineFee && !ballMachineFeeCents) {
      toast.error('Enter a valid ball machine hourly rate');
      return;
    }
    if (wantsPayment && stripeOnboarded === false) {
      toast.error('Complete Stripe Connect setup under Member Payments first');
      return;
    }
    if ((hasGuestFee || hasBallMachineFee) && stripeOnboarded === false) {
      toast.info('Fees saved, but Stripe Connect must be set up before members can be charged');
    }

    try {
      setSaving(true);
      const response = await adminApi.bulkUpdateCourts(targetIds, {
        requirePayment: wantsPayment,
        bookingAmountCents: wantsPayment ? bookingAmountCents : null,
        guestFeeCents: hasGuestFee ? guestFeeCents : null,
        ballMachineFeeCents: hasBallMachineFee ? ballMachineFeeCents : null,
      });

      if (response.success) {
        toast.success(`Fees applied to ${targetIds.length} court${targetIds.length !== 1 ? 's' : ''}`);
        onClose();
        await onApplied();
      } else {
        toast.error(response.error || 'Failed to apply fees');
      }
    } catch (error: any) {
      console.error('Error applying fees to courts:', error);
      toast.error(error?.message || 'Failed to apply fees');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="mb-6 border-purple-200 bg-purple-50/50">
      <CardHeader>
        <CardTitle>Set Fees for All Courts</CardTitle>
        <CardDescription>
          Configure paid booking, guest, and ball machine fees once and apply them to every court.
          Uncheck any courts you want to leave unchanged. Applying replaces the current fee
          settings on the selected courts.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <PaidCourtBookingFields
          court={form}
          onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
          stripeOnboarded={stripeOnboarded}
          stripeStatusLoading={stripeStatusLoading}
        />
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <Label>
              Apply to courts ({targetCount} of {courts.length})
            </Label>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setExcluded(excluded.size > 0 ? new Set() : new Set(courts.map((c) => c.id)))
              }
            >
              {excluded.size > 0 ? 'Select All' : 'Deselect All'}
            </Button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {sortedCourts.map((court) => (
              <label
                key={court.id}
                className="flex items-center gap-2 text-sm border rounded-md px-3 py-2 bg-white cursor-pointer"
              >
                <Checkbox
                  checked={!excluded.has(court.id)}
                  onCheckedChange={() => toggleCourt(court.id)}
                />
                <span className="truncate">{court.name}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="flex gap-2 mt-6">
          <Button onClick={handleApply} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Applying...' : `Apply to ${targetCount} Court${targetCount !== 1 ? 's' : ''}`}
          </Button>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
