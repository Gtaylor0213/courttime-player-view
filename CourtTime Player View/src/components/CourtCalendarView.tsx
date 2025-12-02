import React, { useState, useEffect, useRef } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { UnifiedSidebar } from './UnifiedSidebar';
import { BookingWizard } from './BookingWizard';
import { QuickReservePopup } from './QuickReservePopup';
import { NotificationBell } from './NotificationBell';
import { ReservationDetailsModal } from './ReservationDetailsModal';
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
  onNavigateToMessages?: () => void;
  onNavigateToSettings?: () => void;
  onNavigateToAdminDashboard?: () => void;
  onNavigateToFacilityManagement?: () => void;
  onNavigateToCourtManagement?: () => void;
  onNavigateToBookingManagement?: () => void;
  onNavigateToAdminBooking?: () => void;
  onNavigateToMemberManagement?: () => void;
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
  onNavigateToMessages = () => {},
  onNavigateToSettings = () => {},
  onNavigateToAdminDashboard = () => {},
  onNavigateToFacilityManagement = () => {},
  onNavigateToCourtManagement = () => {},
  onNavigateToBookingManagement = () => {},
  onNavigateToAdminBooking = () => {},
  onNavigateToMemberManagement = () => {},
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
  const [selectedCourtType, setSelectedCourtType] = useState<'tennis' | 'pickleball' | null>('tennis');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [memberFacilities, setMemberFacilities] = useState<any[]>([]);
  const [loadingFacilities, setLoadingFacilities] = useState(true);
  const [bookingsData, setBookingsData] = useState<any>({});
  const [loadingBookings, setLoadingBookings] = useState(false);
  const calendarScrollRef = useRef<HTMLDivElement>(null);
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

  // Reservation details modal state
  const [reservationDetailsModal, setReservationDetailsModal] = useState({
    isOpen: false,
    reservation: null as any
  });

  // Update current time every second for smooth line movement
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Show quick reserve popup only on first login (once per session)
  useEffect(() => {
    // Check if popup has already been shown this session
    const hasShownPopup = sessionStorage.getItem('quick_reserve_shown');

    if (!hasShownPopup) {
      // Show popup after a short delay to allow calendar to render
      const timer = setTimeout(() => {
        setShowQuickReserve(true);
        // Mark as shown for this session
        sessionStorage.setItem('quick_reserve_shown', 'true');
      }, 500);

      return () => clearTimeout(timer);
    }
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
          const endTime24 = booking.endTime;
          console.log('  📍 Booking:', courtName, 'from', startTime, '- User:', booking.userName, '- Duration:', booking.durationMinutes, 'min');

          if (!transformedBookings[courtName]) {
            transformedBookings[courtName] = {};
          }

          // Calculate how many 15-minute slots this booking spans
          const slotsToFill = Math.ceil(booking.durationMinutes / 15);

          // Parse start time to calculate subsequent slots
          const [startHours, startMinutes] = booking.startTime.split(':').map(Number);

          // Fill all slots that this booking occupies
          for (let i = 0; i < slotsToFill; i++) {
            const slotMinutes = startMinutes + (i * 15);
            const slotHours = startHours + Math.floor(slotMinutes / 60);
            const actualMinutes = slotMinutes % 60;

            // Convert to 12h format
            const period = slotHours >= 12 ? 'PM' : 'AM';
            const displayHour = slotHours > 12 ? slotHours - 12 : slotHours === 0 ? 12 : slotHours;
            const slotTime = `${displayHour}:${actualMinutes.toString().padStart(2, '0')} ${period}`;

            transformedBookings[courtName][slotTime] = {
              player: booking.userName || 'Reserved',
              duration: `${booking.durationMinutes}min`,
              type: 'reservation',
              bookingId: booking.id,
              userId: booking.userId,
              isFirstSlot: i === 0, // Mark first slot for display purposes
              bookingType: booking.bookingType, // Match type (Singles, Doubles, Lesson, etc.)
              notes: booking.notes, // Reservation notes
              fullDetails: {
                ...booking,
                facilityName: currentFacility?.name
              }
            };
          }
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

  // Only use member facilities - no fallback for users without memberships
  const availableFacilities = memberFacilities;
  const currentFacility = availableFacilities.find(f => f.id === selectedFacility);
  
  // Filter courts based on selected court type
  const allCourts = currentFacility?.courts || [];
  const courts = React.useMemo(() => {
    // If no court type is selected, show all courts
    if (selectedCourtType === null) {
      return allCourts;
    }
    // Otherwise filter by selected type
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

  // Generate time slots for the day (15-minute intervals)
  const allTimeSlots = React.useMemo(() => {
    const slots = [];
    for (let hour = 6; hour <= 21; hour++) {
      for (let minute = 0; minute < 60; minute += 15) {
        const period = hour >= 12 ? 'PM' : 'AM';
        const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
        const displayMinute = minute.toString().padStart(2, '0');
        slots.push(`${displayHour}:${displayMinute} ${period}`);
      }
    }
    return slots;
  }, []);

  // Filter time slots to only show current and future times for today
  const timeSlots = React.useMemo(() => {
    if (!isToday(selectedDate)) {
      return allTimeSlots; // Show all slots for non-today dates
    }

    // For today, filter out times before current time
    const futureSlots = allTimeSlots.filter(timeSlot => !isPastTime(timeSlot));

    // If all slots have passed (late night), show all slots anyway
    // This prevents a blank calendar when viewing today after hours
    if (futureSlots.length === 0) {
      return allTimeSlots;
    }

    return futureSlots;
  }, [allTimeSlots, selectedDate, currentTime, isToday, isPastTime]);

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
    if (booking?.type === 'reservation' && booking.fullDetails) {
      // Open reservation details modal
      setReservationDetailsModal({
        isOpen: true,
        reservation: booking.fullDetails
      });
    }
  };

  const handleEmptySlotClick = (courtName: string, time: string) => {
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
    if (!dragState.isDragging) return;

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
      // Only include available slots
      if (!booking) {
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
  const handleQuickReserve = async (reservation: {
    facility: string;
    court: string;
    date: string;
    time: string;
    duration: string;
    playerName: string;
  }) => {
    console.log('Quick reservation made:', reservation);
    // Refresh the bookings to show the new reservation
    await fetchBookings();
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

  const closeReservationDetailsModal = () => {
    setReservationDetailsModal({
      isOpen: false,
      reservation: null
    });
  };

  const handleCancelReservation = async (reservationId: string) => {
    try {
      const response = await bookingApi.cancel(reservationId, user?.id || '');
      if (response.success) {
        // Refresh bookings after cancellation
        await fetchBookings();
        // Close the modal
        closeReservationDetailsModal();
      } else {
        alert(response.error || 'Failed to cancel reservation');
      }
    } catch (error) {
      console.error('Error canceling reservation:', error);
      alert('Failed to cancel reservation. Please try again.');
    }
  };



  // Auto-scroll to top when viewing today (since we're filtering out past times)
  useEffect(() => {
    if (isToday(selectedDate) && calendarScrollRef.current) {
      // Scroll to top to show the first available time slot
      calendarScrollRef.current.scrollTop = 0;
    }
  }, [selectedDate, isToday]);

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
        onNavigateToMessages={onNavigateToMessages}
        onNavigateToAdminDashboard={onNavigateToAdminDashboard}
        onNavigateToFacilityManagement={onNavigateToFacilityManagement}
        onNavigateToCourtManagement={onNavigateToCourtManagement}
        onNavigateToBookingManagement={onNavigateToBookingManagement}
        onNavigateToAdminBooking={onNavigateToAdminBooking}
        onNavigateToMemberManagement={onNavigateToMemberManagement}
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
                <NotificationBell />
              </div>
            </div>
          </div>
        </header>

        {/* Controls */}
        <div className="px-6 py-6">
        {memberFacilities.length === 0 ? (
          // Show "no membership" message when user has no facilities
          <Card>
            <CardContent className="p-8">
              <div className="text-center space-y-4">
                <div className="flex justify-center">
                  <Calendar className="h-16 w-16 text-gray-300" />
                </div>
                <h3 className="text-xl font-medium text-gray-900">No Facility Memberships</h3>
                <p className="text-gray-600 max-w-md mx-auto">
                  You need to be a member of a facility to view and book courts. Request membership to a facility to get started.
                </p>
                <Button
                  onClick={onNavigateToProfile}
                  className="mt-4"
                >
                  Request Facility Membership
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
        <div className="flex flex-col gap-6 mb-6">
          {/* Facility Name, Court Type Filter, and Quick Reserve */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-4">
              <h3 className="text-lg font-medium">{currentFacility?.name}</h3>
              <Badge variant="outline">{currentFacility?.type}</Badge>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-600">Court Type:</span>
                <div className="flex gap-2">
                  <Button
                    variant={selectedCourtType === 'tennis' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedCourtType(selectedCourtType === 'tennis' ? null : 'tennis')}
                    className={selectedCourtType === 'tennis' ? 'bg-blue-600 hover:bg-blue-700' : ''}
                  >
                    Tennis
                  </Button>
                  <Button
                    variant={selectedCourtType === 'pickleball' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedCourtType(selectedCourtType === 'pickleball' ? null : 'pickleball')}
                    className={selectedCourtType === 'pickleball' ? 'bg-blue-600 hover:bg-blue-700' : ''}
                  >
                    Pickleball
                  </Button>
                </div>
              </div>
            </div>

            {/* Quick Reserve Button */}
            <Button
              onClick={() => setShowQuickReserve(true)}
              className="flex items-center gap-2 !bg-green-600 hover:!bg-green-700 !text-white px-6 py-2 text-base font-medium shadow-md"
              size="lg"
            >
              <Calendar className="h-5 w-5" />
              Quick Reserve
            </Button>
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

                {/* Info Popover */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 rounded-full">
                      <Info className="h-4 w-4 text-gray-500" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80">
                    <p className="text-sm text-gray-700">
                      Click on any empty time slot to book a court reservation. Hold and drag to select multiple consecutive slots.
                    </p>
                  </PopoverContent>
                </Popover>
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

        {/* Calendar Grid */}
        <Card className="overflow-hidden">
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
              <div className="relative border border-gray-200" style={{ height: '600px', maxHeight: '70vh' }}>
                {/* Scrollable Content Area - handles both horizontal and vertical scrolling */}
                <div
                  ref={calendarScrollRef}
                  className="overflow-auto h-full"
                >
                  <div className="min-w-max">
                    {/* Header Row - Court Names (Sticky at top, scrolls horizontally with content) */}
                    <div className="sticky top-0 grid grid-cols-[120px_repeat(var(--court-count),_200px)] border-b-2 border-gray-300 shadow-md bg-white" style={{...({'--court-count': courts.length} as React.CSSProperties), zIndex: 50}}>
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
                  const isHourMark = time.endsWith(':00 AM') || time.endsWith(':00 PM');
                  return (
                    <div key={timeIndex} className={`grid grid-cols-[120px_repeat(var(--court-count),_200px)] border-b last:border-b-0 ${isHourMark ? 'border-gray-300' : 'border-gray-100'}`} style={{'--court-count': courts.length} as React.CSSProperties}>
                      <div className="p-2 border-r border-gray-200 bg-gray-50">
                        <span className={`text-xs ${isHourMark ? 'font-semibold' : 'font-normal'}`}>{time}</span>
                      </div>
                      {courts.map((court, courtIndex) => {
                        const booking = bookings[court.name as keyof typeof bookings]?.[time];
                        return (
                          <div
                            key={courtIndex}
                            className={`
                              p-1 border-r border-gray-200 last:border-r-0 min-h-[40px] relative
                              ${!booking ? 'cursor-pointer hover:bg-gray-50' : ''}
                              ${booking ? 'cursor-pointer' : ''}
                              ${dragState.selectedCells.has(`${court.name}|${time}`) ? 'bg-blue-100 border-blue-300' : ''}
                              ${dragState.isDragging && !booking ? 'select-none' : ''}
                            `}
                            onClick={() => {
                              if (booking) {
                                handleBookingClick(court.name, time);
                              } else {
                                handleEmptySlotClick(court.name, time);
                              }
                            }}
                            onMouseDown={(e) => !booking && handleMouseDown(court.name, time, e)}
                            onMouseEnter={() => handleMouseEnter(court.name, time)}
                          >
                            {booking && booking.type === 'reservation' && booking.isFirstSlot && (
                              <div
                                className={`p-1 rounded-md border transition-colors hover:opacity-80 absolute top-0 left-0 right-0 overflow-hidden ${
                                  court.type === 'tennis'
                                    ? 'bg-blue-100 text-blue-800 border-blue-300'
                                    : 'bg-green-100 text-green-800 border-green-300'
                                }`}
                                style={{
                                  height: `${Math.ceil(parseInt(booking.duration) / 15) * 40}px`
                                }}
                              >
                                <div className="text-[10px] font-medium leading-tight">{booking.player}</div>
                                <div className="text-[9px] opacity-75 flex items-center gap-1">
                                  <span>{booking.duration}</span>
                                  {booking.bookingType && (
                                    <span className={`px-1 rounded text-[8px] font-medium ${
                                      court.type === 'tennis'
                                        ? 'bg-blue-200 text-blue-900'
                                        : 'bg-green-200 text-green-900'
                                    }`}>
                                      {booking.bookingType}
                                    </span>
                                  )}
                                </div>
                                {booking.notes && (
                                  <div className={`text-[8px] mt-0.5 truncate italic ${
                                    court.type === 'tennis'
                                      ? 'text-blue-600'
                                      : 'text-green-600'
                                  }`}>
                                    {booking.notes.length > 30 ? `${booking.notes.substring(0, 30)}...` : booking.notes}
                                  </div>
                                )}
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
        </div>
        </>
        )}
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

      {/* Reservation Details Modal */}
      <ReservationDetailsModal
        isOpen={reservationDetailsModal.isOpen}
        onClose={closeReservationDetailsModal}
        reservation={reservationDetailsModal.reservation}
        onCancelReservation={handleCancelReservation}
      />
    </div>
  );
}