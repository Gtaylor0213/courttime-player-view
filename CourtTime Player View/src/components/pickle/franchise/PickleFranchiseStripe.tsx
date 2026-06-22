import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '../../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { Badge } from '../../ui/badge';
import { CheckCircle2, AlertCircle, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { stripeConnectApi, unwrapApiPayload } from '../../../api/client';
import { useAuth } from '../../../contexts/AuthContext';

export function PickleFranchiseStripe() {
  const { facilityId } = useParams<{ facilityId: string }>();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [onboarded, setOnboarded] = useState(false);

  const isFacilityAdmin = Boolean(facilityId && user?.adminFacilities?.includes(facilityId));

  useEffect(() => {
    if (!facilityId || !isFacilityAdmin) {
      setLoading(false);
      return;
    }

    stripeConnectApi.getStatus(facilityId).then((res) => {
      if (res.success && res.data) {
        const payload = unwrapApiPayload<{ onboarded?: boolean; chargesEnabled?: boolean }>(res.data);
        setOnboarded(Boolean(payload?.onboarded || payload?.chargesEnabled));
      }
    }).finally(() => setLoading(false));
  }, [facilityId, isFacilityAdmin]);

  const handleStartOnboarding = async () => {
    if (!facilityId) return;
    setStarting(true);
    try {
      const res = await stripeConnectApi.startOnboarding(facilityId);
      if (res.success && res.data) {
        const payload = unwrapApiPayload<{ url?: string }>(res.data);
        if (payload?.url) {
          window.location.href = payload.url;
          return;
        }
      }
      toast.error(res.error || 'Failed to start Stripe onboarding');
    } catch {
      toast.error('Failed to start Stripe onboarding');
    } finally {
      setStarting(false);
    }
  };

  if (!isFacilityAdmin) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-gray-500">
          Facility admin access is required.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Stripe Connect</h2>
        <p className="text-sm text-gray-500">Accept member payments at your franchise location</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payment account</CardTitle>
          <CardDescription>Connect a Stripe account to receive court and program payments</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <p className="text-sm text-gray-500">Checking status…</p>
          ) : onboarded ? (
            <Badge className="bg-green-100 text-green-800">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Connected
            </Badge>
          ) : (
            <>
              <Badge variant="secondary">
                <AlertCircle className="h-3 w-3 mr-1" />
                Not connected
              </Badge>
              <Button
                className="bg-green-700 hover:bg-green-800"
                onClick={handleStartOnboarding}
                disabled={starting}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                {starting ? 'Redirecting…' : 'Connect with Stripe'}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
