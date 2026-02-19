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
import { facilitiesApi, usersApi, bookingApi, courtConfigApi } from '../api/client';
import { Calendar, ChevronLeft, ChevronRight, Filter, Grid3X3, Bell, Info, User, Settings, BarChart3, MapPin, Users, LogOut, ChevronDown, ZoomIn, ZoomOut } from 'lucide-react';
import { Calendar as CalendarPicker } from './ui/calendar';

// Layout constants
const ROW_HEIGHT = 60;            // 30-min visible row height
const SUB_SLOT_HEIGHT = 30;       // 15-min subdivision height
const TIME_COL_WIDTH = 72;
const COURT_COL_WIDTH = 180;
const HEADER_HEIGHT = 56;
import { getBookingTypeColor, getBookingTypeBadgeColor, getBookingTypeLabel } from '../constants/bookingTypes';

// Helper to get current time components in a given timezone
const getTimeComponents = (tz: string = 'America/New_York'): { hours: number; minutes: number; date: Date } => {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false
  });
  const parts = formatter.formatToParts(now);
  const hours = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
  const minutes = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
  return { hours, minutes, date: now };
};

// Helper to get current date in a given timezone (for date comparisons)
const getFacilityDate = (tz: string = 'America/New_York'): Date => {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
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

// Helper to format current time for display in a given timezone
const formatCurrentTime = (tz: string = 'America/New_York'): string => {
  const now = new Date();
  return now.toLocaleTimeString('en-US', {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
};

export function CourtCalendarView() {
  const navigate = useNavigate();
  const { selectedFacilityId = 'sunrise-valley' } = useAppContext();
  const { unreadCount } = useNotifications();
  const { user } = useAuth();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const selectedFacility = selectedFacilityId;
  const [selectedView, setSelectedView] = useState('week');
  const [selectedCourtType, setSelectedCourtType] = useState<'tennis' | 'pickleball' | null>(null);
  const [currentTime, setCurrentTime] = useState(getFacilityDate());
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
  // Keep a ref to always have the latest dragState in event listeners
  const dragStateRef = React.useRef(dragState);
  dragStateRef.current = dragState;
  const dragJustFinishedRef = React.useRef(false);

  // Quick reserve popup state
  const [showQuickReserve, setShowQuickReserve] = useState(false);

  // Reservation details modal state
  const [reservationDetailsModal, setReservationDetailsModal] = useState({
    isOpen: false,
    reservation: null as any
  });

  // Calendar display customization
  const [displayedCourtsCount, setDisplayedCourtsCount] = useState<number | null>(null);
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 768 : false);
  const [zoomLevel, setZoomLevel] = useState(100); // percentage: 50-150
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [scrollTrigger, setScrollTrigger] = useState(0); // forces auto-scroll on mount

  // Computed court column width based on zoom
  const effectiveCourtWidth = Math.round(COURT_COL_WIDTH * zoomLevel / 100);

  // Prime-time config per court: courtId -> schedule array
  const [primeTimeConfigs, setPrimeTimeConfigs] = useState<Record<string, any[]>>({});

  // Device detection for responsive defaults
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Update current time every 30 seconds for the time indicator line (Eastern Time)
  useEffect(() => {
    const updateTime = () => setCurrentTime(getFacilityDate());
    updateTime(); // Initial update
    const interval = setInterval(updateTime, 30000); // Update every 30 seconds
    return () => clearInterval(interval);
  }, []);

  // Helper function to check if date is today (must be defined before currentTimeLinePosition)
  const isToday = useCallback((date: Date) => {
    const today = getFacilityDate();
    return date.toDateString() === today.toDateString();
  }, []);

  // Fetch only facilities the user is a member of
  useEffect(() => {
    const fetchFacilities = async () => {
      const allFacilityIds = Array.from(new Set([
        ...(user?.memberFacilities || []),
      ]));

      if (allFacilityIds.length === 0) {
        setLoadingFacilities(false);
        return;
      }

      try {
        setLoadingFacilities(true);
        const facilitiesData: Array<{ id: string; name: string; type: string; courts: Array<{ id: string; name: string; type: string; parentCourtId?: string | null; isSplitCourt?: boolean }>; operatingHours?: any; timezone?: string }> = [];

        for (const facilityId of allFacilityIds) {
          // Fetch facility details
          const facilityResponse = await facilitiesApi.getById(facilityId);
          if (facilityResponse.success && facilityResponse.data) {
            const facility = facilityResponse.data.facility;

            // Fetch courts for this facility
            const courtsResponse = await facilitiesApi.getCourts(facilityId);
            const courts = courtsResponse.success && courtsResponse.data?.courts
              ? courtsResponse.data.courts
                  .filter((court: any) => {
                    const s = (court.status || 'available').toLowerCase();
                    return s === 'available' || s === 'active';
                  })
                  .map((court: any) => ({
                    id: court.id,
                    name: court.name,
                    type: court.courtType?.toLowerCase() || 'tennis',
                    parentCourtId: court.parentCourtId || null,
                    isSplitCourt: court.isSplitCourt || false,
                  }))
              : [];

            facilitiesData.push({
              id: facility.id,
              name: facility.name,
              type: facility.type || facility.facilityType || 'Tennis Facility',
              courts,
              operatingHours: facility.operatingHours,
              timezone: facility.timezone || 'America/New_York',
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

        // Build court lookup maps for parent/child relationships
        const allFacilityCourts = currentFacility?.courts || [];
        const courtIdToName: Record<string, string> = {};
        allFacilityCourts.forEach((c: any) => { courtIdToName[c.id] = c.name; });
        const parentToChildren: Record<string, string[]> = {};
        allFacilityCourts.forEach((c: any) => {
          if (c.parentCourtId) {
            if (!parentToChildren[c.parentCourtId]) parentToChildren[c.parentCourtId] = [];
            parentToChildren[c.parentCourtId].push(c.name);
          }
        });

        // Helper to add slot entries for a court
        const addSlotsForCourt = (targetCourtName: string, booking: any, isBlocked: boolean, blockedBy?: string) => {
          if (!transformedBookings[targetCourtName]) {
            transformedBookings[targetCourtName] = {};
          }

          const slotsToFill = Math.ceil(booking.durationMinutes / 15);
          const [startHours, startMinutes] = booking.startTime.split(':').map(Number);

          for (let i = 0; i < slotsToFill; i++) {
            const slotMinutes = startMinutes + (i * 15);
            const slotHours = startHours + Math.floor(slotMinutes / 60);
            const actualMinutes = slotMinutes % 60;
            const period = slotHours >= 12 ? 'PM' : 'AM';
            const displayHour = slotHours > 12 ? slotHours - 12 : slotHours === 0 ? 12 : slotHours;
            const slotTime = `${displayHour}:${actualMinutes.toString().padStart(2, '0')} ${period}`;

            // Don't overwrite real bookings with blocked entries
            if (transformedBookings[targetCourtName][slotTime]) continue;

            if (isBlocked) {
              transformedBookings[targetCourtName][slotTime] = {
                player: `Blocked (${blockedBy} in use)`,
                duration: `${booking.durationMinutes}min`,
                type: 'blocked',
                isFirstSlot: i === 0,
                bookingType: 'blocked',
              };
            } else {
              transformedBookings[targetCourtName][slotTime] = {
                player: booking.userName || 'Reserved',
                duration: `${booking.durationMinutes}min`,
                type: 'reservation',
                bookingId: booking.id,
                userId: booking.userId,
                isFirstSlot: i === 0,
                bookingType: booking.bookingType,
                notes: booking.notes,
                fullDetails: {
                  ...booking,
                  facilityName: currentFacility?.name
                }
              };
            }
          }
        };

        response.data.bookings.forEach((booking: any) => {
          const courtName = booking.courtName;
          const startTime = formatTimeTo12Hour(booking.startTime);
          console.log('  📍 Booking:', courtName, 'from', startTime, '- User:', booking.userName, '- Duration:', booking.durationMinutes, 'min');

          // Add real booking slots
          addSlotsForCourt(courtName, booking, false);

          // Propagate blocks to related parent/child courts
          const bookedCourt = allFacilityCourts.find((c: any) => c.name === courtName);
          if (bookedCourt) {
            // If child court is booked, block the parent
            if (bookedCourt.parentCourtId) {
              const parentName = courtIdToName[bookedCourt.parentCourtId];
              if (parentName) {
                addSlotsForCourt(parentName, booking, true, courtName);
              }
            }
            // If parent court is booked, block all children
            const children = parentToChildren[bookedCourt.id];
            if (children) {
              children.forEach((childName: string) => {
                addSlotsForCourt(childName, booking, true, courtName);
              });
            }
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

  // Only use member facilities - no fallback for users without memberships
  const availableFacilities = memberFacilities;
  const currentFacility = availableFacilities.find(f => f.id === selectedFacility);

  // Derive operating hours and timezone from facility config
  const { startHour, endHour, facilityTimezone } = useMemo(() => {
    const oh = currentFacility?.operatingHours;
    const tz = currentFacility?.timezone || 'America/New_York';
    if (!oh) return { startHour: 6, endHour: 21, facilityTimezone: tz };

    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayName = dayNames[selectedDate.getDay()];
    const dayConfig = oh[dayName];

    if (!dayConfig || dayConfig.closed) {
      return { startHour: 6, endHour: 21, facilityTimezone: tz };
    }

    const openHour = dayConfig.open ? parseInt(dayConfig.open.split(':')[0], 10) : 6;
    const closeHour = dayConfig.close ? parseInt(dayConfig.close.split(':')[0], 10) : 21;

    return { startHour: openHour, endHour: closeHour, facilityTimezone: tz };
  }, [currentFacility, selectedDate]);

  // Calculate the position of the current time indicator line
  const currentTimeLinePosition = useMemo(() => {
    if (!isToday(selectedDate)) return null;

    const { hours, minutes } = getTimeComponents(facilityTimezone);

    if (hours < startHour || hours > endHour) return null;

    // Each hour = 2 visible rows × ROW_HEIGHT = 4 sub-slots × SUB_SLOT_HEIGHT
    const hoursFromStart = hours - startHour;
    const minuteFraction = minutes / 60;
    const totalHours = hoursFromStart + minuteFraction;
    const position = totalHours * 2 * ROW_HEIGHT;

    return position;
  }, [currentTime, selectedDate, isToday, startHour, endHour, facilityTimezone]);

  // Helper function to check if a time slot is in the past
  const isPastTime = useCallback((timeSlot: string) => {
    const today = getFacilityDate(facilityTimezone);
    const selectedDateOnly = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
    if (selectedDateOnly < today) return true;
    if (!isToday(selectedDate)) return false;

    const [time, period] = timeSlot.split(' ');
    let [hours, minutes] = time.split(':').map(Number);
    if (period === 'PM' && hours !== 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;

    const { hours: nowHour, minutes: nowMinute } = getTimeComponents(facilityTimezone);
    if (hours < nowHour) return true;
    if (hours === nowHour && (minutes || 0) < nowMinute) return true;
    return false;
  }, [selectedDate, currentTime, isToday, facilityTimezone]);

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

  // Fetch prime-time configs for visible courts
  useEffect(() => {
    const fetchPrimeTimeConfigs = async () => {
      if (!courts || courts.length === 0) return;
      const configs: Record<string, any[]> = {};
      for (const court of courts) {
        if (!court.id || primeTimeConfigs[court.id]) continue;
        try {
          const response = await courtConfigApi.getSchedule(court.id);
          if (response.success && response.data) {
            const schedule = response.data.schedule || response.data;
            configs[court.id] = Array.isArray(schedule) ? schedule : [];
          }
        } catch {
          // Court config may not exist yet
        }
      }
      if (Object.keys(configs).length > 0) {
        setPrimeTimeConfigs(prev => ({ ...prev, ...configs }));
      }
    };
    fetchPrimeTimeConfigs();
  }, [courts]);

  // Helper: check if a time slot is during prime time for a court
  const isPrimeTimeSlot = useCallback((courtId: string, time: string): boolean => {
    const schedule = primeTimeConfigs[courtId];
    if (!schedule || schedule.length === 0) return false;

    const dayOfWeek = selectedDate.getDay();
    const dayConfig = schedule.find((c: any) => c.dayOfWeek === dayOfWeek || c.day_of_week === dayOfWeek);
    if (!dayConfig) return false;

    const ptStart = dayConfig.primeTimeStart || dayConfig.prime_time_start;
    const ptEnd = dayConfig.primeTimeEnd || dayConfig.prime_time_end;
    if (!ptStart || !ptEnd) return false;

    // Parse the 12-hour time slot to 24-hour HH:MM
    const [timePart, period] = time.split(' ');
    let [hours, minutes] = timePart.split(':').map(Number);
    if (period === 'PM' && hours !== 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;
    const slot24 = `${hours.toString().padStart(2, '0')}:${(minutes || 0).toString().padStart(2, '0')}`;

    // Compare as strings (HH:MM format)
    const startNorm = ptStart.substring(0, 5);
    const endNorm = ptEnd.substring(0, 5);
    return slot24 >= startNorm && slot24 < endNorm;
  }, [primeTimeConfigs, selectedDate]);

  // Generate time slots for the day (15-minute intervals)
  const allTimeSlots = React.useMemo(() => {
    const slots: string[] = [];
    for (let hour = startHour; hour <= endHour; hour++) {
      for (let minute = 0; minute < 60; minute += 15) {
        const period = hour >= 12 ? 'PM' : 'AM';
        const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
        const displayMinute = minute.toString().padStart(2, '0');
        slots.push(`${displayHour}:${displayMinute} ${period}`);
      }
    }
    return slots;
  }, [startHour, endHour]);

  // Always show all time slots — past slots are greyed out, not hidden
  const timeSlots = React.useMemo(() => {
    return allTimeSlots;
  }, [allTimeSlots]);

  // 30-min visible rows for the table grid
  const visibleTimeSlots = React.useMemo(() => {
    const slots: string[] = [];
    for (let hour = startHour; hour <= endHour; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        const period = hour >= 12 ? 'PM' : 'AM';
        const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
        const displayMinute = minute.toString().padStart(2, '0');
        slots.push(`${displayHour}:${displayMinute} ${period}`);
      }
    }
    return slots;
  }, [startHour, endHour]);

  // Use fetched bookings from API
  const bookings = bookingsData;

  // Compute booking overlay blocks for the overlay layer
  const bookingOverlays = useMemo(() => {
    const overlays: Array<{
      courtIndex: number;
      courtName: string;
      startSlotIndex: number;
      slotCount: number;
      booking: any;
    }> = [];

    courts.forEach((court, courtIndex) => {
      const courtBookings = bookings[court.name];
      if (!courtBookings) return;

      Object.entries(courtBookings).forEach(([time, booking]: [string, any]) => {
        if (booking?.isFirstSlot) {
          const startIdx = allTimeSlots.indexOf(time);
          if (startIdx === -1) return;
          const slotCount = Math.ceil(parseInt(booking.duration) / 15);
          overlays.push({
            courtIndex,
            courtName: court.name,
            startSlotIndex: startIdx,
            slotCount,
            booking,
          });
        }
      });
    });

    return overlays;
  }, [courts, bookings, allTimeSlots]);

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

  const handleEmptySlotClick = (courtName: string, time: string, dragCells?: Set<string>) => {
    // Find the court object to get its ID
    const courtObj = courts.find(c => c.name === courtName);
    if (!courtObj) {
      console.error('Court not found:', courtName);
      return;
    }

    // Format date as YYYY-MM-DD to avoid timezone issues
    const year = selectedDate.getFullYear();
    const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
    const day = String(selectedDate.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    // If we have selected cells from dragging, open booking wizard with them
    if (dragCells && dragCells.size > 0) {
      const selectedSlots = Array.from(dragCells).map(cellId => {
        const [court, timeSlot] = cellId.split('|');
        const slotCourtObj = courts.find(c => c.name === court);
        return {
          court,
          courtId: slotCourtObj?.id || '',
          time: timeSlot
        };
      });

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

    // Build rectangular selection across courts and time slots
    const startCourtIndex = courts.findIndex(c => c.name === dragState.startCell!.court);
    const currentCourtIndex = courts.findIndex(c => c.name === courtName);
    const startTimeIndex = timeSlots.indexOf(dragState.startCell!.time);
    const currentTimeIndex = timeSlots.indexOf(time);

    const beginCourtIdx = Math.min(startCourtIndex, currentCourtIndex);
    const endCourtIdx = Math.max(startCourtIndex, currentCourtIndex);
    const beginTimeIdx = Math.min(startTimeIndex, currentTimeIndex);
    const endTimeIdx = Math.max(startTimeIndex, currentTimeIndex);

    const newSelectedCells = new Set<string>();
    for (let ci = beginCourtIdx; ci <= endCourtIdx; ci++) {
      const c = courts[ci];
      for (let ti = beginTimeIdx; ti <= endTimeIdx; ti++) {
        const slot = timeSlots[ti];
        const slotBooking = bookings[c.name as keyof typeof bookings]?.[slot];
        if (!slotBooking) {
          newSelectedCells.add(`${c.name}|${slot}`);
        }
      }
    }

    setDragState(prev => ({
      ...prev,
      endCell: { court: courtName, time },
      selectedCells: newSelectedCells
    }));
  };

  const handleMouseUp = () => {
    // Read from ref to get the latest drag state (avoids stale closure)
    const currentDrag = dragStateRef.current;
    if (currentDrag.isDragging && currentDrag.selectedCells.size > 0) {
      const cells = new Set<string>(currentDrag.selectedCells);
      const firstSelected = Array.from(cells)[0] as string;
      const [court, time] = firstSelected.split('|');
      // Pass cells directly to avoid stale closure issues
      handleEmptySlotClick(court, time, cells);
      // Suppress the click event that fires right after mouseup
      dragJustFinishedRef.current = true;
      setTimeout(() => { dragJustFinishedRef.current = false; }, 50);
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

  // Trigger auto-scroll on mount (page navigation)
  useEffect(() => {
    setScrollTrigger(prev => prev + 1);
  }, []);

  // Also trigger auto-scroll when courts load (initial page load)
  // On first load, courts is empty so the scroll ref doesn't exist yet
  useEffect(() => {
    if (courts.length > 0) {
      setScrollTrigger(prev => prev + 1);
    }
  }, [courts.length]);

  // Auto-scroll to current time when viewing today, or top on other dates
  useEffect(() => {
    if (!calendarScrollRef.current) return;
    const timer = setTimeout(() => {
      if (isToday(selectedDate) && currentTimeLinePosition !== null) {
        scrollToCurrentTime();
      } else {
        calendarScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [selectedDate, isToday, currentTimeLinePosition, scrollToCurrentTime, scrollTrigger]);

  return (
    <>
      {/* Main Content */}
      <div className="h-screen flex flex-col overflow-hidden">
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
          <div className="px-4 py-2">
            {/* Top Row: Facility Name, Court Type Filter, Courts, Zoom, Bell */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-lg font-medium">{currentFacility?.name}</h3>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-600">Court Type:</span>
                  <div className="flex gap-1">
                    <Button
                      variant={selectedCourtType === 'tennis' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSelectedCourtType(selectedCourtType === 'tennis' ? null : 'tennis')}
                    >
                      Tennis
                    </Button>
                    <Button
                      variant={selectedCourtType === 'pickleball' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSelectedCourtType(selectedCourtType === 'pickleball' ? null : 'pickleball')}
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

                {/* Zoom Controls */}
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-gray-600">Zoom:</span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => setZoomLevel(prev => Math.max(50, prev - 10))}
                    disabled={zoomLevel <= 50}
                  >
                    <ZoomOut className="h-3.5 w-3.5" />
                  </Button>
                  <span className="text-xs font-medium text-gray-700 min-w-[36px] text-center">{zoomLevel}%</span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => setZoomLevel(prev => Math.min(150, prev + 10))}
                    disabled={zoomLevel >= 150}
                  >
                    <ZoomIn className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {/* Prime-Time Legend */}
                {Object.values(primeTimeConfigs).some((schedule: any) =>
                  (schedule as any[]).some((c: any) => (c.primeTimeStart || c.prime_time_start))
                ) && (
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-sm bg-purple-100 border border-purple-300" />
                    <span className="text-xs text-gray-500">Prime Time</span>
                  </div>
                )}
              </div>

              {/* Right side: Notification Bell */}
              <NotificationBell />
            </div>

            {/* Bottom Row: Facility info, Quick Reserve, Date Navigation */}
            <div className="flex flex-wrap items-center justify-between gap-3 mt-2">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-600">Facility:</span>
                  <span className="text-sm font-semibold text-gray-900">{currentFacility?.name || 'Loading...'}</span>

                  {/* Info Popover */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 rounded-full">
                        <Info className="h-4 w-4 text-gray-500" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80">
                      <p className="text-sm text-gray-700">
                        Click on any empty time slot to book a court reservation. Hold and drag to select multiple consecutive slots. Use the sidebar to switch facilities.
                      </p>
                    </PopoverContent>
                  </Popover>
                </div>

                <Button
                  onClick={() => setShowQuickReserve(true)}
                  className="flex items-center gap-2 px-4 py-1.5 font-medium shadow-md"
                  size="sm"
                >
                  <Calendar className="h-4 w-4" />
                  Quick Reserve
                </Button>
              </div>

              {/* Date Navigation with Picker */}
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => navigateDate('prev')}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" className="text-center min-w-[200px] font-medium hover:bg-gray-100">
                      {formatDate(selectedDate)}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="center">
                    <CalendarPicker
                      mode="single"
                      selected={selectedDate}
                      onSelect={(date: Date | undefined) => {
                        if (date) {
                          setSelectedDate(date);
                          setDatePickerOpen(false);
                        }
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <Button variant="outline" size="sm" onClick={() => navigateDate('next')}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Calendar Grid Container */}
        <div className="flex-1 min-h-0 flex flex-col px-4 py-2">
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
            className="calendar-scroll bg-white rounded-lg shadow-lg border border-gray-200 overflow-auto relative w-full flex-1 min-h-0"
          >
            <table style={{ tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0, width: TIME_COL_WIDTH + courts.length * effectiveCourtWidth }}>
              <thead>
                <tr>
                  {/* Corner cell: sticky in both directions */}
                  <th
                    className="sticky top-0 left-0 z-40 bg-gray-100 border-r border-b-2 border-gray-300"
                    style={{ width: TIME_COL_WIDTH, minWidth: TIME_COL_WIDTH, height: HEADER_HEIGHT, textAlign: 'center', verticalAlign: 'middle' }}
                  >
                    <span className="font-semibold text-xs text-gray-700">Time (EST)</span>
                  </th>
                  {/* Court header cells: sticky top */}
                  {courts.map((court, index) => (
                    <th
                      key={index}
                      className="sticky top-0 z-30 bg-white border-r border-b-2 border-gray-300 last:border-r-0 p-3 text-left font-normal"
                      style={{ width: effectiveCourtWidth, minWidth: effectiveCourtWidth, height: HEADER_HEIGHT, verticalAlign: 'middle' }}
                    >
                      <div className="font-semibold text-sm text-gray-900">{court.name}</div>
                      <div className="text-xs text-gray-500 mt-0.5 capitalize">{court.type}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleTimeSlots.map((time30, visibleIdx) => {
                  const isHourMark = time30.endsWith(':00 AM') || time30.endsWith(':00 PM');
                  const topTime = allTimeSlots[visibleIdx * 2];
                  const bottomTime = allTimeSlots[visibleIdx * 2 + 1];

                  return (
                    <tr key={visibleIdx} style={{ height: ROW_HEIGHT }}>
                      {/* Sticky time label */}
                      <td
                        className="sticky left-0 z-10 bg-gray-50 border-r border-gray-200 px-2"
                        style={{
                          width: TIME_COL_WIDTH, minWidth: TIME_COL_WIDTH,
                          textAlign: 'right', verticalAlign: 'top', paddingTop: 4,
                          borderBottom: isHourMark ? '1px solid #d1d5db' : '1px solid #f3f4f6',
                        }}
                      >
                        <span className={`text-xs ${isHourMark ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>
                          {time30}
                        </span>
                      </td>

                      {/* Court cells */}
                      {courts.map((court, courtIndex) => {
                        const topBooking = bookings[court.name as keyof typeof bookings]?.[topTime];
                        const bottomBooking = bottomTime ? bookings[court.name as keyof typeof bookings]?.[bottomTime] : null;
                        const topPast = isPastTime(topTime);
                        const bottomPast = bottomTime ? isPastTime(bottomTime) : false;
                        const topSelected = dragState.selectedCells.has(`${court.name}|${topTime}`);
                        const bottomSelected = bottomTime ? dragState.selectedCells.has(`${court.name}|${bottomTime}`) : false;
                        const topPrime = isPrimeTimeSlot(court.id, topTime);
                        const bottomPrime = bottomTime ? isPrimeTimeSlot(court.id, bottomTime) : false;

                        return (
                          <td
                            key={courtIndex}
                            className="relative border-r border-gray-200 last:border-r-0 p-0"
                            style={{
                              width: effectiveCourtWidth, minWidth: effectiveCourtWidth,
                              height: ROW_HEIGHT, verticalAlign: 'top',
                              borderBottom: isHourMark ? '1px solid #d1d5db' : '1px solid #f3f4f6',
                            }}
                          >
                            {/* Top half (first 15 min) */}
                            <div
                              className={`absolute top-0 left-0 right-0
                                ${topPast && !topBooking ? 'bg-gray-100 cursor-not-allowed' : ''}
                                ${!topPast && !topBooking ? `cursor-pointer ${topPrime ? 'bg-purple-50 hover:bg-purple-100' : 'hover:bg-green-50'}` : ''}
                                ${topBooking ? 'cursor-pointer' : ''}
                                ${topSelected ? 'bg-green-100 ring-1 ring-inset ring-green-400' : ''}
                                ${dragState.isDragging && !topBooking ? 'select-none' : ''}
                              `}
                              style={{ height: SUB_SLOT_HEIGHT }}
                              onClick={() => {
                                if (dragJustFinishedRef.current) return;
                                if (topPast && !topBooking) return;
                                if (topBooking) handleBookingClick(court.name, topTime);
                                else handleEmptySlotClick(court.name, topTime);
                              }}
                              onMouseDown={(e) => !topBooking && !topPast && handleMouseDown(court.name, topTime, e)}
                              onMouseEnter={() => !topPast && handleMouseEnter(court.name, topTime)}
                            />

                            {/* 15-min midpoint line */}
                            <div
                              className="absolute left-1 right-1 border-b border-dashed border-gray-200 pointer-events-none"
                              style={{ top: SUB_SLOT_HEIGHT }}
                            />

                            {/* Bottom half (second 15 min) */}
                            {bottomTime && (
                              <div
                                className={`absolute left-0 right-0
                                  ${bottomPast && !bottomBooking ? 'bg-gray-100 cursor-not-allowed' : ''}
                                  ${!bottomPast && !bottomBooking ? `cursor-pointer ${bottomPrime ? 'bg-purple-50 hover:bg-purple-100' : 'hover:bg-green-50'}` : ''}
                                  ${bottomBooking ? 'cursor-pointer' : ''}
                                  ${bottomSelected ? 'bg-green-100 ring-1 ring-inset ring-green-400' : ''}
                                  ${dragState.isDragging && !bottomBooking ? 'select-none' : ''}
                                `}
                                style={{ top: SUB_SLOT_HEIGHT, height: SUB_SLOT_HEIGHT }}
                                onClick={() => {
                                  if (dragJustFinishedRef.current) return;
                                  if (bottomPast && !bottomBooking) return;
                                  if (bottomBooking) handleBookingClick(court.name, bottomTime);
                                  else handleEmptySlotClick(court.name, bottomTime);
                                }}
                                onMouseDown={(e) => !bottomBooking && !bottomPast && handleMouseDown(court.name, bottomTime, e)}
                                onMouseEnter={() => !bottomPast && handleMouseEnter(court.name, bottomTime)}
                              />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Booking Overlay Layer — positioned on top of the grid */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: TIME_COL_WIDTH + courts.length * effectiveCourtWidth,
                height: HEADER_HEIGHT + visibleTimeSlots.length * ROW_HEIGHT,
                zIndex: 5,
                pointerEvents: 'none',
              }}
            >
              {bookingOverlays.map((overlay, idx) => {
                const top = HEADER_HEIGHT + overlay.startSlotIndex * SUB_SLOT_HEIGHT + 2;
                const left = TIME_COL_WIDTH + overlay.courtIndex * effectiveCourtWidth + 4;
                const width = effectiveCourtWidth - 8;
                const height = overlay.slotCount * SUB_SLOT_HEIGHT - 4;
                const { booking } = overlay;

                const isBlocked = booking.type === 'blocked';
                const colorClass = isBlocked
                  ? 'bg-gray-100 text-gray-500 border-gray-300 border-dashed'
                  : booking.bookingType
                    ? getBookingTypeBadgeColor(booking.bookingType)
                    : 'bg-blue-50 text-blue-900 border-blue-200';

                return (
                  <div
                    key={`booking-${booking.bookingId || idx}`}
                    className={`absolute rounded-lg border shadow-sm ${isBlocked ? 'opacity-70' : 'hover:shadow-md cursor-pointer'} transition-shadow pointer-events-auto overflow-hidden ${colorClass}`}
                    style={{ top, left, width, height }}
                    onClick={() => !isBlocked && handleBookingClick(overlay.courtName, allTimeSlots[overlay.startSlotIndex])}
                  >
                    <div className="px-2 py-1 h-full flex flex-col overflow-hidden">
                      <div className="text-xs font-semibold leading-tight truncate">{booking.player}</div>
                      {height > 28 && (
                        <div className="text-[10px] opacity-75 mt-0.5">
                          {booking.duration}
                          {booking.bookingType && (
                            <span className="ml-1 px-1 py-0.5 rounded text-[9px] font-medium bg-white/50">
                              {getBookingTypeLabel(booking.bookingType)}
                            </span>
                          )}
                        </div>
                      )}
                      {booking.notes && height > SUB_SLOT_HEIGHT * 3 && (
                        <div className="text-[9px] mt-1 truncate italic opacity-70">
                          {booking.notes.length > 30 ? `${booking.notes.substring(0, 30)}...` : booking.notes}
                        </div>
                      )}
                    </div>
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
                  top: `${currentTimeLinePosition + HEADER_HEIGHT}px`,
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
                    {formatCurrentTime(facilityTimezone)}
                  </div>
                </div>
                {/* Red line */}
                <div
                  className="absolute bg-red-600"
                  style={{
                    left: `${TIME_COL_WIDTH}px`,
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
                    left: `${TIME_COL_WIDTH - 6}px`,
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