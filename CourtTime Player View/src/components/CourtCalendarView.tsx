import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { UnifiedSidebar } from './UnifiedSidebar';
import { BookingWizard } from './BookingWizard';
import { QuickReservePopup } from './QuickReservePopup';
import { NotificationDropdown } from './NotificationDropdown';
import { useNotifications } from '../contexts/NotificationContext';
import { useAuth } from '../contexts/AuthContext';
import { facilitiesApi, usersApi, bookingApi } from '../api/client';
import { Calendar, ChevronLeft, ChevronRight, Filter, Grid3X3, Bell, Info, User, Settings, BarChart3, MapPin, Users, LogOut, ChevronDown } from 'lucide-react';

interface CourtCalendarViewProps {
  onNavigateToPlayerDashboard: () => void;
  onNavigateToProfile: () => void;
  onNavigateToClub: (clubId: string) => void;
  onNavigateToBulletinBoard?: () => void;
  onNavigateToHittingPartner?: () => void;
  onNavigateToSettings?: () => void;
  onLogout: () => void;
  selectedFacilityId?: string;
  onFacilityChange?: (facilityId: string) => void;
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
}

export function CourtCalendarView({
  onNavigateToPlayerDashboard,
  onNavigateToProfile,
  onNavigateToClub,
  onNavigateToBulletinBoard = () => {},
  onNavigateToHittingPartner = () => {},
  onNavigateToSettings = () => {},
  onLogout,
  selectedFacilityId = 'sunrise-valley',
  onFacilityChange,
  sidebarCollapsed = false,
  onToggleSidebar
}: CourtCalendarViewProps) {
  const { unreadCount } = useNotifications();
  const { user } = useAuth();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedFacility, setSelectedFacility] = useState(selectedFacilityId);
  const [selectedView, setSelectedView] = useState('week');
  const [selectedCourtType, setSelectedCourtType] = useState<'tennis' | 'pickleball'>('tennis');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [memberFacilities, setMemberFacilities] = useState<any[]>([]);
  const [loadingFacilities, setLoadingFacilities] = useState(true);
  const [bookingsData, setBookingsData] = useState<any>({});
  const [loadingBookings, setLoadingBookings] = useState(false);
  const [bookingWizard, setBookingWizard] = useState({
    isOpen: false,
    court: '',
    courtId: '',
    time: '',
    date: '',
    facility: '',
    facilityId: '',
    selectedSlots: undefined as Array<{ court: string; courtId: string; time: string }> | undefined
  });

  // Drag selection state
  const [dragState, setDragState] = useState({
    isDragging: false,
    startCell: null as { court: string, time: string } | null,
    endCell: null as { court: string, time: string } | null,
    selectedCells: new Set<string>()
  });

  // Quick reserve popup state
  const [showQuickReserve, setShowQuickReserve] = useState(false);

  // Update current time every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Show quick reserve popup when calendar view loads
  useEffect(() => {
    // Show popup after a short delay to allow calendar to render
    const timer = setTimeout(() => {
      setShowQuickReserve(true);
    }, 500);

    return () => clearTimeout(timer);
  }, []); // Empty dependency array means this runs once when component mounts

  // Fetch user's member facilities with courts
  useEffect(() => {
    const fetchFacilities = async () => {
      if (!user?.memberFacilities || user.memberFacilities.length === 0) {
        setLoadingFacilities(false);
        return;
      }

      try {
        setLoadingFacilities(true);
        const facilitiesData = [];

        for (const facilityId of user.memberFacilities) {
          // Fetch facility details
          const facilityResponse = await facilitiesApi.getById(facilityId);
          if (facilityResponse.success && facilityResponse.data) {
            const facility = facilityResponse.data.facility;

            // Fetch courts for this facility
            const courtsResponse = await facilitiesApi.getCourts(facilityId);
            const courts = courtsResponse.success && courtsResponse.data?.courts
              ? courtsResponse.data.courts.map((court: any) => ({
                  id: court.id,
                  name: court.name,
                  type: court.courtType?.toLowerCase() || 'tennis'
                }))
              : [];

            facilitiesData.push({
              id: facility.id,
              name: facility.name,
              type: facility.type || facility.facilityType || 'Tennis Facility',
              courts
            });
          }
        }

        setMemberFacilities(facilitiesData);
      } catch (error) {
        console.error('Error fetching facilities:', error);
      } finally {
        setLoadingFacilities(false);
      }
    };

    fetchFacilities();
  }, [user?.memberFacilities]);

  // Function to fetch bookings (can be called directly)
  const fetchBookings = React.useCallback(async () => {
    if (!selectedFacility) {
      console.log('⚠️ No facility selected, skipping booking fetch');
      return;
    }

    try {
      setLoadingBookings(true);

      // Format date as YYYY-MM-DD for API
      const dateStr = selectedDate.toISOString().split('T')[0];
      console.log('📅 Fetching bookings for facility:', selectedFacility, 'date:', dateStr);

      const response = await bookingApi.getByFacility(selectedFacility, dateStr);
      console.log('📦 Bookings API response:', response);

      if (response.success && response.data?.bookings) {
        console.log('✅ Processing', response.data.bookings.length, 'bookings');
        // Transform API bookings to match the format expected by the UI
        const transformedBookings: any = {};

        response.data.bookings.forEach((booking: any) => {
          const courtName = booking.courtName;

          // Convert 24h time to 12h format for UI
          const startTime = formatTimeTo12Hour(booking.startTime);
          console.log('  📍 Booking:', courtName, 'at', startTime, '- User:', booking.userName);

          if (!transformedBookings[courtName]) {
            transformedBookings[courtName] = {};
          }

          transformedBookings[courtName][startTime] = {
            player: booking.userName || 'Reserved',
            duration: `${booking.durationMinutes}min`,
            type: 'reservation',
            bookingId: booking.id,
            userId: booking.userId
          };
        });

        console.log('🎨 Transformed bookings:', transformedBookings);
        setBookingsData(transformedBookings);
      } else {
        console.log('❌ No bookings found or request failed');
        setBookingsData({});
      }
    } catch (error) {
      console.error('Error fetching bookings:', error);
      setBookingsData({});
    } finally {
      setLoadingBookings(false);
    }
  }, [selectedFacility, selectedDate]);

  // Fetch bookings for selected facility and date
  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  // Helper to convert 24h time to 12h format (e.g., "14:00:00" -> "2:00 PM")
  const formatTimeTo12Hour = (time24: string): string => {
    const [hours24, minutes] = time24.split(':').map(Number);
    const period = hours24 >= 12 ? 'PM' : 'AM';
    const hours12 = hours24 % 12 || 12;
    return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`;
  };

  // Hardcoded fallback facilities (for users without memberships)
  const fallbackFacilities = [
    { 
      id: 'sunrise-valley', 
      name: 'Sunrise Valley HOA', 
      type: 'HOA Tennis & Pickleball Courts',
      courts: [
        { name: 'Tennis Court 1', type: 'tennis' },
        { name: 'Tennis Court 2', type: 'tennis' },
        { name: 'Pickleball Court 1', type: 'pickleball' },
        { name: 'Pickleball Court 2', type: 'pickleball' }
      ]
    },
    { 
      id: 'downtown', 
      name: 'Downtown Tennis Center', 
      type: 'Tennis Club',
      courts: [
        { name: 'Court 1', type: 'tennis' },
        { name: 'Court 2', type: 'tennis' },
        { name: 'Court 3', type: 'tennis' },
        { name: 'Court 4', type: 'tennis' }
      ]
    },
    { 
      id: 'riverside', 
      name: 'Riverside Tennis Club', 
      type: 'Premium Tennis Club',
      courts: [
        { name: 'Center Court', type: 'tennis' },
        { name: 'Court A', type: 'tennis' },
        { name: 'Court B', type: 'tennis' },
        { name: 'Practice Court', type: 'tennis' }
      ]
    },
    {
      id: 'westside',
      name: 'Westside Pickleball Club',
      type: 'Pickleball Club',
      courts: [
        { name: 'Court 1', type: 'pickleball' },
        { name: 'Court 2', type: 'pickleball' },
        { name: 'Court 3', type: 'pickleball' },
        { name: 'Court 4', type: 'pickleball' },
        { name: 'Court 5', type: 'pickleball' },
        { name: 'Court 6', type: 'pickleball' }
      ]
    },
    {
      id: 'eastgate',
      name: 'Eastgate Sports Complex',
      type: 'Multi-Sport Complex',
      courts: [
        { name: 'Tennis Court A', type: 'tennis' },
        { name: 'Tennis Court B', type: 'tennis' },
        { name: 'Pickleball Court 1', type: 'pickleball' },
        { name: 'Pickleball Court 2', type: 'pickleball' },
        { name: 'Pickleball Court 3', type: 'pickleball' },
        { name: 'Pickleball Court 4', type: 'pickleball' }
      ]
    }
  ];

  // Admin facilities (if user is admin)
  const adminFacilities = [
    { 
      id: 'sunrise-valley', 
      name: 'Sunrise Valley HOA', 
      type: 'HOA Tennis & Pickleball Courts' 
    },
    { 
      id: 'downtown', 
      name: 'Downtown Tennis Center', 
      type: 'Tennis Club' 
    },
    { 
      id: 'riverside', 
      name: 'Riverside Tennis Club', 
      type: 'Premium Tennis Club' 
    },
    {
      id: 'westside',
      name: 'Westside Pickleball Club',
      type: 'Pickleball Club'
    },
    {
      id: 'eastgate',
      name: 'Eastgate Sports Complex',
      type: 'Multi-Sport Complex'
    }
  ];

  const handleFacilityChange = (facilityId: string) => {
    setSelectedFacility(facilityId);
    if (onFacilityChange) {
      onFacilityChange(facilityId);
    }
  };

  const handleAdminDashboardNavigation = () => {
    onNavigateToAdminDashboard();
  };

  // Use fetched facilities or fallback to hardcoded ones
  const availableFacilities = memberFacilities.length > 0 ? memberFacilities : fallbackFacilities;
  const currentFacility = availableFacilities.find(f => f.id === selectedFacility);
  
  // Filter courts based on selected court type
  const allCourts = currentFacility?.courts || [];
  const courts = React.useMemo(() => {
    return allCourts.filter(court => court.type === selectedCourtType);
  }, [allCourts, selectedCourtType]);

  // Helper function to check if date is today
  const isToday = React.useCallback((date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  }, []);

  // Helper function to check if a time slot is in the past
  const isPastTime = React.useCallback((timeSlot: string) => {
    if (!isToday(selectedDate)) return false;
    
    const [time, period] = timeSlot.split(' ');
    let [hours, minutes] = time.split(':').map(Number);
    
    // Convert to 24-hour format
    if (period === 'PM' && hours !== 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;
    
    const slotTime = new Date();
    slotTime.setHours(hours, minutes || 0, 0, 0);
    
    return slotTime < currentTime;
  }, [selectedDate, currentTime, isToday]);

  // Generate time slots for the day
  const allTimeSlots = [
    '6:00 AM', '7:00 AM', '8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM',
    '12:00 PM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM',
    '6:00 PM', '7:00 PM', '8:00 PM', '9:00 PM'
  ];

  // Filter time slots to only show current time and after for today
  const timeSlots = React.useMemo(() => {
    if (!isToday(selectedDate)) {
      // For future dates, show all time slots
      return allTimeSlots;
    }
    
    // For today, filter out past time slots
    return allTimeSlots.filter(timeSlot => !isPastTime(timeSlot));
  }, [selectedDate, currentTime, isToday, isPastTime]);

  // Use fetched bookings from API
  const bookings = bookingsData;

  const navigateDate = (direction: 'prev' | 'next') => {
    const newDate = new Date(selectedDate);
    newDate.setDate(selectedDate.getDate() + (direction === 'next' ? 1 : -1));
    setSelectedDate(newDate);
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { 
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const handleBookingClick = (court: string, time: string) => {
    const booking = bookings[court as keyof typeof bookings]?.[time];
    if (booking?.type === 'available') {
      // Handle booking logic
      console.log(`Booking ${court} at ${time}`);
    }
  };

  const handleEmptySlotClick = (courtName: string, time: string) => {
    if (isPastTime(time)) return; // Don't allow booking past times

    // Find the court object to get its ID
    const courtObj = courts.find(c => c.name === courtName);
    if (!courtObj) {
      console.error('Court not found:', courtName);
      return;
    }

    // If we have selected cells from dragging, open booking wizard with them
    if (dragState.selectedCells.size > 0) {
      const selectedSlots = Array.from(dragState.selectedCells).map(cellId => {
        const [court, timeSlot] = cellId.split('|');
        const slotCourtObj = courts.find(c => c.name === court);
        return {
          court,
          courtId: slotCourtObj?.id || '',
          time: timeSlot
        };
      });

      // Format date as YYYY-MM-DD to avoid timezone issues
      const year = selectedDate.getFullYear();
      const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
      const day = String(selectedDate.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;

      setBookingWizard({
        isOpen: true,
        court: courtName,
        courtId: courtObj.id,
        time: time,
        date: dateStr,
        facility: currentFacility?.name || '',
        facilityId: currentFacility?.id || '',
        selectedSlots: selectedSlots
      });
    } else {
      // Single slot booking
      // Format date as YYYY-MM-DD to avoid timezone issues
      const year = selectedDate.getFullYear();
      const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
      const day = String(selectedDate.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;

      setBookingWizard({
        isOpen: true,
        court: courtName,
        courtId: courtObj.id,
        time,
        date: dateStr,
        facility: currentFacility?.name || '',
        facilityId: currentFacility?.id || '',
        selectedSlots: undefined
      });
    }
  };

  // Drag handlers
  const handleMouseDown = (courtName: string, time: string, event: React.MouseEvent) => {
    if (isPastTime(time)) return;
    
    const booking = bookings[courtName as keyof typeof bookings]?.[time];
    if (booking) return; // Don't start drag on booked slots
    
    event.preventDefault();
    setDragState({
      isDragging: true,
      startCell: { court: courtName, time },
      endCell: { court: courtName, time },
      selectedCells: new Set([`${courtName}|${time}`])
    });
  };

  const handleMouseEnter = (courtName: string, time: string) => {
    if (!dragState.isDragging || isPastTime(time)) return;
    
    const booking = bookings[courtName as keyof typeof bookings]?.[time];
    if (booking) return; // Don't include booked slots in selection
    
    // Only allow dragging within the same court
    if (dragState.startCell && dragState.startCell.court !== courtName) return;
    
    const startTimeIndex = timeSlots.indexOf(dragState.startCell!.time);
    const currentTimeIndex = timeSlots.indexOf(time);
    const endTimeIndex = Math.max(startTimeIndex, currentTimeIndex);
    const beginTimeIndex = Math.min(startTimeIndex, currentTimeIndex);
    
    // Create selection from start to current position
    const newSelectedCells = new Set<string>();
    for (let i = beginTimeIndex; i <= endTimeIndex; i++) {
      const timeSlot = timeSlots[i];
      const booking = bookings[courtName as keyof typeof bookings]?.[timeSlot];
      // Only include available slots and non-past times
      if (!booking && !isPastTime(timeSlot)) {
        newSelectedCells.add(`${courtName}|${timeSlot}`);
      }
    }
    
    setDragState(prev => ({
      ...prev,
      endCell: { court: courtName, time },
      selectedCells: newSelectedCells
    }));
  };

  const handleMouseUp = () => {
    if (dragState.isDragging && dragState.selectedCells.size > 0) {
      // If multiple cells selected, open booking wizard
      const firstSelected = Array.from(dragState.selectedCells)[0];
      const [court, time] = firstSelected.split('|');
      handleEmptySlotClick(court, time);
    }
    
    setDragState({
      isDragging: false,
      startCell: null,
      endCell: null,
      selectedCells: new Set()
    });
  };

  // Add mouse up listener to document to handle drag end outside grid
  useEffect(() => {
    if (dragState.isDragging) {
      document.addEventListener('mouseup', handleMouseUp);
      return () => document.removeEventListener('mouseup', handleMouseUp);
    }
  }, [dragState.isDragging]);

  // Quick reserve handlers
  const handleQuickReserve = (reservation: {
    facility: string;
    court: string;
    date: string;
    time: string;
    duration: string;
    playerName: string;
  }) => {
    console.log('Quick reservation made:', reservation);
    // In a real app, this would send the reservation to the backend
    alert(`Quick reservation confirmed!\n${reservation.court} at ${reservation.facility}\n${reservation.date} ${reservation.time}`);
  };

  const closeQuickReserve = () => {
    setShowQuickReserve(false);
  };

  const closeBookingWizard = () => {
    setBookingWizard({
      isOpen: false,
      court: '',
      courtId: '',
      time: '',
      date: '',
      facility: '',
      facilityId: '',
      selectedSlots: undefined
    });

    // Clear drag selection when closing
    setDragState({
      isDragging: false,
      startCell: null,
      endCell: null,
      selectedCells: new Set()
    });
  };



  // Helper function to get current time position for the red line
  const getCurrentTimePosition = () => {
    if (!isToday(selectedDate)) return null;
    
    const hours = currentTime.getHours();
    const minutes = currentTime.getMinutes();
    
    // Convert to time slot index (6 AM = index 0)
    const startHour = 6;
    const timeIndex = hours - startHour + (minutes / 60);
    
    // Each slot is about 60px high, calculate position
    return timeIndex * 60 + 40; // 40px for header offset
  };

  const currentTimePosition = getCurrentTimePosition();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Unified Sidebar */}
      <UnifiedSidebar
        userType="player"
        onNavigateToProfile={onNavigateToProfile}
        onNavigateToPlayerDashboard={onNavigateToPlayerDashboard}
        onNavigateToCalendar={() => {}} // Already on calendar view
        onNavigateToClub={onNavigateToClub}
        onNavigateToBulletinBoard={onNavigateToBulletinBoard}
        onNavigateToHittingPartner={onNavigateToHittingPartner}
        onLogout={onLogout}
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={onToggleSidebar}
        currentPage="court-calendar"
      />

      {/* Main Content */}
      <div className={`transition-all duration-300 ${sidebarCollapsed ? 'ml-16' : 'ml-64'}`}>
        {/* Header */}
        <header className="bg-white border-b border-gray-200 relative z-10">
          <div className="px-6 py-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-6">
                <h1 className="text-2xl font-medium">Court Calendar</h1>
              </div>
              
              <div className="flex items-center gap-4">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setShowQuickReserve(true)}
                  className="flex items-center gap-2"
                >
                  <Calendar className="h-4 w-4" />
                  Quick Reserve
                </Button>
                <Button variant="ghost" size="sm" className="relative">
                  <Bell className="h-5 w-5" />
                  <span className="absolute -top-1 -right-1 h-3 w-3 bg-red-500 rounded-full text-xs"></span>
                </Button>
              </div>
            </div>
          </div>
        </header>

        {/* Controls */}
        <div className="px-6 py-6">
        <div className="flex flex-col gap-6 mb-6">
          {/* Facility Name and Court Type Filter */}
          <div className="flex flex-wrap items-center gap-4">
            <h3 className="text-lg font-medium">{currentFacility?.name}</h3>
            <Badge variant="outline">{currentFacility?.type}</Badge>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-600">Court Type:</span>
              <div className="flex gap-2">
                <Button
                  variant={selectedCourtType === 'tennis' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedCourtType('tennis')}
                  className={selectedCourtType === 'tennis' ? 'bg-blue-600 hover:bg-blue-700' : ''}
                >
                  Tennis
                </Button>
                <Button
                  variant={selectedCourtType === 'pickleball' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedCourtType('pickleball')}
                  className={selectedCourtType === 'pickleball' ? 'bg-green-600 hover:bg-green-700' : ''}
                >
                  Pickleball
                </Button>
              </div>
            </div>
          </div>

          {/* Facility Selection and Date Navigation */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            <div className="flex flex-wrap items-center gap-4">
              {/* Facility Selector */}
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-600">Facility:</span>
                <Select value={selectedFacility} onValueChange={setSelectedFacility}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableFacilities.map((facility) => (
                      <SelectItem key={facility.id} value={facility.id}>
                        {facility.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Date Navigation */}
            <div className="flex items-center justify-end gap-4">
              <Button variant="outline" size="sm" onClick={() => navigateDate('prev')}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="text-center min-w-[120px]">
                <h2 className="font-medium">{formatDate(selectedDate)}</h2>
              </div>
              <Button variant="outline" size="sm" onClick={() => navigateDate('next')}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Instructions */}
        <div className="flex items-center gap-2 mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
          <Info className="h-4 w-4 text-blue-600" />
          <span className="text-sm text-blue-800">
            Click on any empty time slot to book a court reservation. Hold and drag to select multiple consecutive slots.
          </span>
        </div>

        {/* Calendar Grid */}
        <Card>
          <CardContent className="p-0">
            {courts.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <p>No {selectedCourtType} courts available at this facility.</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => setSelectedCourtType(selectedCourtType === 'tennis' ? 'pickleball' : 'tennis')}
                >
                  Show {selectedCourtType === 'tennis' ? 'Pickleball' : 'Tennis'} Courts
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <div className="min-w-max relative">
                {/* Current Time Line */}
                {currentTimePosition && isToday(selectedDate) && (
                  <div 
                    className="absolute left-0 right-0 z-10 flex items-center"
                    style={{ top: `${currentTimePosition}px` }}
                  >
                    <div className="w-full h-0.5 bg-red-500"></div>
                    <div className="absolute -left-2 w-2 h-2 bg-red-500 rounded-full"></div>
                    <div className="absolute -right-2 w-2 h-2 bg-red-500 rounded-full"></div>
                  </div>
                )}

                {/* Header Row - Court Names */}
                <div className="grid grid-cols-[120px_repeat(var(--court-count),_200px)] border-b border-gray-200 bg-gray-50" style={{'--court-count': courts.length} as React.CSSProperties}>
                  <div className="p-4 border-r border-gray-200">
                    <span className="font-medium text-sm text-gray-600">Time</span>
                  </div>
                  {courts.map((court, index) => (
                    <div key={index} className="p-4 border-r border-gray-200 last:border-r-0">
                      <div className="font-medium text-sm">{court.name}</div>
                      <div className="text-xs text-gray-600 mt-1 capitalize">{court.type}</div>
                    </div>
                  ))}
                </div>

                {/* Time Slots */}
                {timeSlots.map((time, timeIndex) => {
                  const isPast = isPastTime(time);
                  return (
                    <div key={timeIndex} className="grid grid-cols-[120px_repeat(var(--court-count),_200px)] border-b border-gray-100 last:border-b-0" style={{'--court-count': courts.length} as React.CSSProperties}>
                      <div className={`p-4 border-r border-gray-200 bg-gray-50 ${isPast ? 'opacity-50' : ''}`}>
                        <span className="font-medium text-sm">{time}</span>
                      </div>
                      {courts.map((court, courtIndex) => {
                        const booking = bookings[court.name as keyof typeof bookings]?.[time];
                        return (
                          <div 
                            key={courtIndex} 
                            className={`
                              p-2 border-r border-gray-200 last:border-r-0 min-h-[60px] relative
                              ${isPast ? 'bg-gray-100 opacity-50' : ''}
                              ${!booking && !isPast ? 'cursor-pointer hover:bg-gray-50' : ''}
                              ${dragState.selectedCells.has(`${court.name}|${time}`) ? 'bg-blue-100 border-blue-300' : ''}
                              ${dragState.isDragging && !booking && !isPast ? 'select-none' : ''}
                            `}
                            onClick={() => !booking && !isPast && handleEmptySlotClick(court.name, time)}
                            onMouseDown={(e) => !booking && !isPast && handleMouseDown(court.name, time, e)}
                            onMouseEnter={() => handleMouseEnter(court.name, time)}
                          >
                            {booking && booking.type === 'reservation' && (
                              <div className={`p-2 rounded-md h-full border ${
                                court.type === 'tennis' 
                                  ? 'bg-blue-100 text-blue-800 border-blue-300' 
                                  : 'bg-green-100 text-green-800 border-green-300'
                              }`}>
                                <div className="text-xs font-medium">{booking.player}</div>
                                <div className="text-xs opacity-75">{booking.duration}</div>
                              </div>
                            )}
                            {isPast && !booking && (
                              <div className="text-xs text-gray-400 p-2">
                                Not available
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
            )}
          </CardContent>
        </Card>

        {/* Legend */}
        <div className="mt-4 flex flex-wrap items-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-blue-100 border border-blue-300 rounded"></div>
            <span>Tennis Reserved</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-green-100 border border-green-300 rounded"></div>
            <span>Pickleball Reserved</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-white border border-gray-300 rounded"></div>
            <span>Available</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-gray-100 border border-gray-300 rounded"></div>
            <span>Past/Unavailable</span>
          </div>
          {isToday(selectedDate) && (
            <div className="flex items-center gap-2">
              <div className="w-4 h-0.5 bg-red-500"></div>
              <span>Current Time</span>
            </div>
          )}
        </div>
        </div>
      </div>

      {/* Booking Wizard */}
      <BookingWizard
        isOpen={bookingWizard.isOpen}
        onClose={closeBookingWizard}
        court={bookingWizard.court}
        courtId={bookingWizard.courtId}
        date={bookingWizard.date}
        time={bookingWizard.time}
        facility={bookingWizard.facility}
        facilityId={bookingWizard.facilityId}
        selectedSlots={bookingWizard.selectedSlots}
        onBookingCreated={fetchBookings}
      />

      {/* Quick Reserve Popup */}
      <QuickReservePopup
        isOpen={showQuickReserve}
        onClose={closeQuickReserve}
        onReserve={handleQuickReserve}
        facilities={memberFacilities}
        selectedFacilityId={selectedFacility}
      />
    </div>
  );
}