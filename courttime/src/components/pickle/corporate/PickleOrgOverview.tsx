import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent } from '../../ui/card';
import { Building2, Users, CalendarDays, DollarSign } from 'lucide-react';
import { toast } from 'sonner';
import { pickleApi, unwrapApiPayload } from '../../../api/client';

interface OrgDashboard {
  locationCount: number;
  totalMembers: number;
  bookingsThisMonth: number;
  revenueCentsThisMonth: number;
}

export function PickleOrgOverview() {
  const { orgId } = useParams<{ orgId: string }>();
  const [dashboard, setDashboard] = useState<OrgDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    loadDashboard();
  }, [orgId]);

  const loadDashboard = async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const result = await pickleApi.getDashboard(orgId);
      if (result.success && result.data) {
        const data = unwrapApiPayload<OrgDashboard>(result.data);
        if (data) setDashboard(data);
      }
    } catch {
      toast.error('Failed to load organization overview');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-700" />
      </div>
    );
  }

  const revenueDollars = ((dashboard?.revenueCentsThisMonth || 0) / 100).toFixed(2);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Overview</h2>
        <p className="text-sm text-gray-500">Network-wide metrics across all franchise locations</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Locations', value: dashboard?.locationCount ?? 0, icon: Building2 },
          { label: 'Active Members', value: dashboard?.totalMembers ?? 0, icon: Users },
          { label: 'Bookings (Month)', value: dashboard?.bookingsThisMonth ?? 0, icon: CalendarDays },
          { label: 'Revenue (Month)', value: `$${revenueDollars}`, icon: DollarSign },
        ].map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-green-50 flex items-center justify-center">
                <Icon className="h-5 w-5 text-green-700" />
              </div>
              <div>
                <p className="text-xl font-bold">{value}</p>
                <p className="text-xs text-gray-500">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
