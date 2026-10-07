import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { ArrowLeft, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { pickleApi, resetSessionExpiryNotification, unwrapApiPayload } from '../../api/client';

const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
];

export function PickleOrgRegistration() {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({
    orgName: '',
    adminFullName: '',
    adminEmail: '',
    adminPhone: '',
    adminPassword: '',
    confirmPassword: '',
  });

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.adminPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    if (form.adminPassword !== form.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await pickleApi.registerOrg({
        orgName: form.orgName.trim(),
        adminEmail: form.adminEmail.trim(),
        adminPassword: form.adminPassword,
        adminFullName: form.adminFullName.trim(),
        adminPhone: form.adminPhone.trim() || undefined,
      });

      if (result.success && result.data) {
        const envelope = result.data as { token?: string };
        const payload = unwrapApiPayload<{
          org: { id: string; name: string };
          user?: unknown;
        }>(result.data);
        const token = envelope.token;
        const org = payload?.org;
        const userData = payload?.user;
        if (token && userData) {
          localStorage.setItem('auth_token', token);
          localStorage.setItem('auth_user', JSON.stringify(userData));
          resetSessionExpiryNotification();
        }
        if (org) {
          toast.success(`Welcome to CourtTime-Pickle, ${org.name}!`);
          navigate(`/pickle/org/${org.id}`);
          window.location.reload();
        }
      } else {
        toast.error(result.error || 'Registration failed');
      }
    } catch {
      toast.error('Registration failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-white py-8 px-4">
      <div className="max-w-lg mx-auto">
        <Button variant="ghost" className="mb-4" onClick={() => navigate('/login')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to login
        </Button>

        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
              <Building2 className="h-6 w-6 text-green-700" />
            </div>
            <CardTitle className="text-2xl text-green-800">CourtTime-Pickle</CardTitle>
            <CardDescription>
              Register your franchise brand (corporate / franchisor account)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="orgName">Brand / Organization Name</Label>
                <Input
                  id="orgName"
                  required
                  placeholder="e.g. Smash Pickleball"
                  value={form.orgName}
                  onChange={(e) => handleChange('orgName', e.target.value)}
                />
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
                <Label htmlFor="adminEmail">Corporate Admin Email</Label>
                <Input
                  id="adminEmail"
                  type="email"
                  required
                  value={form.adminEmail}
                  onChange={(e) => handleChange('adminEmail', e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="adminPhone">Phone (optional)</Label>
                <Input
                  id="adminPhone"
                  type="tel"
                  value={form.adminPhone}
                  onChange={(e) => handleChange('adminPhone', e.target.value)}
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
              <Button type="submit" className="w-full bg-green-700 hover:bg-green-800" disabled={isSubmitting}>
                {isSubmitting ? 'Creating organization...' : 'Create Organization'}
              </Button>
            </form>
            <p className="text-xs text-gray-500 mt-4 text-center">
              Running a tennis club or HOA?{' '}
              <Link to="/register/facility" className="text-green-700 underline">
                Use classic CourtTime registration
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// exported for potential state dropdown reuse in location form
export { US_STATES };
