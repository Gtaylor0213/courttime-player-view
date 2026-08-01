import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Label } from '../ui/label';
import { Info, Users } from 'lucide-react';
import { BookingRuleSwitch } from './BookingRuleToggleInput';
import { rulesApi } from '../../api/client';
import { toast } from 'sonner';

/**
 * Facility-admin self-serve toggle for the split-payment feature. Deliberately
 * self-contained rather than folded into the rules-engine `bookingRules` state
 * that MaxAccountsAndUserLimitsSection uses — this is a feature flag
 * (facility_features table), not a booking rule, and the codebase keeps that
 * boundary clean everywhere else.
 */
export function SplitPaymentToggleSection({ facilityId }: { facilityId: string }) {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    rulesApi.getSplitCourtPaymentsEnabled(facilityId)
      .then((res: any) => { if (!cancelled) setEnabled(!!res.data?.enabled); })
      .catch(() => { if (!cancelled) setEnabled(false); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [facilityId]);

  const handleToggle = async (next: boolean) => {
    setSaving(true);
    try {
      const res: any = await rulesApi.setSplitCourtPaymentsEnabled(facilityId, next);
      if (!res.success) throw new Error(res.error || 'Could not update');
      setEnabled(next);
      toast.success(next ? 'Split payments enabled' : 'Split payments disabled');
    } catch (error: any) {
      toast.error(error.message || 'Could not update split payment setting');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Users className="h-5 w-5" />
          Split Court Payments
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-start gap-3">
          <Info className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-green-800">
            Lets members split a paid court's fee (up to 4 people) instead of one person covering it all.
            Only takes effect on courts that already require payment — set a court's fee under Courts to
            make this useful there.
          </p>
        </div>
        <div className="flex items-center justify-between">
          <Label>Allow members to split court fees</Label>
          <BookingRuleSwitch checked={enabled} onCheckedChange={handleToggle} disabled={loading || saving} />
        </div>
      </CardContent>
    </Card>
  );
}
