import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { UnifiedSidebar } from './UnifiedSidebar';
import { NotificationDropdown } from './NotificationDropdown';
import { useNotifications } from '../contexts/NotificationContext';
import { useAuth } from '../contexts/AuthContext';
import { playerProfileApi } from '../api/client';
import { Bell, Calendar, Clock, MapPin, Plus, Users, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface PlayerDashboardProps {
  onLogout: () => void;
  onQuickBook: () => void;
  onNavigateToProfile: () => void;
  onNavigateToCalendar: () => void;
  onNavigateToClub: (clubId: string) => void;
  onNavigateToBulletinBoard?: () => void;
  onNavigateToHittingPartner?: () => void;
  onNavigateToSettings?: () => void;
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
}

export function PlayerDashboard({
  onLogout,
  onQuickBook,
  onNavigateToProfile,
  onNavigateToCalendar,
  onNavigateToClub,
  onNavigateToBulletinBoard = () => {},
  onNavigateToHittingPartner = () => {},
  onNavigateToSettings = () => {},
  sidebarCollapsed = false,
  onToggleSidebar
}: PlayerDashboardProps) {
  const { user } = useAuth();
  const { unreadCount, showToast } = useNotifications();
  const [loading, setLoading] = useState(true);
  const [upcomingBookings, setUpcomingBookings] = useState<any[]>([]);
  const [memberFacilities, setMemberFacilities] = useState<any[]>([]);

  useEffect(() => {
    if (user?.id) {
      loadDashboardData();
    }
  }, [user?.id]);

  const loadDashboardData = async () => {
    if (!user?.id) return;

    try {
      setLoading(true);

      // Load profile to get facilities
      const profileResponse = await playerProfileApi.getProfile(user.id);
      if (profileResponse.success && profileResponse.data?.profile) {
        setMemberFacilities(profileResponse.data.profile.memberFacilities || []);
      }

      // Load upcoming bookings
      const bookingsResponse = await playerProfileApi.getBookings(user.id, true);
      if (bookingsResponse.success && bookingsResponse.data?.bookings) {
        setUpcomingBookings(bookingsResponse.data.bookings);
      }
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  // Demo notification triggers
  const triggerDemoNotifications = () => {
    setTimeout(() => {
      showToast(
        'reservation_reminder',
        'Upcoming Court Session',
        'Your tennis match starts in 30 minutes.',
        {
          facility: 'Tennis Center',
          court: 'Court 2',
          date: 'Today',
          time: '2:00 PM - 3:00 PM'
        }
      );
    }, 1000);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return 'Tomorrow';
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  const formatTime = (startTime: string, endTime: string) => {
    const formatTimeOnly = (time: string) => {
      const [hours, minutes] = time.split(':');
      const hour = parseInt(hours);
      const ampm = hour >= 12 ? 'PM' : 'AM';
      const displayHour = hour % 12 || 12;
      return `${displayHour}:${minutes} ${ampm}`;
    };

    return `${formatTimeOnly(startTime)} - ${formatTimeOnly(endTime)}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed':
        return 'default';
      case 'pending':
        return 'secondary';
      case 'cancelled':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  const getFirstName = () => {
    if (!user?.fullName) return 'there';
    return user.fullName.split(' ')[0];
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg font-medium">Loading dashboard...</div>
        </div>
      </div>
    );
  }

  const hasNoFacilities = memberFacilities.length === 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <UnifiedSidebar
        userType="player"
        onNavigateToProfile={onNavigateToProfile}
        onNavigateToPlayerDashboard={() => {}}
        onNavigateToCalendar={onNavigateToCalendar}
        onNavigateToClub={onNavigateToClub}
        onNavigateToBulletinBoard={onNavigateToBulletinBoard}
        onNavigateToHittingPartner={onNavigateToHittingPartner}
        onLogout={onLogout}
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={onToggleSidebar}
        currentPage="player-dashboard"
      />

      <div className={`${sidebarCollapsed ? 'ml-16' : 'ml-64'} transition-all duration-300 ease-in-out`}>
        <header className="bg-white border-b border-gray-200 relative z-10">
          <div className="px-6 py-4">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-2xl font-medium">Personal Dashboard</h1>
              </div>

              <div className="flex items-center gap-4">
                <NotificationDropdown>
                  <Button variant="ghost" size="sm" className="relative">
                    <Bell className="h-5 w-5" />
                    {unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 h-3 w-3 bg-red-500 rounded-full text-xs flex items-center justify-center min-w-[12px] text-white">
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    )}
                  </Button>
                </NotificationDropdown>
              </div>
            </div>
          </div>
        </header>

        <main className="px-6 py-8">
          <div className="mb-8">
            <h2 className="text-3xl font-medium mb-2">Welcome back, {getFirstName()}! 👋</h2>
            <p className="text-gray-600">
              {hasNoFacilities
                ? 'Request membership to a facility to start booking courts'
                : 'Ready to book your next court session?'}
            </p>
          </div>

          {/* No Facility Alert */}
          {hasNoFacilities && (
            <Card className="mb-6 border-blue-200 bg-blue-50">
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
                  <div className="flex-1">
                    <h3 className="font-medium text-blue-900 mb-1">No Facility Membership</h3>
                    <p className="text-sm text-blue-800 mb-3">
                      You're not currently a member of any facility. Request membership to access courts and start booking sessions.
                    </p>
                    <Button
                      onClick={onNavigateToProfile}
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      Request Membership
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column */}
            <div className="lg:col-span-2 space-y-6">
              {/* Upcoming Reservations */}
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Calendar className="h-5 w-5" />
                        Upcoming Reservations
                      </CardTitle>
                      <CardDescription>Your scheduled court bookings</CardDescription>
                    </div>
                    {!hasNoFacilities && (
                      <Button onClick={onQuickBook} size="sm">
                        <Plus className="h-4 w-4 mr-1" />
                        Book Court
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {upcomingBookings.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                      <Calendar className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                      <p className="font-medium">No upcoming bookings</p>
                      <p className="text-sm mt-1">
                        {hasNoFacilities
                          ? 'Join a facility to start booking courts'
                          : 'Book a court to get started'}
                      </p>
                      {!hasNoFacilities && (
                        <Button onClick={onQuickBook} className="mt-4" size="sm">
                          Book Your First Court
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {upcomingBookings.map((booking) => (
                        <div key={booking.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                          <div className="flex items-center gap-4">
                            <div className="w-2 h-10 bg-blue-500 rounded-full"></div>
                            <div>
                              <h4 className="font-medium">{booking.courtName}</h4>
                              <p className="text-sm text-gray-600 flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {booking.facilityName}
                              </p>
                              <p className="text-sm text-gray-600 flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {formatDate(booking.bookingDate)} • {formatTime(booking.startTime, booking.endTime)}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={getStatusColor(booking.status)}>
                              {booking.status}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Right Column */}
            <div className="space-y-6">
              {/* Member Facilities */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Facility Memberships
                  </CardTitle>
                  <CardDescription>
                    {memberFacilities.length === 0
                      ? 'No active memberships'
                      : `${memberFacilities.length} membership${memberFacilities.length !== 1 ? 's' : ''}`}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {memberFacilities.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <Users className="h-10 w-10 mx-auto mb-2 text-gray-300" />
                      <p className="text-sm mb-3">You haven't joined any facilities yet</p>
                      <Button onClick={onNavigateToProfile} variant="outline" size="sm">
                        Browse Facilities
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {memberFacilities.map((facility: any) => (
                        <div
                          key={facility.facilityId}
                          onClick={() => onNavigateToClub(facility.facilityId)}
                          className="flex items-center justify-between p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex-1">
                            <h4 className="font-medium text-sm">{facility.facilityName}</h4>
                            <p className="text-xs text-gray-600">{facility.membershipType}</p>
                          </div>
                          <div className="flex items-center gap-1">
                            <Badge
                              variant="outline"
                              className={`text-xs ${
                                facility.status === 'active'
                                  ? 'border-green-200 text-green-700 bg-green-50'
                                  : facility.status === 'pending'
                                  ? 'border-yellow-200 text-yellow-700 bg-yellow-50'
                                  : 'border-gray-200 text-gray-700 bg-gray-50'
                              }`}
                            >
                              {facility.status}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Quick Actions */}
              {!hasNoFacilities && (
                <Card>
                  <CardHeader>
                    <CardTitle>Quick Actions</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <Button
                      onClick={onNavigateToCalendar}
                      variant="outline"
                      className="w-full justify-start"
                    >
                      <Calendar className="h-4 w-4 mr-2" />
                      View Court Calendar
                    </Button>
                    <Button
                      onClick={onNavigateToHittingPartner}
                      variant="outline"
                      className="w-full justify-start"
                    >
                      <Users className="h-4 w-4 mr-2" />
                      Find Hitting Partner
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
