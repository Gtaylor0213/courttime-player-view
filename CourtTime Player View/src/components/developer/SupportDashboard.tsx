import React, { useEffect, useState } from 'react';
import { Building2, Users, CalendarDays, UserCheck, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { getDashboardStats } from '../../api/supportClient';
import type { SupportView } from './SupportConsole';

interface SupportDashboardProps {
  onNavigate: (view: SupportView, facilityId?: string) => void;
}

export function SupportDashboard({ onNavigate }: SupportDashboardProps) {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const result = await getDashboardStats();
      if (result.success) setStats(result.data);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  if (!stats) {
    return <p className="text-gray-500 text-center py-10">Failed to load dashboard data.</p>;
  }

  const summaryCards = [
    { label: 'Facilities', value: stats.totalFacilities, icon: Building2, color: 'text-blue-600 bg-blue-50' },
    { label: 'Users', value: stats.totalUsers, icon: Users, color: 'text-green-600 bg-green-50' },
    { label: 'Active Members', value: stats.totalActiveMembers, icon: UserCheck, color: 'text-purple-600 bg-purple-50' },
    { label: 'Bookings This Month', value: stats.bookingsThisMonth, icon: CalendarDays, color: 'text-orange-600 bg-orange-50' },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {summaryCards.map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${color}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{value}</p>
                  <p className="text-xs text-gray-500">{label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Facility cards */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Facilities</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {stats.facilities.map((f: any) => (
            <Card key={f.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{f.name}</CardTitle>
                  <Badge variant={f.status === 'active' ? 'default' : 'secondary'} className="text-xs">
                    {f.status}
                  </Badge>
                </div>
                {(f.city || f.state) && (
                  <p className="text-xs text-gray-500">{[f.city, f.state].filter(Boolean).join(', ')}</p>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-lg font-semibold">{f.activeMemberCount}</p>
                    <p className="text-xs text-gray-500">Members</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold">{f.courtCount}</p>
                    <p className="text-xs text-gray-500">Courts</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold">{f.bookingsThisMonth}</p>
                    <p className="text-xs text-gray-500">Bookings</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-xs"
                    onClick={() => onNavigate('members', f.id)}
                  >
                    Members
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-xs"
                    onClick={() => onNavigate('bookings', f.id)}
                  >
                    Bookings
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1 text-xs"
                    onClick={() => onNavigate('facilities', f.id)}
                  >
                    Manage <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
