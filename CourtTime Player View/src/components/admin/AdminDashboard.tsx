import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { NotificationBell } from '../NotificationBell';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Calendar, Users, TrendingUp, DollarSign, Download, Filter, BarChart3, PieChart, Clock } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { adminApi } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'sonner';

interface DashboardStats {
  totalBookings: number;
  bookingsChange: number;
  activeMembers: number;
  newMembers: number;
  courtUtilization: number;
  revenue: number;
}

interface RecentActivity {
  id: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  userName: string;
  courtName: string;
  status: string;
  createdAt: string;
}

interface AnalyticsData {
  bookingsTrend: Array<{ date: string; bookings: number }>;
  peakHours: Array<{ hour: number; bookings: number }>;
  courtUsage: Array<{ court_name: string; court_number: number; bookings: number }>;
  memberGrowth: Array<{ date: string; new_members: number }>;
  dayOfWeek: Array<{ day_of_week: number; bookings: number }>;
  heatmap: Array<{ day_of_week: number; hour: number; bookings: number }>;
  statusBreakdown: Array<{ status: string; count: number }>;
  courtUtilization: Array<{ court_name: string; court_number: number; total_bookings: number; total_minutes_booked: number }>;
  topBookers: Array<{ member_name: string; email: string; booking_count: number; total_minutes: number }>;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function AdminDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'overview' | 'courts' | 'times' | 'members'>('overview');
  const [timeRange, setTimeRange] = useState('30');
  const [stats, setStats] = useState<DashboardStats>({
    totalBookings: 0,
    bookingsChange: 0,
    activeMembers: 0,
    newMembers: 0,
    courtUtilization: 0,
    revenue: 0
  });
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData>({
    bookingsTrend: [],
    peakHours: [],
    courtUsage: [],
    memberGrowth: [],
    dayOfWeek: [],
    heatmap: [],
    statusBreakdown: [],
    courtUtilization: [],
    topBookers: [],
  });
  const [loading, setLoading] = useState(true);

  const currentFacilityId = user?.memberFacilities?.[0];

  useEffect(() => {
    if (currentFacilityId) {
      loadDashboardData();
      loadAnalytics();
    }
  }, [currentFacilityId]);

  useEffect(() => {
    if (currentFacilityId && activeTab !== 'overview') {
      loadAnalytics();
    }
  }, [timeRange]);

  const loadDashboardData = async () => {
    if (!currentFacilityId) {
      toast.error('No facility selected');
      return;
    }

    try {
      setLoading(true);
      const response = await adminApi.getDashboardStats(currentFacilityId);

      if (response.success && response.data?.data) {
        setStats(response.data.data.stats);
        setRecentActivity(response.data.data.recentActivity || []);
      } else {
        toast.error(response.error || 'Failed to load dashboard data');
      }
    } catch (error: any) {
      console.error('Error loading dashboard:', error);
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const loadAnalytics = async () => {
    if (!currentFacilityId) return;

    try {
      const response = await adminApi.getAnalytics(currentFacilityId, parseInt(timeRange));

      if (response.success && response.data) {
        const data = response.data.data || response.data;
        setAnalyticsData({
          bookingsTrend: data.bookingsTrend || [],
          peakHours: data.peakHours || [],
          courtUsage: data.courtUsage || [],
          memberGrowth: data.memberGrowth || [],
          dayOfWeek: data.dayOfWeek || [],
          heatmap: data.heatmap || [],
          statusBreakdown: data.statusBreakdown || [],
          courtUtilization: data.courtUtilization || [],
          topBookers: data.topBookers || [],
        });
      }
    } catch (error: any) {
      console.error('Error loading analytics:', error);
    }
  };

  const handleExportReport = () => {
    const lines: string[] = [];
    lines.push(`Analytics Report - Last ${timeRange} Days`);
    lines.push(`Generated: ${new Date().toLocaleString()}`);
    lines.push('');
    lines.push('=== SUMMARY ===');
    lines.push(`Total Bookings,${getTotalBookings()}`);
    lines.push(`Court Utilization,${getAnalyticsCourtUtilization()}%`);
    lines.push(`New Members,${getTotalNewMembers()}`);
    lines.push(`Active Courts,${analyticsData.courtUsage.length}`);
    lines.push('');
    lines.push('=== BOOKINGS BY DAY OF WEEK ===');
    lines.push('Day,Bookings');
    analyticsData.dayOfWeek.forEach(d => {
      lines.push(`${DAY_NAMES[d.day_of_week]},${d.bookings}`);
    });
    lines.push('');
    lines.push('=== PEAK HOURS ===');
    lines.push('Hour,Bookings');
    analyticsData.peakHours.forEach(p => {
      lines.push(`${formatHour(p.hour)},${p.bookings}`);
    });
    lines.push('');
    lines.push('=== COURT USAGE ===');
    lines.push('Court,Bookings,Hours Booked');
    analyticsData.courtUtilization.forEach(c => {
      lines.push(`${c.court_name},${c.total_bookings},${(c.total_minutes_booked / 60).toFixed(1)}`);
    });
    lines.push('');
    lines.push('=== TOP MEMBERS ===');
    lines.push('Member,Email,Bookings,Hours');
    analyticsData.topBookers.forEach(m => {
      lines.push(`${m.member_name},${m.email},${m.booking_count},${(m.total_minutes / 60).toFixed(1)}`);
    });
    lines.push('');
    lines.push('=== BOOKING STATUS ===');
    lines.push('Status,Count');
    analyticsData.statusBreakdown.forEach(s => {
      lines.push(`${s.status},${s.count}`);
    });

    const csvContent = lines.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `analytics-report-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Report exported successfully');
  };

  const getTotalBookings = () => {
    return analyticsData.bookingsTrend.reduce((sum, day) => sum + Number(day.bookings), 0);
  };

  const getTotalNewMembers = () => {
    return analyticsData.memberGrowth.reduce((sum, day) => sum + Number(day.new_members), 0);
  };

  const getAnalyticsCourtUtilization = () => {
    const totalMinutes = analyticsData.courtUtilization.reduce((sum, c) => sum + Number(c.total_minutes_booked), 0);
    const totalCourts = analyticsData.courtUtilization.length;
    const daysInPeriod = parseInt(timeRange);
    const hoursPerDay = 14;
    const maxPossibleMinutes = totalCourts * daysInPeriod * hoursPerDay * 60;
    if (maxPossibleMinutes === 0) return 0;
    return Math.round((totalMinutes / maxPossibleMinutes) * 100);
  };

  const formatHour = (hour: number) => {
    const h = Number(hour);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayHour = h % 12 || 12;
    return `${displayHour}:00 ${ampm}`;
  };

  const getHeatmapIntensity = (bookings: number, maxBookings: number) => {
    if (maxBookings === 0) return 'bg-gray-100';
    const ratio = bookings / maxBookings;
    if (ratio === 0) return 'bg-gray-100';
    if (ratio < 0.25) return 'bg-blue-100';
    if (ratio < 0.5) return 'bg-blue-300';
    if (ratio < 0.75) return 'bg-blue-500 text-white';
    return 'bg-blue-700 text-white';
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'confirmed': return 'bg-green-100 text-green-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      case 'completed': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const buildHeatmapData = () => {
    const data: { [key: string]: number } = {};
    let maxBookings = 0;
    analyticsData.heatmap.forEach(h => {
      const key = `${h.day_of_week}-${h.hour}`;
      data[key] = Number(h.bookings);
      if (Number(h.bookings) > maxBookings) maxBookings = Number(h.bookings);
    });
    return { data, maxBookings };
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatTime = (timeStr: string) => {
    const [hours, minutes] = timeStr.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const getActivityColor = (status: string) => {
    switch (status) {
      case 'confirmed':
        return 'bg-green-500';
      case 'pending':
        return 'bg-yellow-500';
      case 'cancelled':
        return 'bg-red-500';
      default:
        return 'bg-blue-500';
    }
  };

  const { data: heatmapData, maxBookings: heatmapMax } = buildHeatmapData();
  const totalStatusCount = analyticsData.statusBreakdown.reduce((sum, s) => sum + Number(s.count), 0);

  return (
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-medium text-gray-900">Admin Dashboard</h1>
            <div className="flex items-center gap-3">
              <Button onClick={handleExportReport} variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Export Report
              </Button>
              <NotificationBell />
            </div>
          </div>

          {/* Tab Navigation */}
          <Card className="mb-6">
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex gap-2">
                  <Button
                    variant={activeTab === 'overview' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setActiveTab('overview')}
                  >
                    <BarChart3 className="h-4 w-4 mr-1" />
                    Overview
                  </Button>
                  <Button
                    variant={activeTab === 'courts' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setActiveTab('courts')}
                  >
                    <PieChart className="h-4 w-4 mr-1" />
                    Courts
                  </Button>
                  <Button
                    variant={activeTab === 'times' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setActiveTab('times')}
                  >
                    <Clock className="h-4 w-4 mr-1" />
                    Time Analysis
                  </Button>
                  <Button
                    variant={activeTab === 'members' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setActiveTab('members')}
                  >
                    <Users className="h-4 w-4 mr-1" />
                    Members
                  </Button>
                </div>
                {activeTab !== 'overview' && (
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-gray-500" />
                    <Label htmlFor="timeRange" className="text-sm">Time Range:</Label>
                    <Select value={timeRange} onValueChange={setTimeRange}>
                      <SelectTrigger className="w-36 h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="7">Last 7 Days</SelectItem>
                        <SelectItem value="30">Last 30 Days</SelectItem>
                        <SelectItem value="90">Last 3 Months</SelectItem>
                        <SelectItem value="365">Last Year</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <>
              {/* Stats Grid - Always visible */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Bookings</CardTitle>
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{stats.totalBookings}</div>
                    <p className="text-xs text-muted-foreground">
                      {stats.bookingsChange > 0 ? '+' : ''}{stats.bookingsChange}% from last month
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Active Members</CardTitle>
                    <Users className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{stats.activeMembers}</div>
                    <p className="text-xs text-muted-foreground">
                      {stats.newMembers > 0 ? `+${stats.newMembers}` : stats.newMembers} new this month
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Court Utilization</CardTitle>
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{stats.courtUtilization}%</div>
                    <p className="text-xs text-muted-foreground">This month</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Revenue</CardTitle>
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">${stats.revenue.toLocaleString()}</div>
                    <p className="text-xs text-muted-foreground">This month</p>
                  </CardContent>
                </Card>
              </div>

              {/* Overview Tab */}
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card>
                      <CardHeader>
                        <CardTitle>Quick Actions</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <button
                          onClick={() => navigate('/admin/booking')}
                          className="w-full text-left p-3 rounded-lg hover:bg-gray-100 transition-colors"
                        >
                          <div className="font-medium">Create Booking</div>
                          <div className="text-sm text-gray-600">Book a court for a member</div>
                        </button>
                        <button
                          onClick={() => navigate('/admin/members')}
                          className="w-full text-left p-3 rounded-lg hover:bg-gray-100 transition-colors"
                        >
                          <div className="font-medium">Manage Members</div>
                          <div className="text-sm text-gray-600">View and edit member information</div>
                        </button>
                        <button
                          onClick={() => navigate('/admin/courts')}
                          className="w-full text-left p-3 rounded-lg hover:bg-gray-100 transition-colors"
                        >
                          <div className="font-medium">Court Settings</div>
                          <div className="text-sm text-gray-600">Configure court availability</div>
                        </button>
                        <button
                          onClick={() => navigate('/admin/households')}
                          className="w-full text-left p-3 rounded-lg hover:bg-gray-100 transition-colors"
                        >
                          <div className="font-medium">Manage Households</div>
                          <div className="text-sm text-gray-600">View and manage address-based households</div>
                        </button>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle>Recent Activity</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          {recentActivity.length === 0 ? (
                            <p className="text-sm text-gray-500">No recent activity</p>
                          ) : (
                            recentActivity.slice(0, 5).map((activity) => (
                              <div key={activity.id} className="flex items-start gap-3">
                                <div className={`w-2 h-2 rounded-full ${getActivityColor(activity.status)} mt-2`} />
                                <div className="flex-1">
                                  <div className="text-sm font-medium">
                                    Booking by {activity.userName}
                                  </div>
                                  <div className="text-xs text-gray-600">
                                    {activity.courtName} - {formatDate(activity.bookingDate)} at {formatTime(activity.startTime)}
                                  </div>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Booking Status Breakdown */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Booking Status Breakdown</CardTitle>
                      <CardDescription>Distribution of booking statuses</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-4">
                        {analyticsData.statusBreakdown.map((status, index) => {
                          const percent = totalStatusCount > 0 ? Math.round((Number(status.count) / totalStatusCount) * 100) : 0;
                          return (
                            <div key={index} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg min-w-[150px]">
                              <Badge className={getStatusColor(status.status)}>
                                {status.status.charAt(0).toUpperCase() + status.status.slice(1)}
                              </Badge>
                              <div>
                                <div className="font-bold">{status.count}</div>
                                <div className="text-xs text-gray-500">{percent}%</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Booking Trends */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Booking Trends</CardTitle>
                      <CardDescription>Daily bookings over the last 14 days</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {analyticsData.bookingsTrend.length > 0 ? (
                        <div className="space-y-2">
                          {analyticsData.bookingsTrend.slice(-14).map((day, index) => {
                            const maxBookings = Math.max(...analyticsData.bookingsTrend.map(d => Number(d.bookings)), 1);
                            const percent = Math.round((Number(day.bookings) / maxBookings) * 100);
                            const date = new Date(day.date);
                            const formattedDate = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

                            return (
                              <div key={index}>
                                <div className="flex justify-between text-sm mb-1">
                                  <span className="font-medium">{formattedDate}</span>
                                  <span className="text-gray-600">{day.bookings} bookings</span>
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-2">
                                  <div
                                    className="bg-blue-600 h-2 rounded-full transition-all"
                                    style={{ width: `${percent}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="h-32 flex items-center justify-center bg-gray-100 rounded-lg">
                          <p className="text-gray-500">No booking data available</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Courts Tab */}
              {activeTab === 'courts' && (
                <div className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Court Utilization Details</CardTitle>
                      <CardDescription>Bookings and hours for each court</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-4 py-3 text-left font-medium">Court</th>
                              <th className="px-4 py-3 text-right font-medium">Bookings</th>
                              <th className="px-4 py-3 text-right font-medium">Hours Booked</th>
                              <th className="px-4 py-3 text-right font-medium">Utilization</th>
                              <th className="px-4 py-3 text-left font-medium">Visual</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {analyticsData.courtUtilization.map((court, index) => {
                              const hoursBooked = Number(court.total_minutes_booked) / 60;
                              const maxHours = parseInt(timeRange) * 14;
                              const utilization = maxHours > 0 ? Math.round((hoursBooked / maxHours) * 100) : 0;

                              return (
                                <tr key={index} className="hover:bg-gray-50">
                                  <td className="px-4 py-3 font-medium">{court.court_name}</td>
                                  <td className="px-4 py-3 text-right">{court.total_bookings}</td>
                                  <td className="px-4 py-3 text-right">{hoursBooked.toFixed(1)}h</td>
                                  <td className="px-4 py-3 text-right">{utilization}%</td>
                                  <td className="px-4 py-3">
                                    <div className="w-full bg-gray-200 rounded-full h-2">
                                      <div
                                        className="bg-green-600 h-2 rounded-full"
                                        style={{ width: `${Math.min(utilization, 100)}%` }}
                                      />
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Court Comparison</CardTitle>
                      <CardDescription>Bookings by court</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {analyticsData.courtUsage.length > 0 ? (
                        <div className="space-y-3">
                          {analyticsData.courtUsage.map((court, index) => {
                            const maxBookings = Math.max(...analyticsData.courtUsage.map(c => Number(c.bookings)), 1);
                            const percent = Math.round((Number(court.bookings) / maxBookings) * 100);
                            return (
                              <div key={index}>
                                <div className="flex justify-between text-sm mb-1">
                                  <span className="font-medium">{court.court_name}</span>
                                  <span className="text-gray-600">{court.bookings} bookings</span>
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-3">
                                  <div
                                    className="bg-green-600 h-3 rounded-full"
                                    style={{ width: `${percent}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-center py-8 text-gray-500">No court data available</div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Time Analysis Tab */}
              {activeTab === 'times' && (
                <div className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Bookings by Day of Week</CardTitle>
                      <CardDescription>Which days are busiest</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {analyticsData.dayOfWeek.length > 0 ? (
                        <div className="space-y-3">
                          {DAY_NAMES.map((dayName, dayIndex) => {
                            const dayData = analyticsData.dayOfWeek.find(d => Number(d.day_of_week) === dayIndex);
                            const bookings = dayData ? Number(dayData.bookings) : 0;
                            const maxBookings = Math.max(...analyticsData.dayOfWeek.map(d => Number(d.bookings)), 1);
                            const percent = Math.round((bookings / maxBookings) * 100);

                            return (
                              <div key={dayIndex}>
                                <div className="flex justify-between text-sm mb-1">
                                  <span className="font-medium w-24">{dayName}</span>
                                  <span className="text-gray-600">{bookings} bookings</span>
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-3">
                                  <div
                                    className="bg-blue-600 h-3 rounded-full"
                                    style={{ width: `${percent}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-center py-8 text-gray-500">No day of week data available</div>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Peak Hours</CardTitle>
                      <CardDescription>Most popular booking times</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {analyticsData.peakHours.length > 0 ? (
                        <div className="space-y-2">
                          {analyticsData.peakHours.slice(0, 8).map((slot, index) => {
                            const maxBookings = Math.max(...analyticsData.peakHours.map(p => Number(p.bookings)), 1);
                            const percent = Math.round((Number(slot.bookings) / maxBookings) * 100);
                            return (
                              <div key={index}>
                                <div className="flex justify-between text-sm mb-1">
                                  <span className="font-medium">{formatHour(slot.hour)}</span>
                                  <span className="text-gray-600">{slot.bookings} bookings</span>
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-2">
                                  <div
                                    className="bg-orange-500 h-2 rounded-full"
                                    style={{ width: `${percent}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-center py-8 text-gray-500">No peak hours data available</div>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Booking Heatmap</CardTitle>
                      <CardDescription>Bookings by day and hour (darker = more bookings)</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr>
                              <th className="px-2 py-1 text-left"></th>
                              {Array.from({ length: 15 }, (_, i) => i + 6).map(hour => (
                                <th key={hour} className="px-1 py-1 text-center font-normal">
                                  {hour % 12 || 12}{hour >= 12 ? 'p' : 'a'}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {DAY_NAMES_SHORT.map((dayName, dayIndex) => (
                              <tr key={dayIndex}>
                                <td className="px-2 py-1 font-medium">{dayName}</td>
                                {Array.from({ length: 15 }, (_, i) => i + 6).map(hour => {
                                  const key = `${dayIndex}-${hour}`;
                                  const bookings = heatmapData[key] || 0;
                                  return (
                                    <td
                                      key={hour}
                                      className={`px-1 py-2 text-center ${getHeatmapIntensity(bookings, heatmapMax)}`}
                                      title={`${dayName} ${formatHour(hour)}: ${bookings} bookings`}
                                    >
                                      {bookings > 0 ? bookings : ''}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="flex items-center gap-2 mt-4 text-xs">
                        <span>Less</span>
                        <div className="w-4 h-4 bg-gray-100 rounded"></div>
                        <div className="w-4 h-4 bg-blue-100 rounded"></div>
                        <div className="w-4 h-4 bg-blue-300 rounded"></div>
                        <div className="w-4 h-4 bg-blue-500 rounded"></div>
                        <div className="w-4 h-4 bg-blue-700 rounded"></div>
                        <span>More</span>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Members Tab */}
              {activeTab === 'members' && (
                <div className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Top Members by Bookings</CardTitle>
                      <CardDescription>Members with the most court reservations</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {analyticsData.topBookers.length > 0 ? (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-4 py-3 text-left font-medium">#</th>
                                <th className="px-4 py-3 text-left font-medium">Member</th>
                                <th className="px-4 py-3 text-left font-medium">Email</th>
                                <th className="px-4 py-3 text-right font-medium">Bookings</th>
                                <th className="px-4 py-3 text-right font-medium">Total Hours</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y">
                              {analyticsData.topBookers.map((member, index) => (
                                <tr key={index} className="hover:bg-gray-50">
                                  <td className="px-4 py-3 font-medium text-gray-500">{index + 1}</td>
                                  <td className="px-4 py-3 font-medium">{member.member_name}</td>
                                  <td className="px-4 py-3 text-gray-600">{member.email}</td>
                                  <td className="px-4 py-3 text-right">{member.booking_count}</td>
                                  <td className="px-4 py-3 text-right">{(Number(member.total_minutes) / 60).toFixed(1)}h</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="text-center py-8 text-gray-500">No member data available</div>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Member Growth</CardTitle>
                      <CardDescription>New member sign-ups over time</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {analyticsData.memberGrowth.length > 0 ? (
                        <div className="space-y-2">
                          {analyticsData.memberGrowth.map((day, index) => {
                            const date = new Date(day.date);
                            const formattedDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

                            return (
                              <div key={index} className="flex justify-between items-center p-2 hover:bg-gray-50 rounded">
                                <span className="text-sm font-medium">{formattedDate}</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm text-gray-600">+{day.new_members} members</span>
                                  <Users className="h-4 w-4 text-green-600" />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="h-32 flex items-center justify-center bg-gray-100 rounded-lg">
                          <p className="text-gray-500">No member growth data available</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              )}
            </>
          )}
        </div>
      </div>
  );
}
