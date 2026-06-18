import React, { useEffect, useState } from 'react';
import {
  Building2, Users, CalendarDays, UserCheck, ArrowRight, Search, CreditCard,
  AlertTriangle, DollarSign, UserPlus, Key, Tag, Bell, Activity, TrendingUp,
} from 'lucide-react';
import { Input } from '../ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { getDashboardStats } from '../../api/supportClient';
import type { SupportView } from './SupportConsole';

interface SupportDashboardProps {
  onNavigate: (view: SupportView, facilityId?: string, userId?: string) => void;
}

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function timeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const activityIcon: Record<string, React.ElementType> = {
  facility: Building2,
  user: UserPlus,
  payment: DollarSign,
  subscription: CreditCard,
};

export function SupportDashboard({ onNavigate }: SupportDashboardProps) {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [facilitySearch, setFacilitySearch] = useState('');

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
    { label: 'Facilities', value: stats.totalFacilities, icon: Building2, color: 'text-blue-600 bg-blue-50', action: () => onNavigate('facilities') },
    { label: 'Users', value: stats.totalUsers, icon: Users, color: 'text-green-600 bg-green-50', action: () => onNavigate('users') },
    { label: 'Active Members', value: stats.totalActiveMembers, icon: UserCheck, color: 'text-purple-600 bg-purple-50', action: () => onNavigate('members') },
    { label: 'Bookings (Month)', value: stats.bookingsThisMonth, icon: CalendarDays, color: 'text-orange-600 bg-orange-50', action: () => onNavigate('bookings') },
    { label: 'Active Subs', value: stats.activeSubscriptions, icon: CreditCard, color: 'text-indigo-600 bg-indigo-50', action: () => onNavigate('subscriptions') },
    { label: 'Revenue (Month)', value: formatCurrency(stats.revenueThisMonthCents), icon: DollarSign, color: 'text-emerald-600 bg-emerald-50', action: () => onNavigate('subscriptions') },
    { label: 'New Users (7d)', value: stats.newUsersThisWeek, icon: TrendingUp, color: 'text-cyan-600 bg-cyan-50', action: () => onNavigate('users') },
    { label: 'Needs Attention', value: stats.subscriptionsNeedingAttention, icon: AlertTriangle, color: 'text-amber-600 bg-amber-50', action: () => onNavigate('subscriptions') },
  ];

  const quickActions = [
    { label: 'Find User', description: 'Search accounts & reset passwords', icon: Users, view: 'users' as SupportView },
    { label: 'Subscriptions', description: 'Manage billing & renewal dates', icon: CreditCard, view: 'subscriptions' as SupportView },
    { label: 'Promo Codes', description: 'Create trials & discounts', icon: Tag, view: 'promos' as SupportView },
    { label: 'Members', description: 'Approve, suspend, or promote admins', icon: UserCheck, view: 'members' as SupportView },
    { label: 'Bookings', description: 'View & cancel reservations', icon: CalendarDays, view: 'bookings' as SupportView },
    { label: 'Facilities', description: 'Edit facility info & rules', icon: Building2, view: 'facilities' as SupportView },
  ];

  const handleAlertClick = (alert: any) => {
    if (alert.facilityId) onNavigate('subscriptions', alert.facilityId);
    else if (alert.userId) onNavigate('users', undefined, alert.userId);
  };

  const handleActivityClick = (item: any) => {
    if (item.facilityId) onNavigate('facilities', item.facilityId);
    else if (item.userId) onNavigate('users', undefined, item.userId);
  };

  const filteredFacilities = stats.facilities.filter((f: any) => {
    if (!facilitySearch.trim()) return true;
    const q = facilitySearch.toLowerCase();
    return (
      f.name?.toLowerCase().includes(q) ||
      f.city?.toLowerCase().includes(q) ||
      f.state?.toLowerCase().includes(q) ||
      f.id?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Business Command Center</h1>
        <p className="text-sm text-gray-500 mt-1">
          Everything you need to run CourtTime — accounts, billing, facilities, and more.
        </p>
      </div>

      {/* Alerts */}
      {stats.alerts?.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-amber-800">
              <Bell className="h-4 w-4" />
              Needs Your Attention ({stats.alerts.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {stats.alerts.slice(0, 5).map((alert: any) => (
              <button
                key={alert.id}
                onClick={() => handleAlertClick(alert)}
                className="w-full flex items-center justify-between p-2 rounded-lg bg-white hover:bg-amber-50 text-left transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <AlertTriangle className={`h-4 w-4 shrink-0 ${
                    alert.severity === 'high' ? 'text-red-500' : alert.severity === 'medium' ? 'text-amber-500' : 'text-gray-400'
                  }`} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{alert.title}</p>
                    <p className="text-xs text-gray-500 truncate">{alert.description}</p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-gray-400 shrink-0" />
              </button>
            ))}
            {stats.alerts.length > 5 && (
              <Button variant="link" size="sm" className="text-amber-700" onClick={() => onNavigate('subscriptions')}>
                View all {stats.alerts.length} alerts
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {summaryCards.map(({ label, value, icon: Icon, color, action }) => (
          <Card key={label} className="cursor-pointer hover:shadow-md transition-shadow" onClick={action}>
            <CardContent className="p-3">
              <div className="flex items-center gap-2.5">
                <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xl font-bold truncate">{value}</p>
                  <p className="text-[11px] text-gray-500 leading-tight">{label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {quickActions.map(({ label, description, icon: Icon, view }) => (
            <button
              key={view}
              onClick={() => onNavigate(view)}
              className="p-3 rounded-xl border bg-white hover:border-indigo-300 hover:shadow-sm text-left transition-all"
            >
              <Icon className="h-5 w-5 text-indigo-600 mb-2" />
              <p className="text-sm font-medium text-gray-900">{label}</p>
              <p className="text-[11px] text-gray-500 mt-0.5 leading-tight">{description}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent activity */}
        <div className="lg:col-span-1">
          <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Recent Activity
          </h2>
          <Card>
            <CardContent className="p-3 space-y-1">
              {stats.recentActivity?.length > 0 ? (
                stats.recentActivity.map((item: any) => {
                  const Icon = activityIcon[item.type] || Activity;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleActivityClick(item)}
                      className="w-full flex items-start gap-2.5 p-2 rounded-lg hover:bg-gray-50 text-left transition-colors"
                    >
                      <div className="h-7 w-7 rounded-full bg-gray-100 flex items-center justify-center shrink-0 mt-0.5">
                        <Icon className="h-3.5 w-3.5 text-gray-500" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-gray-900">{item.title}</p>
                        <p className="text-xs text-gray-500 truncate">{item.description}</p>
                      </div>
                      <span className="text-[10px] text-gray-400 shrink-0">{timeAgo(item.timestamp)}</span>
                    </button>
                  );
                })
              ) : (
                <p className="text-sm text-gray-400 text-center py-6">No recent activity.</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Facility cards */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">All Facilities</h2>
            <div className="relative w-56">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search facilities..."
                value={facilitySearch}
                onChange={(e) => setFacilitySearch(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredFacilities.map((f: any) => (
              <Card key={f.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-2 pt-3 px-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium truncate">{f.name}</CardTitle>
                    <div className="flex items-center gap-1 shrink-0">
                      {f.subscriptionStatus && (
                        <Badge variant="outline" className="text-[10px] px-1.5">
                          {f.subscriptionStatus}
                        </Badge>
                      )}
                      <Badge variant={f.status === 'active' ? 'default' : 'secondary'} className="text-[10px] px-1.5">
                        {f.status}
                      </Badge>
                    </div>
                  </div>
                  {(f.city || f.state) && (
                    <p className="text-xs text-gray-500">{[f.city, f.state].filter(Boolean).join(', ')}</p>
                  )}
                </CardHeader>
                <CardContent className="space-y-2 px-3 pb-3">
                  <div className="grid grid-cols-3 gap-1 text-center">
                    <div>
                      <p className="text-base font-semibold">{f.activeMemberCount}</p>
                      <p className="text-[10px] text-gray-500">Members</p>
                    </div>
                    <div>
                      <p className="text-base font-semibold">{f.courtCount}</p>
                      <p className="text-[10px] text-gray-500">Courts</p>
                    </div>
                    <div>
                      <p className="text-base font-semibold">{f.bookingsThisMonth}</p>
                      <p className="text-[10px] text-gray-500">Bookings</p>
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <Button variant="outline" size="sm" className="flex-1 text-[11px] h-7" onClick={() => onNavigate('users')}>
                      <Key className="h-3 w-3 mr-1" />
                      Users
                    </Button>
                    <Button variant="outline" size="sm" className="flex-1 text-[11px] h-7" onClick={() => onNavigate('subscriptions', f.id)}>
                      Billing
                    </Button>
                    <Button size="sm" className="flex-1 text-[11px] h-7" onClick={() => onNavigate('facilities', f.id)}>
                      Manage
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
            {facilitySearch.trim() && filteredFacilities.length === 0 && (
              <p className="text-sm text-gray-400 col-span-full text-center py-6">No facilities match "{facilitySearch}"</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
