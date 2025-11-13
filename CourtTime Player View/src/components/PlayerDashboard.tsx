import React from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { UnifiedSidebar } from './UnifiedSidebar';
import { NotificationDropdown } from './NotificationDropdown';
import { useNotifications } from '../contexts/NotificationContext';
import { Bell, Calendar, Clock, MapPin, Plus, Star, Users } from 'lucide-react';

interface PlayerDashboardProps {
  onLogout: () => void;
  onQuickBook: () => void;
  onNavigateToProfile: () => void;
  onNavigateToCalendar: () => void;
  onNavigateToClub: (clubId: string) => void;
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
  onNavigateToHittingPartner = () => {},
  onNavigateToSettings = () => {},
  sidebarCollapsed = false,
  onToggleSidebar
}: PlayerDashboardProps) {
  const { unreadCount, showToast } = useNotifications();

  // Demo notification triggers
  const triggerDemoNotifications = () => {
    // Simulate different types of notifications with realistic delays
    setTimeout(() => {
      showToast(
        'reservation_reminder',
        'Upcoming Court Session',
        'Your tennis match at Downtown Tennis Center starts in 30 minutes.',
        {
          facility: 'Downtown Tennis Center',
          court: 'Tennis Court 2',
          date: 'Today',
          time: '2:00 PM - 3:00 PM'
        }
      );
    }, 1000);

    setTimeout(() => {
      showToast(
        'weather_alert',
        'Weather Update',
        'Rain is expected this evening. Consider indoor court options for your upcoming reservations.'
      );
    }, 3000);

    setTimeout(() => {
      showToast(
        'court_change',
        'Court Change Notice',
        'Your tomorrow evening reservation has been moved to Center Court due to maintenance.',
        {
          facility: 'Riverside Tennis Club',
          court: 'Center Court',
          date: 'Tomorrow',
          time: '7:00 PM - 8:30 PM'
        }
      );
    }, 5000);
  };
  const upcomingReservations = [
    {
      id: 1,
      facility: 'Downtown Tennis Center',
      court: 'Tennis Court 2',
      date: 'Today',
      time: '2:00 PM - 3:00 PM',
      status: 'confirmed'
    },
    {
      id: 2,
      facility: 'Riverside Tennis Club',
      court: 'Center Court',
      date: 'Tomorrow',
      time: '7:00 PM - 8:30 PM',
      status: 'confirmed'
    },
    {
      id: 3,
      facility: 'Sunrise Valley HOA',
      court: 'Pickleball Court 1',
      date: 'Dec 28',
      time: '10:00 AM - 11:00 AM',
      status: 'pending'
    }
  ];

  const recentActivity = [
    { action: 'Booked Tennis Court 2', facility: 'Downtown Tennis Center', time: '2 hours ago' },
    { action: 'Cancelled Pickleball Court 1', facility: 'Sunrise Valley HOA', time: '1 day ago' },
    { action: 'Completed session', facility: 'Riverside Tennis Club', time: '2 days ago' }
  ];

  const memberFacilities = [
    { name: 'Sunrise Valley HOA', type: 'HOA Tennis & Pickleball Courts', status: 'Active Member' },
    { name: 'Downtown Tennis Center', type: 'Tennis Club', status: 'Premium Member' },
    { name: 'Riverside Tennis Club', type: 'Tennis Club', status: 'Monthly Member' }
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Unified Sidebar */}
      <UnifiedSidebar
        userType="player"
        onNavigateToProfile={onNavigateToProfile}
        onNavigateToPlayerDashboard={() => {}} // No-op since we're already on the dashboard
        onNavigateToCalendar={onNavigateToCalendar}
        onNavigateToClub={onNavigateToClub}
        onNavigateToHittingPartner={onNavigateToHittingPartner}
        onLogout={onLogout}
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={onToggleSidebar}
        currentPage="player-dashboard"
      />

      {/* Main Content */}
      <div className={`${sidebarCollapsed ? 'ml-16' : 'ml-64'} transition-all duration-300 ease-in-out`}>
        {/* Header */}
        <header className="bg-white border-b border-gray-200 relative z-10">
          <div className="px-6 py-4">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-2xl font-medium">Personal Dashboard</h1>
              </div>
              
              <div className="flex items-center gap-4">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={triggerDemoNotifications}
                  className="text-xs"
                >
                  Demo Notifications
                </Button>
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

        {/* Main Content */}
        <main className="px-6 py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h2 className="text-3xl font-medium mb-2">Welcome back, John! 👋</h2>
          <p className="text-gray-600">Ready to book your next court session?</p>
        </div>



        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Upcoming Reservations */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Upcoming Reservations
                </CardTitle>
                <CardDescription>Your scheduled court bookings</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {upcomingReservations.map((reservation) => (
                    <div key={reservation.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                      <div className="flex items-center gap-4">
                        <div className="w-2 h-10 bg-blue-500 rounded-full"></div>
                        <div>
                          <h4 className="font-medium">{reservation.court}</h4>
                          <p className="text-sm text-gray-600 flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {reservation.facility}
                          </p>
                          <p className="text-sm text-gray-600 flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {reservation.date} • {reservation.time}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={reservation.status === 'confirmed' ? 'default' : 'secondary'}>
                          {reservation.status}
                        </Badge>
                        <Button variant="outline" size="sm">Manage</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Recent Activity */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>Your booking history</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {recentActivity.map((activity, index) => (
                    <div key={index} className="flex items-center gap-3 pb-3 border-b border-gray-100 last:border-0">
                      <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">{activity.action}</p>
                        <p className="text-xs text-gray-600">{activity.facility}</p>
                      </div>
                      <span className="text-xs text-gray-500">{activity.time}</span>
                    </div>
                  ))}
                </div>
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
                  Member Facilities
                </CardTitle>
                <CardDescription>Facilities where you have active membership</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {memberFacilities.map((facility, index) => (
                    <div key={index} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                      <div>
                        <h4 className="font-medium text-sm">{facility.name}</h4>
                        <p className="text-xs text-gray-600">{facility.type}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Badge variant="outline" className="text-xs">
                          {facility.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
        </main>
      </div>
    </div>
  );
}