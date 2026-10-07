import React, { useLayoutEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../ui/select';
import { ArrowLeft, ArrowRight, CheckCircle2, Copy, Zap, ClipboardList } from 'lucide-react';
import { toast } from 'sonner';
import { pickleApi, unwrapApiPayload } from '../../../api/client';
import { US_STATES } from '../PickleOrgRegistration';

type SetupMode = 'complete' | 'quick';

interface ProvisionResult {
  facility?: { id: string; name: string };
  loginUrl?: string;
  operatorEmail?: string;
  operatorPassword?: string;
}

const STEPS = ['Setup mode', 'Location', 'Operator', 'Review'] as const;

export function PickleAddLocationWizard() {
  const { orgId } = useParams<{ orgId: string }>();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ProvisionResult | null>(null);

  const [setupMode, setSetupMode] = useState<SetupMode>('complete');
  const [facilityName, setFacilityName] = useState('');
  const [streetAddress, setStreetAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [phone, setPhone] = useState('');
  const [courtCount, setCourtCount] = useState('8');
  const [operatorEmail, setOperatorEmail] = useState('');
  const [operatorFullName, setOperatorFullName] = useState('');
  const [operatorPassword, setOperatorPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [step]);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(
      () => toast.success(`${label} copied`),
      () => toast.error('Failed to copy')
    );
  };

  const validateLocationStep = (): boolean => {
    if (!facilityName.trim()) {
      toast.error('Location name is required');
      return false;
    }
    if (setupMode === 'complete') {
      if (!streetAddress.trim() || !city.trim() || !state || !zipCode.trim()) {
        toast.error('Complete setup requires full address');
        return false;
      }
      const courts = parseInt(courtCount, 10);
      if (!courts || courts < 1) {
        toast.error('Enter a valid court count');
        return false;
      }
    }
    return true;
  };

  const validateOperatorStep = (): boolean => {
    if (!operatorEmail.trim() || !operatorFullName.trim()) {
      toast.error('Operator email and full name are required');
      return false;
    }
    if (operatorPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return false;
    }
    if (operatorPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return false;
    }
    return true;
  };

  const handleNext = () => {
    if (step === 1 && !validateLocationStep()) return;
    if (step === 2 && !validateOperatorStep()) return;
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const handleBack = () => {
    if (step === 0) {
      navigate(`/pickle/org/${orgId}/locations`);
      return;
    }
    setStep((s) => s - 1);
  };

  const handleSubmit = async () => {
    if (!orgId || !validateOperatorStep()) return;
    setSubmitting(true);
    try {
      const payload = {
        setupMode,
        facilityName: facilityName.trim(),
        operatorEmail: operatorEmail.trim(),
        operatorFullName: operatorFullName.trim(),
        operatorPassword,
        ...(setupMode === 'complete'
          ? {
              streetAddress: streetAddress.trim(),
              city: city.trim(),
              state,
              zipCode: zipCode.trim(),
              phone: phone.trim() || undefined,
              courtCount: parseInt(courtCount, 10) || 8,
            }
          : {}),
      };

      const response = await pickleApi.provisionCorporateLocation(orgId, payload);
      if (!response.success) {
        toast.error(response.error || 'Failed to provision location');
        return;
      }

      const data = unwrapApiPayload<ProvisionResult & Record<string, unknown>>(response.data);
      const loginUrl =
        (data?.loginUrl as string | undefined)
        || `${window.location.origin}/login`;

      setResult({
        facility: data?.facility as ProvisionResult['facility'],
        loginUrl,
        operatorEmail: (data?.operatorEmail as string) || operatorEmail.trim(),
        operatorPassword: (data?.operatorPassword as string) || operatorPassword,
      });
    } catch {
      toast.error('Failed to provision location');
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    return (
      <div className="max-w-xl mx-auto space-y-6">
        <Card className="border-green-200">
          <CardHeader>
            <div className="flex items-center gap-2 text-green-700">
              <CheckCircle2 className="h-6 w-6" />
              <CardTitle>Location provisioned</CardTitle>
            </div>
            <CardDescription>
              {result.facility?.name
                ? `${result.facility.name} is ready. Share these credentials with the operator — they will not be shown again.`
                : 'Share these credentials with the operator — they will not be shown again.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { label: 'Login URL', value: result.loginUrl || '' },
              { label: 'Email', value: result.operatorEmail || '' },
              { label: 'Password', value: result.operatorPassword || '' },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-lg border bg-gray-50 p-3">
                <p className="text-xs font-medium text-gray-500 mb-1">{label}</p>
                <div className="flex items-center justify-between gap-2">
                  <code className="text-sm break-all">{value}</code>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(value, label)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            <div className="flex flex-wrap gap-2 pt-2">
              {result.facility?.id && (
                <Button
                  className="bg-green-700 hover:bg-green-800"
                  onClick={() => navigate(`/pickle/org/${orgId}/locations/${result.facility!.id}`)}
                >
                  View location
                </Button>
              )}
              <Button variant="outline" onClick={() => navigate(`/pickle/org/${orgId}/locations`)}>
                Back to locations
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={handleBack}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Add franchise location</h2>
          <p className="text-sm text-gray-500">
            Step {step + 1} of {STEPS.length}: {STEPS[step]}
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        {STEPS.map((label, i) => (
          <div
            key={label}
            className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-green-700' : 'bg-gray-200'}`}
          />
        ))}
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          {step === 0 && (
            <div className="grid sm:grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setSetupMode('complete')}
                className={`text-left rounded-lg border-2 p-4 transition-colors ${
                  setupMode === 'complete'
                    ? 'border-green-700 bg-green-50'
                    : 'border-gray-200 hover:border-green-300'
                }`}
              >
                <ClipboardList className="h-6 w-6 text-green-700 mb-2" />
                <p className="font-semibold">Complete setup</p>
                <p className="text-sm text-gray-500 mt-1">
                  Full address, courts, and operator account — location is ready to operate.
                </p>
              </button>
              <button
                type="button"
                onClick={() => setSetupMode('quick')}
                className={`text-left rounded-lg border-2 p-4 transition-colors ${
                  setupMode === 'quick'
                    ? 'border-green-700 bg-green-50'
                    : 'border-gray-200 hover:border-green-300'
                }`}
              >
                <Zap className="h-6 w-6 text-green-700 mb-2" />
                <p className="font-semibold">Quick setup</p>
                <p className="text-sm text-gray-500 mt-1">
                  Name and operator only — the franchisee completes facility details after login.
                </p>
              </button>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="facilityName">Location name</Label>
                <Input
                  id="facilityName"
                  value={facilityName}
                  onChange={(e) => setFacilityName(e.target.value)}
                  placeholder="Downtown Pickle Club"
                  required
                />
              </div>
              {setupMode === 'complete' && (
                <>
                  <div>
                    <Label htmlFor="streetAddress">Street address</Label>
                    <Input
                      id="streetAddress"
                      value={streetAddress}
                      onChange={(e) => setStreetAddress(e.target.value)}
                    />
                  </div>
                  <div className="grid sm:grid-cols-3 gap-3">
                    <div>
                      <Label htmlFor="city">City</Label>
                      <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} />
                    </div>
                    <div>
                      <Label>State</Label>
                      <Select value={state} onValueChange={setState}>
                        <SelectTrigger><SelectValue placeholder="State" /></SelectTrigger>
                        <SelectContent>
                          {US_STATES.map((s) => (
                            <SelectItem key={s} value={s}>{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="zipCode">ZIP</Label>
                      <Input id="zipCode" value={zipCode} onChange={(e) => setZipCode(e.target.value)} />
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="phone">Phone (optional)</Label>
                      <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
                    </div>
                    <div>
                      <Label htmlFor="courtCount">Number of courts</Label>
                      <Input
                        id="courtCount"
                        type="number"
                        min={1}
                        max={30}
                        value={courtCount}
                        onChange={(e) => setCourtCount(e.target.value)}
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">
                Create the location operator account. They will manage day-to-day operations.
              </p>
              <div>
                <Label htmlFor="operatorFullName">Full name</Label>
                <Input
                  id="operatorFullName"
                  value={operatorFullName}
                  onChange={(e) => setOperatorFullName(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="operatorEmail">Email</Label>
                <Input
                  id="operatorEmail"
                  type="email"
                  value={operatorEmail}
                  onChange={(e) => setOperatorEmail(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="operatorPassword">Password</Label>
                <Input
                  id="operatorPassword"
                  type="password"
                  value={operatorPassword}
                  onChange={(e) => setOperatorPassword(e.target.value)}
                  minLength={8}
                  required
                />
              </div>
              <div>
                <Label htmlFor="confirmPassword">Confirm password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between border-b pb-2">
                <span className="text-gray-500">Setup mode</span>
                <span className="font-medium capitalize">{setupMode}</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-gray-500">Location name</span>
                <span className="font-medium">{facilityName}</span>
              </div>
              {setupMode === 'complete' && (
                <>
                  <div className="flex justify-between border-b pb-2">
                    <span className="text-gray-500">Address</span>
                    <span className="font-medium text-right">
                      {streetAddress}, {city}, {state} {zipCode}
                    </span>
                  </div>
                  <div className="flex justify-between border-b pb-2">
                    <span className="text-gray-500">Courts</span>
                    <span className="font-medium">{courtCount}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between border-b pb-2">
                <span className="text-gray-500">Operator</span>
                <span className="font-medium">{operatorFullName} ({operatorEmail})</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        {step < STEPS.length - 1 ? (
          <Button className="bg-green-700 hover:bg-green-800" onClick={handleNext}>
            Continue
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        ) : (
          <Button
            className="bg-green-700 hover:bg-green-800"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? 'Provisioning...' : 'Provision location'}
          </Button>
        )}
      </div>
    </div>
  );
}
