import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { ArrowLeft, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { pickleApi, resetSessionExpiryNotification, unwrapApiPayload } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { US_STATES } from './PickleOrgRegistration';

export function PickleLocationRegistration() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get('invite') || '';
  const { user } = useAuth();

  const [inviteLoading, setInviteLoading] = useState(!!inviteToken);
  const [inviteError, setInviteError] = useState('');
  const [inviteInfo, setInviteInfo] = useState<{
    orgName: string;
    inviteEmail: string;
    locationName?: string;
  } | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({
    facilityName: '',
    streetAddress: '',
    city: '',
    state: '',
    zipCode: '',
    phone: '',
    courtCount: '8',
    adminFullName: '',
    adminEmail: '',
    adminPassword: '',
    confirmPassword: '',
  });

  useEffect(() => {
    if (!inviteToken) {
      setInviteError('Missing invitation token');
      setInviteLoading(false);
      return;
    }

    (async () => {
      try {
        const result = await pickleApi.validateInvite(inviteToken);
        if (result.success && result.data) {
          const data = unwrapApiPayload<{
            orgName: string;
            inviteEmail: string;
            locationName?: string;
          }>(result.data);
          if (!data) {
            setInviteError('Invalid invitation');
            return;
          }
          setInviteInfo(data);
          setForm((prev) => ({
            ...prev,
            facilityName: data.locationName || prev.facilityName,
            adminEmail: data.inviteEmail,
          }));
        } else {
          setInviteError(result.error || 'Invalid invitation');
        }
      } catch {
        setInviteError('Failed to load invitation');
      } finally {
        setInviteLoading(false);
      }
    })();
  }, [inviteToken]);

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteToken) return;

    const existingUserId = user?.id;
    if (!existingUserId) {
      if (form.adminPassword.length < 8) {
        toast.error('Password must be at least 8 characters');
        return;
      }
      if (form.adminPassword !== form.confirmPassword) {
        toast.error('Passwords do not match');
        return;
      }
      if (!form.adminFullName.trim()) {
        toast.error('Full name is required');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const result = await pickleApi.provisionLocation({
        inviteToken,
        facilityName: form.facilityName.trim(),
        streetAddress: form.streetAddress.trim(),
        city: form.city.trim(),
        state: form.state,
        zipCode: form.zipCode.trim(),
        phone: form.phone.trim() || undefined,
        courtCount: parseInt(form.courtCount, 10) || 8,
        adminEmail: form.adminEmail.trim(),
        adminPassword: existingUserId ? undefined : form.adminPassword,
        adminFullName: existingUserId ? undefined : form.adminFullName.trim(),
        existingUserId,
      });

      if (result.success && result.data) {
        const envelope = result.data as { token?: string };
        const payload = unwrapApiPayload<{
          facility: { id: string; name: string };
          user?: unknown;
        }>(result.data);
        const token = envelope.token;
        const facility = payload?.facility;
        const userData = payload?.user;
        if (token && userData) {
          localStorage.setItem('auth_token', token);
          localStorage.setItem('auth_user', JSON.stringify(userData));
          resetSessionExpiryNotification();
        }
        if (facility) {
          toast.success(`Location ${facility.name} is ready!`);
          navigate('/admin');
          window.location.reload();
        }
      } else {
        toast.error(result.error || 'Setup failed');
      }
    } catch {
      toast.error('Setup failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (inviteLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-green-50">
        <p className="text-gray-600">Loading invitation...</p>
      </div>
    );
  }

  if (inviteError || !inviteInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-green-50 px-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="text-red-600">Invalid Invitation</CardTitle>
            <CardDescription>{inviteError || 'This link is not valid.'}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate('/login')}>Go to Login</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const loggedInMatch = user && user.email.toLowerCase() === inviteInfo.inviteEmail.toLowerCase();

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-white py-8 px-4">
      <div className="max-w-lg mx-auto">
        <Button variant="ghost" className="mb-4" onClick={() => navigate('/login')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>

        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
              <MapPin className="h-6 w-6 text-green-700" />
            </div>
            <CardTitle className="text-xl text-green-800">Set Up Your Location</CardTitle>
            <CardDescription>
              Join <strong>{inviteInfo.orgName}</strong> as a franchise location
            </CardDescription>
          </CardHeader>
          <CardContent>
            {user && !loggedInMatch && (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-3 mb-4">
                You are logged in as {user.email}, but this invite is for {inviteInfo.inviteEmail}.
                Please log out and use the invited email, or log in with the correct account.
              </p>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="facilityName">Location Name</Label>
                <Input
                  id="facilityName"
                  required
                  placeholder="e.g. Smash Pickleball — Dallas"
                  value={form.facilityName}
                  onChange={(e) => handleChange('facilityName', e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="streetAddress">Street Address</Label>
                <Input
                  id="streetAddress"
                  required
                  value={form.streetAddress}
                  onChange={(e) => handleChange('streetAddress', e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="city">City</Label>
                  <Input id="city" required value={form.city} onChange={(e) => handleChange('city', e.target.value)} />
                </div>
                <div>
                  <Label>State</Label>
                  <Select value={form.state} onValueChange={(v) => handleChange('state', v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="State" />
                    </SelectTrigger>
                    <SelectContent>
                      {US_STATES.map((st) => (
                        <SelectItem key={st} value={st}>{st}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="zipCode">ZIP</Label>
                  <Input id="zipCode" required value={form.zipCode} onChange={(e) => handleChange('zipCode', e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="courtCount">Indoor Courts</Label>
                  <Input
                    id="courtCount"
                    type="number"
                    min={1}
                    max={30}
                    value={form.courtCount}
                    onChange={(e) => handleChange('courtCount', e.target.value)}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="phone">Phone (optional)</Label>
                <Input id="phone" value={form.phone} onChange={(e) => handleChange('phone', e.target.value)} />
              </div>

              {!loggedInMatch && (
                <>
                  <div>
                    <Label htmlFor="adminEmail">Your Email (must match invite)</Label>
                    <Input id="adminEmail" type="email" required readOnly value={form.adminEmail} />
                  </div>
                  <div>
                    <Label htmlFor="adminFullName">Your Full Name</Label>
                    <Input
                      id="adminFullName"
                      required
                      value={form.adminFullName}
                      onChange={(e) => handleChange('adminFullName', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="adminPassword">Password</Label>
                    <Input
                      id="adminPassword"
                      type="password"
                      required
                      minLength={8}
                      value={form.adminPassword}
                      onChange={(e) => handleChange('adminPassword', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="confirmPassword">Confirm Password</Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      required
                      value={form.confirmPassword}
                      onChange={(e) => handleChange('confirmPassword', e.target.value)}
                    />
                  </div>
                </>
              )}

              {loggedInMatch && (
                <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded p-3">
                  Continuing as {user.fullName || user.email}
                </p>
              )}

              <Button
                type="submit"
                className="w-full bg-green-700 hover:bg-green-800"
                disabled={isSubmitting || Boolean(user && !loggedInMatch)}
              >
                {isSubmitting ? 'Creating location...' : 'Complete Location Setup'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
