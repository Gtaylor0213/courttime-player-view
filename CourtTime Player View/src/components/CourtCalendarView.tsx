import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../contexts/AppContext';
import { BookingWizard } from './BookingWizard';
import { QuickReservePopup } from './QuickReservePopup';
import { NotificationBell } from './NotificationBell';
import { ReservationDetailsModal } from './ReservationDetailsModal';
import { useNotifications } from '../contexts/NotificationContext';
import { useAuth } from '../contexts/AuthContext';
import { facilitiesApi, usersApi, bookingApi } from '../api/client';
import { Calendar, ChevronLeft, ChevronRight, Filter, Grid3X3, Bell, Info, User, Settings, BarChart3, MapPin, Users, LogOut, ChevronDown, ZoomIn, ZoomOut, Minus, Plus } from 'lucide-react';
import { getBookingTypeColor, getBookingTypeBadgeColor, getBookingTypeLabel } from '../constants/bookingTypes';

// Helper to get current time components in Eastern Time
const getEasternTimeComponents = (): { hours: number; minutes: number; date: Date } => {
  const now = new Date();
  // Use Intl.DateTimeFormat to get accurate Eastern time components
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false
  });
  const parts = formatter.formatToParts(now);
  const hours = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
  const minutes = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
  return { hours, minutes, date: now };
};

// Helper to get current date in Eastern Time (for date comparisons)
const getEasternTime = (): Date => {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = formatter.formatToParts(now);
  const year = parseInt(parts.find(p => p.type === 'year')?.value || '0', 10);
  const month = parseInt(parts.find(p => p.type === 'month')?.value || '0', 10) - 1;
  const day = parseInt(parts.find(p => p.type === 'day')?.value || '0', 10);
  return new Date(year, month, day);
};

// Helper to format current time for display in Eastern Time (accurate)
const formatCurrentEasternTime = (): string => {
  const now = new Date();
  return now.toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
};

export function CourtCalendarView() {
  const navigate = useNavigate();
  const { selectedFacilityId = 'sunrise-valley', setSelectedFacilityId } = useAppContext();
  const { unreadCount } = useNotifications();
  const { user } = useAuth();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedFacility, setSelectedFacility] = useState(selectedFacilityId);
  const [selectedView, setSelectedView] = useState('week');
  const [selectedCourtType, setSelectedCourtType] = useState<'tennis' | 'pickleball' | null>('tennis');
  const [currentTime, setCurrentTime] = useState(getEasternTime());
  const [memberFacilities, setMemberFacilities] = useState<any[]>([]);
  const [loadingFacilities, setLoadingFacilities] = useState(true);
  const [bookingsData, setBookingsData] = useState<any>({});
  const [loadingBookings, setLoadingBookings] = useState(false);
  const calendarScrollRef = useRef<HTMLDivElement>(null);
  const timeColumnRef = useRef<HTMLDivElement>(null);
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

  // Calendar display customization
  const [displayedCourtsCount, setDisplayedCourtsCount] = useState<number | null>(null);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 768 : false);

  // Device detection for responsive defaults
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Update current time every 30 seconds for the time indicator line (Eastern Time)
  useEffect(() => {
    const updateTime = () => setCurrentTime(getEasternTime());
    updateTime(); // Initial update
    const interval = setInterval(updateTime, 30000); // Update every 30 seconds
    return () => clearInterval(interval);
  }, []);

  // Helper function to check if date is today (must be defined before currentTimeLinePosition)
  const isToday = useCallback((date: Date) => {
    const today = getEasternTime();
    return date.toDateString() === today.toDateString();
  }, []);

  // Calculate dynamic slot height based on zoom level
  const slotHeight = useMemo(() => Math.round(48 * (zoomLevel / 100)), [zoomLevel]);

  // Calculate the position of the current time indicator line
  const currentTimeLinePosition = useMemo(() => {
    if (!isToday(selectedDate)) return null;

    // Get accurate Eastern time components
    const { hours, minutes } = getEasternTimeComponents();

    // Calendar starts at 6 AM (6) and ends at 9 PM (21)
    // Each hour has 4 slots (15 min each)
    const SLOTS_PER_HOUR = 4;
    const START_HOUR = 6;
    const END_HOUR = 21;

    // Check if current time is within calendar hours
    if (hours < START_HOUR || hours > END_HOUR) return null;

    // Calculate position from top
    const hoursFromStart = hours - START_HOUR;
    const minuteFraction = minutes / 60;
    const totalHours = hoursFromStart + minuteFraction;
    const position = totalHours * SLOTS_PER_HOUR * slotHeight;

    return position;
  }, [currentTime, selectedDate, isToday, slotHeight]);

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

      // Format date as YYYY-MM-DD for API (using local date to avoid timezone issues)
      const year = selectedDate.getFullYear();
      const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
      const day = String(selectedDate.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
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
    if (setSelectedFacilityId) {
      setSelectedFacilityId(facilityId);
    }
  };

  // Only use member facilities - no fallback for users without memberships
  const availableFacilities = memberFacilities;
  const currentFacility = availableFacilities.find(f => f.id === selectedFacility);
  
  // Filter courts based on selected court type
  const allCourts = currentFacility?.courts || [];
  const filteredCourts = React.useMemo(() => {
    // If no court type is selected, show all courts
    if (selectedCourtType === null) {
      return allCourts;
    }
    // Otherwise filter by selected type
    return allCourts.filter(court => court.type === selectedCourtType);
  }, [allCourts, selectedCourtType]);

  // Apply court display limit based on user preference or device defaults
  const courts = React.useMemo(() => {
    // If user has explicitly set a court count, use that
    if (displayedCourtsCount !== null && displayedCourtsCount > 0) {
      return filteredCourts.slice(0, displayedCourtsCount);
    }
    // On mobile, default to showing 2 courts for better usability
    if (isMobile && filteredCourts.length > 2) {
      return filteredCourts.slice(0, 2);
    }
    // Desktop shows all courts
    return filteredCourts;
  }, [filteredCourts, displayedCourtsCount, isMobile]);

  // Helper function to check if a time slot is in the past (using Eastern Time)
  const isPastTime = useCallback((timeSlot: string) => {
    if (!isToday(selectedDate)) return false;

    const [time, period] = timeSlot.split(' ');
    let [hours, minutes] = time.split(':').map(Number);

    // Convert to 24-hour format
    if (period === 'PM' && hours !== 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;

    // Compare with Eastern Time
    const easternNow = currentTime;
    const slotHour = hours;
    const slotMinute = minutes || 0;

    const nowHour = easternNow.getHours();
    const nowMinute = easternNow.getMinutes();

    // Compare hours and minutes
    if (slotHour < nowHour) return true;
    if (slotHour === nowHour && slotMinute < nowMinute) return true;
    return false;
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



  // Function to scroll to current time
  const scrollToCurrentTime = useCallback(() => {
    if (!calendarScrollRef.current || currentTimeLinePosition === null) return;

    const container = calendarScrollRef.current;
    const containerHeight = container.clientHeight;
    const headerHeight = 56; // Header row height

    // Scroll so the current time line is visible (position adjusted for header)
    const actualPosition = currentTimeLinePosition + headerHeight;
    const scrollPosition = Math.max(0, actualPosition - containerHeight / 3);
    container.scrollTo({
      top: scrollPosition,
      behavior: 'smooth'
    });
  }, [currentTimeLinePosition]);

  // Auto-scroll to current time when viewing today
  useEffect(() => {
    if (isToday(selectedDate) && calendarScrollRef.current && currentTimeLinePosition !== null) {
      // Small delay to ensure content is rendered
      const timer = setTimeout(() => {
        scrollToCurrentTime();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [selectedDate, isToday, currentTimeLinePosition, scrollToCurrentTime]);

  return (
    <>
      {/* Main Content */}
      <div className="h-screen flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 relative z-10 flex-shrink-0">
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

        {/* Controls - Sticky Header */}
        {memberFacilities.length === 0 ? (
          // Show "no membership" message when user has no facilities
          <div className="px-6 py-6">
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
                  onClick={() => navigate('/profile')}
                  className="mt-4"
                >
                  Request Facility Membership
                </Button>
              </div>
            </CardContent>
          </Card>
          </div>
        ) : (
          <>
        {/* Controls Header */}
        <div className="flex-shrink-0 z-40 bg-white border-b border-gray-200 shadow-sm">
          <div className="px-6 py-4">
            {/* Top Row: Facility Name, Court Type Filter, Courts, Zoom, Quick Reserve */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-4">
                <h3 className="text-lg font-medium">{currentFacility?.name}</h3>
                <Badge variant="outline">{currentFacility?.type}</Badge>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-600">Court Type:</span>
                  <div className="flex gap-1">
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

                {/* Court Display Count */}
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-600">Courts:</span>
                  <Select
                    value={displayedCourtsCount?.toString() || 'all'}
                    onValueChange={(v) => setDisplayedCourtsCount(v === 'all' ? null : parseInt(v))}
                  >
                    <SelectTrigger className="w-[90px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2">2</SelectItem>
                      <SelectItem value="4">4</SelectItem>
                      <SelectItem value="6">6</SelectItem>
                      <SelectItem value="all">All ({filteredCourts.length})</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Zoom Control - Buttons instead of dropdown */}
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-600">Zoom:</span>
                  <div className="flex items-center gap-1 bg-gray-100 rounded-md p-0.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setZoomLevel(Math.max(75, zoomLevel - 25))}
                      disabled={zoomLevel <= 75}
                      className="h-7 w-7 p-0 hover:bg-white"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </Button>
                    <span className="text-sm font-medium min-w-[40px] text-center">{zoomLevel}%</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setZoomLevel(Math.min(150, zoomLevel + 25))}
                      disabled={zoomLevel >= 150}
                      className="h-7 w-7 p-0 hover:bg-white"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Quick Reserve Button */}
              <Button
                onClick={() => setShowQuickReserve(true)}
                className="flex items-center gap-2 bg-green-500 hover:bg-green-600 text-black px-6 py-2 text-base font-medium shadow-md"
                size="lg"
              >
                <Calendar className="h-5 w-5" />
                Quick Reserve
              </Button>
            </div>

            {/* Bottom Row: Facility Selection and Date Navigation */}
            <div className="flex flex-wrap items-center justify-between gap-4 mt-4">
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
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => navigateDate('prev')}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="text-center min-w-[200px]">
                  <h2 className="font-medium">{formatDate(selectedDate)}</h2>
                </div>
                <Button variant="outline" size="sm" onClick={() => navigateDate('next')}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Calendar Grid Container */}
        <div className="flex-1 overflow-auto px-6 py-4">
        {courts.length === 0 ? (
          <div
            className="bg-white rounded-lg shadow-lg border border-gray-200 p-8 text-center text-gray-500 h-full"
          >
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
          <div
            ref={calendarScrollRef}
            className="calendar-scroll bg-white rounded-lg shadow-lg border border-gray-200 overflow-auto relative w-full h-full"
          >
              {/* Header Row - Sticky at top */}
              <div
                className="sticky top-0 z-30 bg-white border-b-2 border-gray-300 shadow-sm"
                style={{
                  display: 'grid',
                  gridTemplateColumns: `100px repeat(${courts.length}, 180px)`,
                  minWidth: `${100 + courts.length * 180}px`
                }}
              >
                {/* Time Header - double sticky (top + left) */}
                <div
                  className="sticky left-0 z-40 bg-gray-100 border-r border-gray-300 p-3 flex items-center justify-center"
                  style={{ height: '56px' }}
                >
                  <span className="font-semibold text-sm text-gray-700">Time (EST)</span>
                </div>
                {/* Court Headers */}
                {courts.map((court, index) => (
                  <div
                    key={index}
                    className="bg-white border-r border-gray-200 last:border-r-0 p-3"
                    style={{ height: '56px' }}
                  >
                    <div className="font-semibold text-sm text-gray-900">{court.name}</div>
                    <div className="text-xs text-gray-500 mt-0.5 capitalize">{court.type}</div>
                  </div>
                ))}
              </div>

              {/* Time Slots Grid */}
              <div style={{ minWidth: `${100 + courts.length * 180}px` }}>
                {timeSlots.map((time, timeIndex) => {
                  const isHourMark = time.endsWith(':00 AM') || time.endsWith(':00 PM');
                  const isPast = isPastTime(time);
                  return (
                    <div
                      key={timeIndex}
                      className={isPast ? 'opacity-50' : ''}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: `100px repeat(${courts.length}, 180px)`,
                        height: `${slotHeight}px`
                      }}
                    >
                      {/* Sticky Time Column */}
                      <div
                        className={`
                          sticky left-0 z-10 bg-gray-50 border-r border-gray-200 px-2 flex items-center justify-end
                          ${isHourMark ? 'border-b border-gray-300' : 'border-b border-gray-100'}
                        `}
                      >
                        <span className={`text-xs ${isHourMark ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>
                          {time}
                        </span>
                      </div>

                      {/* Court Columns */}
                      {courts.map((court, courtIndex) => {
                        const booking = bookings[court.name as keyof typeof bookings]?.[time];
                        const isSelected = dragState.selectedCells.has(`${court.name}|${time}`);

                        return (
                          <div
                            key={courtIndex}
                            className={`
                              border-r border-gray-200 last:border-r-0 relative
                              ${isHourMark ? 'border-b border-gray-300' : 'border-b border-gray-100'}
                              ${!booking && !isPast ? 'cursor-pointer hover:bg-blue-50' : ''}
                              ${booking ? 'cursor-pointer' : ''}
                              ${isPast && !booking ? 'bg-gray-100 cursor-not-allowed' : ''}
                              ${isSelected ? 'bg-blue-100 ring-1 ring-inset ring-blue-400' : ''}
                              ${dragState.isDragging && !booking ? 'select-none' : ''}
                            `}
                            onClick={() => {
                              if (isPast && !booking) return;
                              if (booking) {
                                handleBookingClick(court.name, time);
                              } else {
                                handleEmptySlotClick(court.name, time);
                              }
                            }}
                            onMouseDown={(e) => !booking && !isPast && handleMouseDown(court.name, time, e)}
                            onMouseEnter={() => !isPast && handleMouseEnter(court.name, time)}
                          >
                                  {/* Booking Display - First Slot */}
                                  {booking && booking.type === 'reservation' && booking.isFirstSlot && (
                                    <div
                                      className={`
                                        absolute inset-0 m-0.5 px-2 py-1 rounded
                                        transition-all duration-150 hover:shadow-md
                                        overflow-hidden border
                                        ${booking.bookingType
                                          ? getBookingTypeBadgeColor(booking.bookingType)
                                          : (court.type === 'tennis'
                                              ? 'bg-blue-100 text-blue-900 border-blue-300'
                                              : 'bg-green-100 text-green-900 border-green-300')
                                        }
                                      `}
                                    >
                                      <div className="text-xs font-semibold leading-tight truncate">{booking.player}</div>
                                      <div className="text-[10px] opacity-80 flex items-center gap-1 mt-0.5">
                                        <span>{booking.duration}</span>
                                        {booking.bookingType && (
                                          <span className="px-1 py-0.5 rounded text-[9px] font-medium bg-white/50">
                                            {getBookingTypeLabel(booking.bookingType)}
                                          </span>
                                        )}
                                      </div>
                                      {booking.notes && (
                                        <div className="text-[9px] mt-0.5 truncate italic opacity-80">
                                          {booking.notes.length > 25 ? `${booking.notes.substring(0, 25)}...` : booking.notes}
                                        </div>
                                      )}
                                    </div>
                                  )}

                            {/* Booking Display - Continuation Slots */}
                            {booking && booking.type === 'reservation' && !booking.isFirstSlot && (
                              <div
                                className={`
                                  absolute inset-0 m-0.5 rounded-b border-l border-r
                                  ${booking.bookingType
                                    ? getBookingTypeColor(booking.bookingType)
                                    : (court.type === 'tennis'
                                        ? 'bg-blue-100 border-blue-300'
                                        : 'bg-green-100 border-green-300')
                                  }
                                `}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>

              {/* Current Time Indicator Line - positioned absolutely in scroll container */}
              {currentTimeLinePosition !== null && (
                <div
                  className="pointer-events-none"
                  style={{
                    position: 'absolute',
                    top: `${currentTimeLinePosition + 56}px`, // +56 for header height
                    left: 0,
                    right: 0,
                    zIndex: 20,
                    height: '2px'
                  }}
                >
                  {/* Time label - sticky to left */}
                  <div
                    className="sticky left-0 inline-flex items-center"
                    style={{ zIndex: 25 }}
                  >
                    <div className="bg-white border border-red-400 text-gray-800 text-[10px] font-bold px-1.5 py-0.5 rounded shadow-md">
                      {formatCurrentEasternTime()}
                    </div>
                  </div>
                  {/* Red line */}
                  <div
                    className="absolute bg-red-600"
                    style={{
                      left: '100px',
                      right: 0,
                      top: '50%',
                      height: '2px',
                      transform: 'translateY(-50%)',
                      boxShadow: '0 0 6px rgba(220, 38, 38, 0.6)'
                    }}
                  />
                  {/* Circle indicator */}
                  <div
                    className="absolute w-3 h-3 bg-red-600 rounded-full border-2 border-white shadow-md"
                    style={{
                      left: '94px',
                      top: '50%',
                      transform: 'translateY(-50%)'
                    }}
                  />
                </div>
              )}
          </div>
        )}
        </div>

        </>
        )}
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
    </>
  );
}