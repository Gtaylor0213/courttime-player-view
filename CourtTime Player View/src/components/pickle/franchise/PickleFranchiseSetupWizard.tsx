import React, { useEffect, useLayoutEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Switch } from '../../ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../ui/select';
import { ArrowLeft, ArrowRight, Building2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { pickleApi, unwrapApiPayload } from '../../../api/client';
import { useAuth } from '../../../contexts/AuthContext';
import { US_STATES } from '../PickleOrgRegistration';
import { pickleFranchiseAdminPath } from '../../../utils/pickleLoginRedirect';
import type { OperatingHours } from '../../../../shared/types/contracts';

const STEPS = ['Address', 'Courts', 'Hours'] as const;

const DEFAULT_HOURS: OperatingHours = {
  monday: { open: '06:00', close: '22:00', closed: false },
  tuesday: { open: '06:00', close: '22:00', closed: false },
  wednesday: { open: '06:00', close: '22:00', closed: false },
  thursday: { open: '06:00', close: '22:00', closed: false },
  friday: { open: '06:00', close: '22:00', closed: false },
  saturday: { open: '07:00', close: '21:00', closed: false },
  sunday: { open: '07:00', close: '21:00', closed: false },
};

const DAY_LABELS: Record<string, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

export function PickleFranchiseSetupWizard() {
  const { facilityId } = useParams<{ facilityId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [facilityName, setFacilityName] = useState('Your location');

  const [streetAddress, setStreetAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [phone, setPhone] = useState('');
  const [courtCount, setCourtCount] = useState('8');
  const [operatingHours, setOperatingHours] = useState<OperatingHours>(DEFAULT_HOURS);

  const isFacilityAdmin = Boolean(facilityId && user?.adminFacilities?.includes(facilityId));

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [step]);

  useEffect(() => {
    if (!facilityId || !isFacilityAdmin) {
      setLoading(false);
      return;
    }

    pickleApi.getFacilitySummary(facilityId).then((res) => {
      if (res.success && res.data) {
        const summary = unwrapApiPayload<{
          name?: string;
          setupStatus?: string;
          streetAddress?: string;
          city?: string;
          state?: string;
          zipCode?: string;
          phone?: string;
          operatingHours?: OperatingHours;
          courtCount?: number;
        }>(res.data);

        if (summary?.name) setFacilityName(summary.name);
        if (summary?.setupStatus === 'complete') {
          navigate(pickleFranchiseAdminPath(facilityId), { replace: true });
          return;
        }
        if (summary?.streetAddress) setStreetAddress(summary.streetAddress);
        if (summary?.city) setCity(summary.city);
        if (summary?.state) setState(summary.state);
        if (summary?.zipCode) setZipCode(summary.zipCode);
        if (summary?.phone) setPhone(summary.phone);
        if (summary?.operatingHours) setOperatingHours(summary.operatingHours);
        if (summary?.courtCount) setCourtCount(String(summary.courtCount));
      }
    }).catch(() => {
      toast.error('Failed to load location');
    }).finally(() => setLoading(false));
  }, [facilityId, isFacilityAdmin, navigate]);

  const updateDayHours = (
    day: string,
    field: 'open' | 'close' | 'closed',
    value: string | boolean
  ) => {
    setOperatingHours((prev) => ({
      ...prev,
      [day]: {
        ...prev[day],
        [field]: value,
      },
    }));
  };

  const validateAddressStep = (): boolean => {
    if (!streetAddress.trim() || !city.trim() || !state || !zipCode.trim()) {
      toast.error('Complete address is required');
      return false;
    }
    return true;
  };

  const validateCourtsStep = (): boolean => {
    const count = parseInt(courtCount, 10);
    if (!count || count < 1 || count > 30) {
      toast.error('Enter a court count between 1 and 30');
      return false;
    }
    return true;
  };

  const handleNext = () => {
    if (step === 0 && !validateAddressStep()) return;
    if (step === 1 && !validateCourtsStep()) return;
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
    }
  };

  const handleBack = () => {
    if (step === 0) return;
    setStep((s) => s - 1);
  };

  const handleSubmit = async () => {
    if (!facilityId || !validateCourtsStep()) return;
    setSubmitting(true);
    try {
      const result = await pickleApi.completeFranchiseSetup(facilityId, {
        streetAddress: streetAddress.trim(),
        city: city.trim(),
        state,
        zipCode: zipCode.trim(),
        phone: phone.trim() || undefined,
        courtCount: parseInt(courtCount, 10) || 4,
        operatingHours,
      });

      if (result.success) {
        toast.success('Location setup complete!');
        navigate(pickleFranchiseAdminPath(facilityId), { replace: true });
      } else {
        toast.error(result.error || 'Failed to complete setup');
      }
    } catch {
      toast.error('Failed to complete setup');
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) {
    return (
      <div className="p-8 text-center">
        <p>Please log in to complete location setup.</p>
        <Button className="mt-4 bg-green-700 hover:bg-green-800" onClick={() => navigate('/login')}>
          Log in
        </Button>
      </div>
    );
  }

  if (!isFacilityAdmin) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-600">You do not have admin access to this location.</p>
        <Button className="mt-4" variant="outline" onClick={() => navigate('/calendar')}>
          Go to Calendar
        </Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-700" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-start gap-3 mb-6">
        <div className="h-11 w-11 rounded-xl bg-green-700 flex items-center justify-center shrink-0">
          <Building2 className="h-6 w-6 text-white" />
        </div>
        <div>
          <p className="text-sm text-green-700 font-medium">CourtTime-Pickle Setup</p>
          <h1 className="text-2xl font-bold text-gray-900">{facilityName}</h1>
          <p className="text-gray-500 text-sm">Complete your franchise location profile</p>
        </div>
      </div>

      <div className="flex gap-2 mb-6">
        {STEPS.map((label, index) => (
          <div
            key={label}
            className={`flex-1 rounded-lg border px-3 py-2 text-center text-sm font-medium ${
              index === step
                ? 'border-green-700 bg-green-700 text-white'
                : index < step
                  ? 'border-green-200 bg-green-50 text-green-800'
                  : 'border-gray-200 text-gray-500'
            }`}
          >
            {index < step ? <CheckCircle2 className="h-4 w-4 inline mr-1" /> : null}
            {label}
          </div>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{STEPS[step]}</CardTitle>
          <CardDescription>
            {step === 0 && 'Where is your franchise location?'}
            {step === 1 && 'How many pickleball courts will you operate?'}
            {step === 2 && 'Set weekly operating hours for your location'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === 0 && (
            <>
              <div className="space-y-2">
                <Label htmlFor="street">Street address</Label>
                <Input id="street" value={streetAddress} onChange={(e) => setStreetAddress(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="city">City</Label>
                  <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="state">State</Label>
                  <Select value={state} onValueChange={setState}>
                    <SelectTrigger id="state">
                      <SelectValue placeholder="State" />
                    </SelectTrigger>
                    <SelectContent>
                      {US_STATES.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="zip">ZIP code</Label>
                  <Input id="zip" value={zipCode} onChange={(e) => setZipCode(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone (optional)</Label>
                  <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
              </div>
            </>
          )}

          {step === 1 && (
            <div className="space-y-2 max-w-xs">
              <Label htmlFor="courts">Number of courts</Label>
              <Input
                id="courts"
                type="number"
                min={1}
                max={30}
                value={courtCount}
                onChange={(e) => setCourtCount(e.target.value)}
              />
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              {Object.entries(DAY_LABELS).map(([day, label]) => {
                const dayHours = operatingHours[day] || { open: '06:00', close: '22:00', closed: false };
                return (
                  <div key={day} className="flex flex-col sm:flex-row sm:items-center gap-3 border-b pb-3 last:border-0">
                    <span className="w-28 text-sm font-medium">{label}</span>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={!dayHours.closed}
                        onCheckedChange={(open) => updateDayHours(day, 'closed', !open)}
                      />
                      <span className="text-sm text-gray-500">{dayHours.closed ? 'Closed' : 'Open'}</span>
                    </div>
                    {!dayHours.closed && (
                      <div className="flex items-center gap-2">
                        <Input
                          type="time"
                          className="w-32"
                          value={dayHours.open}
                          onChange={(e) => updateDayHours(day, 'open', e.target.value)}
                        />
                        <span className="text-gray-400">to</span>
                        <Input
                          type="time"
                          className="w-32"
                          value={dayHours.close}
                          onChange={(e) => updateDayHours(day, 'close', e.target.value)}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex justify-between pt-4">
            <Button variant="outline" onClick={handleBack} disabled={step === 0}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            {step < STEPS.length - 1 ? (
              <Button className="bg-green-700 hover:bg-green-800" onClick={handleNext}>
                Next
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            ) : (
              <Button
                className="bg-green-700 hover:bg-green-800"
                onClick={handleSubmit}
                disabled={submitting}
              >
                {submitting ? 'Saving…' : 'Complete setup'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
