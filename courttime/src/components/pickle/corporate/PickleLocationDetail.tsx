import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { Badge } from '../../ui/badge';
import {
  ArrowLeft, Mail, MapPin, User, CheckCircle2, AlertCircle, RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { pickleApi, unwrapApiPayload } from '../../../api/client';

interface LocationDetail {
  id: string;
  name: string;
  setupMode?: 'complete' | 'quick';
  setupStatus?: 'pending' | 'in_progress' | 'complete';
  streetAddress?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  phone?: string;
  courtCount?: number;
  memberCount?: number;
  stripeOnboarded?: boolean;
  operator?: {
    email: string;
    fullName: string;
    lastLoginAt?: string;
    welcomeSentAt?: string;
  };
}

const SETUP_STATUS_LABELS: Record<string, { label: string; className: string }> = {
  complete: { label: 'Complete', className: 'bg-green-100 text-green-800' },
  pending_setup: { label: 'Pending setup', className: 'bg-gray-100 text-gray-800' },
  in_progress: { label: 'In progress', className: 'bg-amber-100 text-amber-800' },
  pending: { label: 'Pending', className: 'bg-gray-100 text-gray-800' },
};

export function PickleLocationDetail() {
  const { orgId, facilityId } = useParams<{ orgId: string; facilityId: string }>();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<LocationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (!orgId || !facilityId) {
      setLoading(false);
      return;
    }
    loadDetail();
  }, [orgId, facilityId]);

  const loadDetail = async () => {
    if (!orgId || !facilityId) return;
    setLoading(true);
    try {
      const result = await pickleApi.getLocationDetail(orgId, facilityId);
      if (result.success && result.data) {
        const data = unwrapApiPayload<LocationDetail>(result.data);
        if (data) setDetail(data);
      } else {
        toast.error(result.error || 'Failed to load location');
      }
    } catch {
      toast.error('Failed to load location');
    } finally {
      setLoading(false);
    }
  };

  const handleResendWelcome = async () => {
    if (!orgId || !facilityId) return;
    setResending(true);
    try {
      const result = await pickleApi.resendLocationWelcome(orgId, facilityId);
      if (result.success) {
        toast.success('Welcome email sent');
        await loadDetail();
      } else {
        toast.error(result.error || 'Failed to resend welcome email');
      }
    } catch {
      toast.error('Failed to resend welcome email');
    } finally {
      setResending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-700" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 mb-4">Location not found.</p>
        <Button variant="outline" onClick={() => navigate(`/pickle/org/${orgId}/locations`)}>
          Back to locations
        </Button>
      </div>
    );
  }

  const setupBadge = SETUP_STATUS_LABELS[detail.setupStatus || 'pending'] || SETUP_STATUS_LABELS.pending;
  const addressLine = [detail.streetAddress, detail.city, detail.state, detail.zipCode]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(`/pickle/org/${orgId}/locations`)}
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Locations
        </Button>
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{detail.name}</h2>
          {addressLine && (
            <p className="text-sm text-gray-500 flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {addressLine}
            </p>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Setup status</CardTitle>
            <CardDescription>Franchise location provisioning progress</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Mode</span>
              <Badge variant="secondary" className="capitalize">{detail.setupMode || '—'}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Status</span>
              <Badge className={setupBadge.className}>{setupBadge.label}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Courts</span>
              <span className="text-sm font-medium">{detail.courtCount ?? '—'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Members</span>
              <span className="text-sm font-medium">{detail.memberCount ?? '—'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Stripe</span>
              {detail.stripeOnboarded ? (
                <Badge className="bg-green-100 text-green-800">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Connected
                </Badge>
              ) : (
                <Badge variant="secondary">
                  <AlertCircle className="h-3 w-3 mr-1" />
                  Pending
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4" />
              Location operator
            </CardTitle>
            <CardDescription>Primary admin for this franchise location</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {detail.operator ? (
              <>
                <div>
                  <p className="text-sm font-medium">{detail.operator.fullName}</p>
                  <p className="text-sm text-gray-500">{detail.operator.email}</p>
                </div>
                {detail.operator.lastLoginAt && (
                  <p className="text-xs text-gray-500">
                    Last login: {new Date(detail.operator.lastLoginAt).toLocaleString()}
                  </p>
                )}
                {detail.operator.welcomeSentAt && (
                  <p className="text-xs text-gray-500">
                    Welcome email sent: {new Date(detail.operator.welcomeSentAt).toLocaleString()}
                  </p>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResendWelcome}
                  disabled={resending}
                >
                  {resending ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Mail className="h-4 w-4 mr-2" />
                  )}
                  Resend welcome email
                </Button>
              </>
            ) : (
              <p className="text-sm text-gray-500">No operator assigned yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
