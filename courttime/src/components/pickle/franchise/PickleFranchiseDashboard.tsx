import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { Badge } from '../../ui/badge';
import {
  Building2, CalendarDays, CheckCircle2, AlertCircle, Users, DollarSign,
} from 'lucide-react';
import { toast } from 'sonner';
import { adminApi, pickleApi, unwrapApiPayload } from '../../../api/client';
import { useAuth } from '../../../contexts/AuthContext';

interface FacilitySummary {
  name: string;
  courtCount: number;
  memberCount: number;
  stripeOnboarded: boolean;
  setupStatus: string;
}

interface DashboardStats {
  totalBookings: number;
  activeMembers: number;
  courtUtilization: number;
  revenueDollars: string;
}

function formatMoney(dollars: string): string {
  const n = parseFloat(dollars);
  if (Number.isNaN(n)) return '$0.00';
  return `$${n.toFixed(2)}`;
}

export function PickleFranchiseDashboard() {
  const { facilityId } = useParams<{ facilityId: string }>();
  const { user } = useAuth();
  const [summary, setSummary] = useState<FacilitySummary | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  const isFacilityAdmin = Boolean(facilityId && user?.adminFacilities?.includes(facilityId));

  useEffect(() => {
    if (!facilityId || !isFacilityAdmin) {
      setLoading(false);
      return;
    }

    (async () => {
      setLoading(true);
      try {
        const [summaryRes, statsRes] = await Promise.all([
          pickleApi.getFacilitySummary(facilityId),
          adminApi.getDashboardStats(facilityId),
        ]);

        if (summaryRes.success && summaryRes.data) {
          const data = unwrapApiPayload<FacilitySummary>(summaryRes.data);
          if (data) setSummary(data);
        }

        if (statsRes.success && statsRes.data) {
          const payload = statsRes.data as { data?: { stats?: DashboardStats } };
          if (payload.data?.stats) setStats(payload.data.stats);
        }
      } catch {
        toast.error('Failed to load dashboard');
      } finally {
        setLoading(false);
      }
    })();
  }, [facilityId, isFacilityAdmin]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-700" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Dashboard</h2>
        <p className="text-sm text-gray-500">
          Overview for {summary?.name ?? 'your location'}
        </p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Active members
            </CardDescription>
            <CardTitle className="text-2xl">{stats?.activeMembers ?? summary?.memberCount ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Courts
            </CardDescription>
            <CardTitle className="text-2xl">{summary?.courtCount ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4" />
              Bookings (30d)
            </CardDescription>
            <CardTitle className="text-2xl">{stats?.totalBookings ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Revenue (30d)
            </CardDescription>
            <CardTitle className="text-2xl">
              {formatMoney(stats?.revenueDollars ?? '0')}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Location status</CardTitle>
            <CardDescription>Operational readiness</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Setup</span>
              {summary?.setupStatus === 'complete' ? (
                <Badge className="bg-green-100 text-green-800">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Complete
                </Badge>
              ) : (
                <Badge variant="secondary">Pending setup</Badge>
              )}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Court utilization</span>
              <span className="text-sm font-medium">{stats?.courtUtilization ?? 0}%</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Stripe Connect</span>
              {summary?.stripeOnboarded ? (
                <Badge className="bg-green-100 text-green-800">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Connected
                </Badge>
              ) : (
                <Badge variant="secondary">
                  <AlertCircle className="h-3 w-3 mr-1" />
                  Not connected
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
