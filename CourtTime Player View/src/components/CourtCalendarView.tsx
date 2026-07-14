import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAppContext } from '../contexts/AppContext';
import { BookingWizard } from './BookingWizard';
import { QuickReservePopup } from './QuickReservePopup';
import { WeekMonthCalendarView } from './WeekMonthCalendarView';
import { NotificationBell } from './NotificationBell';
import { ReservationManagementModal } from './ReservationManagementModal';
import { BulletinActivitySignupModal } from './BulletinActivitySignupModal';
import { useNotifications } from '../contexts/NotificationContext';
import { useAuth } from '../contexts/AuthContext';
import { bulletinBoardApi, facilitiesApi, usersApi, bookingApi, courtConfigApi, strikesApi, unwrapApiPayload } from '../api/client';
import { StrikeLockoutAlerts } from './StrikeLockoutAlerts';
import type { StrikeLockoutStatus } from '../../shared/utils/strikeLockout';
import { parseStrikeLockoutStatus } from '../../shared/utils/strikeLockout';
import { parseLocalDate } from '../utils/dateUtils';
import { toast } from 'sonner';
import { Calendar, CalendarDays, ChevronLeft, ChevronRight, Filter, Grid3X3, Bell, Info, User, Settings, BarChart3, MapPin, Users, LogOut, ChevronDown, ZoomIn, ZoomOut, AlertTriangle, Loader2 } from 'lucide-react';
import { Calendar as CalendarPicker } from './ui/calendar';
import { getBookingTypeColor, getBookingTypeBadgeColor, getBookingTypeLabel } from '../constants/bookingTypes';
import { sortCourtsForDisplay } from '../../shared/utils/courtDisplayOrder';
import { formatCourtCalendarSubtitle } from '../../shared/utils/courtNaming';
import { sortFacilitiesByName } from '../../shared/utils/facilitySort';
import {
  fetchBookingCalendarDetails,
  offerAddBookingToCalendar,
} from '../utils/bookingCalendar';
import {
  BULLETIN_ACTIVITY_BOOKING_TYPES,
  isBulletinActivityBooking,
} from '../utils/bulletinPostDisplay';

// Layout constants
const ROW_HEIGHT = 50;            // unused (kept for reference)
const SUB_SLOT_HEIGHT = 25;       // 30-min row height (desktop)
const TIME_COL_WIDTH = 72;
const COURT_COL_WIDTH = 180;
const HEADER_HEIGHT = 38;
/** Match native app: short hold before drag arms so scroll/swipe stay natural. */
const MOBILE_DRAG_ARM_DELAY_MS = 180;
const MOBILE_MOVEMENT_THRESHOLD_PX = 8;

/** Normalize client coordinates for mouse, pointer, or touch events. */
function getEventCoords(e: { clientX?: number; clientY?: number; touches?: TouchList; changedTouches?: TouchList }): {
  clientX: number;
  clientY: number;
} | null {
  if (e.touches && e.touches.length > 0) {
    return { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY };
  }
  if (e.changedTouches && e.changedTouches.length > 0) {
    return { clientX: e.changedTouches[0].clientX, clientY: e.changedTouches[0].clientY };
  }
  if (typeof e.clientX === 'number' && typeof e.clientY === 'number') {
    return { clientX: e.clientX, clientY: e.clientY };
  }
  return null;
}

type CourtDayOperatingBounds = { isOpen: boolean; openMin: number; closeMin: number };

function parseApiTimeToMinutes(value: unknown): number | null {
  if (value == null) return null;
  const s = typeof value === 'string' ? value : String(value);
  const timePart = s.includes('T') ? s.split('T')[1] || '' : s;
  const m = timePart.trim().match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  return h * 60 + min;
}

function calendarSlotToMinutes(timeSlot: string): number {
  const [time, period] = timeSlot.split(' ');
  let [hours, minutes] = time.split(':').map(Number);
  if (period === 'PM' && hours !== 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;
  return hours * 60 + (minutes || 0);
}

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
  const [searchParams] = useSearchParams();
  const { selectedFacilityId = 'sunrise-valley', enabledFeatures } = useAppContext();
  const { unreadCount } = useNotifications();
  const { user, loading: authLoading, refreshTermsStatus } = useAuth();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const selectedFacility = selectedFacilityId;
  const [selectedView, setSelectedView] = useState('week');
  const weekMonthViewEnabled = enabledFeatures.includes('week_month_view');
  const [calendarViewMode, setCalendarViewMode] = useState<'court' | 'week' | 'month'>('court');
  const [selectedCourtType, setSelectedCourtType] = useState<'tennis' | 'pickleball' | null>(null);
  const [currentTime, setCurrentTime] = useState(getFacilityDate());
  const [memberFacilities, setMemberFacilities] = useState<any[]>([]);
  const [loadingFacilities, setLoadingFacilities] = useState(true);
  const [bookingsData, setBookingsData] = useState<any>({});
  /** Effective operating window per court for the selected calendar day (from API; empty = no extra shading). */
  const [courtDayOperatingByCourtId, setCourtDayOperatingByCourtId] = useState<
    Record<string, CourtDayOperatingBounds>
  >({});
  const [loadingBookings, setLoadingBookings] = useState(false);
  const [strikeLockout, setStrikeLockout] = useState<StrikeLockoutStatus | null>(null);
  const calendarScrollRef = useRef<HTMLDivElement>(null);
  const calendarGridRef = useRef<HTMLTableElement>(null);
  const headerRowRef = useRef<HTMLTableRowElement | HTMLDivElement>(null);
  /** Mobile: court headers / body horizontal scroll (synced). */
  const courtHeaderScrollRef = useRef<HTMLDivElement>(null);
  const courtHorizontalScrollRef = useRef<HTMLDivElement>(null);
  const scrollSyncLockRef = useRef(false);
  const [measuredHeaderHeight, setMeasuredHeaderHeight] = useState<number>(HEADER_HEIGHT);
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

  // Drag selection state — `court` holds the court ID and cells are `${courtId}|${time}`
  // (IDs, not names: a facility can have same-named courts of different types).
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
  /** Removes window pointer/touch listeners when a slot drag ends or unmounts. */
  const pointerDragCleanupRef = useRef<(() => void) | null>(null);
  /** Native touchstart already began slot tracking; skip duplicate pointerdown (touch). */
  const suppressPointerDownForTouchRef = useRef(false);
  const handlePointerDragEndRef = useRef<() => void>(() => {});
  const handleEmptySlotClickRef = useRef<
    (courtId: string, time: string, dragCells?: Set<string>) => void
  >(() => {});

  /** Mobile web: long-press vertical drag (mirrors CourtCalendarGrid). */
  const mobileDragArmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mobileTouchGestureRef = useRef<{
    startClientX: number;
    startClientY: number;
    court: string;
    startTime: string;
    startSlotIndex: number;
    armed: boolean;
    moved: boolean;
    horizontalSwipe: boolean;
  } | null>(null);
  const mobileTouchCleanupRef = useRef<(() => void) | null>(null);
  const [calendarTouchLocked, setCalendarTouchLocked] = useState(false);

  // Quick reserve popup state
  const [showQuickReserve, setShowQuickReserve] = useState(false);

  // Reservation details modal state
  const [reservationDetailsModal, setReservationDetailsModal] = useState({
    isOpen: false,
    reservation: null as any
  });
  const [bulletinActivityModal, setBulletinActivityModal] = useState({
    isOpen: false,
    postId: null as string | null,
  });

  // Calendar display customization
  const [displayedCourtsCount, setDisplayedCourtsCount] = useState<number | null>(null);
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 768 : false);
  const [zoomLevel, setZoomLevel] = useState(100); // percentage: 50-200
  const [userSetZoom, setUserSetZoom] = useState(false); // tracks if user manually zoomed
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [mobileControlsExpanded, setMobileControlsExpanded] = useState(false);
  const [scrollTrigger, setScrollTrigger] = useState(0); // forces auto-scroll on mount

  // Computed court column width based on zoom
  const effectiveCourtWidth = Math.round(COURT_COL_WIDTH * zoomLevel / 100);

  // Responsive dimensions for mobile touch targets
  const effectiveSubSlotHeight = isMobile ? 40 : SUB_SLOT_HEIGHT;
  const effectiveRowHeight = isMobile ? 80 : ROW_HEIGHT;
  const effectiveTimeColWidth = isMobile ? 56 : TIME_COL_WIDTH;
  const effectiveHeaderHeight = isMobile ? 34 : HEADER_HEIGHT;

  // Peak-hours config per court: courtId -> schedule array
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
      if (authLoading) {
        return;
      }

      const allFacilityIds = Array.from(new Set([
        ...(user?.memberFacilities || []),
      ]));

      if (allFacilityIds.length === 0) {
        setMemberFacilities([]);
        setLoadingFacilities(false);
        return;
      }

      try {
        setLoadingFacilities(true);
        const facilitiesData: Array<{ id: string; name: string; type: string; status?: string; courts: Array<{ id: string; name: string; type: string; typeLabel: string; surfaceType?: string; parentCourtId?: string | null; isSplitCourt?: boolean; isWalkUp?: boolean }>; operatingHours?: any; timezone?: string }> = [];

        for (const facilityId of allFacilityIds) {
          // Fetch facility details
          const facilityResponse = await facilitiesApi.getById(facilityId);
          if (facilityResponse.success && facilityResponse.data) {
            const facility = facilityResponse.data.facility;

            // Fetch courts for this facility
            const courtsResponse = await facilitiesApi.getCourts(facilityId);
            const courts = courtsResponse.success && courtsResponse.data?.courts
              ? sortCourtsForDisplay(
                  courtsResponse.data.courts
                    .filter((court: any) => {
                      const s = (court.status || 'available').toLowerCase();
                      return s === 'available' || s === 'active';
                    })
                    .map((court: any) => ({
                      id: court.id,
                      name: court.name,
                      courtType: court.courtType ?? court.court_type,
                      courtNumber:
                        typeof court.courtNumber === 'number'
                          ? court.courtNumber
                          : typeof court.court_number === 'number'
                            ? court.court_number
                            : court.courtNumber != null
                              ? parseInt(String(court.courtNumber), 10)
                              : court.court_number != null
                                ? parseInt(String(court.court_number), 10)
                                : undefined,
                      type: (court.courtType ?? court.court_type)?.toLowerCase?.() || 'tennis',
                      surfaceType: court.surfaceType ?? court.surface_type,
                      parentCourtId: court.parentCourtId ?? court.parent_court_id ?? null,
                      isSplitCourt: court.isSplitCourt || court.is_split_court || false,
                      isWalkUp: court.isWalkUp === true || court.is_walk_up === true,
                      requirePayment: court.requirePayment === true || court.require_payment === true,
                      bookingAmountCents:
                        court.bookingAmountCents != null
                          ? Number(court.bookingAmountCents)
                          : court.booking_amount_cents != null
                            ? Number(court.booking_amount_cents)
                            : null,
                      guestFeeCents:
                        court.guestFeeCents != null
                          ? Number(court.guestFeeCents)
                          : court.guest_fee_cents != null
                            ? Number(court.guest_fee_cents)
                            : null,
                      ballMachineFeeCents:
                        court.ballMachineFeeCents != null
                          ? Number(court.ballMachineFeeCents)
                          : court.ball_machine_fee_cents != null
                            ? Number(court.ball_machine_fee_cents)
                            : null,
                    }))
                ).map((court) => ({
                  id: court.id,
                  name: court.name,
                  type: court.type,
                  typeLabel: String(court.courtType ?? '').trim() || court.type,
                  surfaceType: court.surfaceType,
                  parentCourtId: court.parentCourtId,
                  isSplitCourt: court.isSplitCourt,
                  isWalkUp: court.isWalkUp,
                  requirePayment: court.requirePayment,
                  bookingAmountCents: court.bookingAmountCents,
                  guestFeeCents: court.guestFeeCents,
                  ballMachineFeeCents: court.ballMachineFeeCents,
                }))
              : [];

            facilitiesData.push({
              id: facility.id,
              name: facility.name,
              type: facility.type || facility.facilityType || 'Tennis Facility',
              status: facility.status || 'active',
              courts,
              operatingHours: facility.operatingHours,
              timezone: facility.timezone || 'America/New_York',
            });
          }
        }

        setMemberFacilities(sortFacilitiesByName(facilitiesData));
      } catch (error) {
        console.error('Error fetching facilities:', error);
      } finally {
        setLoadingFacilities(false);
      }
    };

    fetchFacilities();
  }, [user?.memberFacilities, authLoading]);

  useEffect(() => {
    if (!user?.id || !selectedFacility) {
      setStrikeLockout(null);
      return;
    }
    let cancelled = false;
    strikesApi.checkLockout(user.id, selectedFacility).then((res) => {
      if (cancelled) return;
      if (res.success) {
        setStrikeLockout(parseStrikeLockoutStatus(res.data));
      } else {
        setStrikeLockout(null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id, selectedFacility]);

  useEffect(() => {
    if (!user?.id) return;
    void refreshTermsStatus();
  }, [user?.id, selectedFacility, refreshTermsStatus]);

  // Function to fetch bookings (can be called directly)
  const fetchBookings = React.useCallback(async (dateOverride?: Date | string) => {
    if (!selectedFacility) {
      setCourtDayOperatingByCourtId({});
      return;
    }

    try {
      setLoadingBookings(true);

      const dateForFetch =
        typeof dateOverride === 'string'
          ? parseLocalDate(dateOverride)
          : dateOverride ?? selectedDate;

      // Format date as YYYY-MM-DD for API (using local date to avoid timezone issues)
      const year = dateForFetch.getFullYear();
      const month = String(dateForFetch.getMonth() + 1).padStart(2, '0');
      const day = String(dateForFetch.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;

      // Fetch bookings, blackouts, and per-court operating windows for this day
      const [response, blackoutResponse, facilityDayResponse] = await Promise.all([
        bookingApi.getByFacility(selectedFacility, dateStr),
        courtConfigApi.getFacilityBlackouts(selectedFacility, {
          startDate: dateStr,
          endDate: dateStr,
        }),
        courtConfigApi.getFacilityDayOperating(selectedFacility, dateStr),
      ]);

      if (facilityDayResponse?.success && Array.isArray(facilityDayResponse.data?.courtConfigs)) {
        const nextBounds: Record<string, CourtDayOperatingBounds> = {};
        (facilityDayResponse.data.courtConfigs as any[]).forEach((row: any) => {
          const openMin = parseApiTimeToMinutes(row.openTime);
          const closeMin = parseApiTimeToMinutes(row.closeTime);
          if (openMin === null || closeMin === null) return;
          nextBounds[row.courtId] = {
            isOpen: row.isOpen !== false,
            openMin,
            closeMin,
          };
        });
        setCourtDayOperatingByCourtId(nextBounds);
      } else {
        setCourtDayOperatingByCourtId({});
      }

      // Transform API bookings to match the format expected by the UI.
      // Keyed by court ID (not name) — facilities can have same-named courts
      // of different types (e.g. "Court 3" tennis and "Court 3" pickleball).
      const transformedBookings: any = {};

      // Build court lookup maps for parent/child relationships
      const facilityForBookings = memberFacilities.find(f => f.id === selectedFacility);
      const allFacilityCourts = facilityForBookings?.courts || [];
      const courtIdToName: Record<string, string> = {};
      const courtNameToId: Record<string, string> = {};
      allFacilityCourts.forEach((c: any) => {
        courtIdToName[c.id] = c.name;
        courtNameToId[c.name] = c.id;
      });
      const parentToChildren: Record<string, string[]> = {};
      allFacilityCourts.forEach((c: any) => {
        if (c.parentCourtId) {
          if (!parentToChildren[c.parentCourtId]) parentToChildren[c.parentCourtId] = [];
          parentToChildren[c.parentCourtId].push(c.id);
        }
      });

      // Helper to add slot entries for a court
      const addSlotsForCourt = (targetCourtId: string, booking: any, isBlocked: boolean, blockedBy?: string) => {
        if (!transformedBookings[targetCourtId]) {
          transformedBookings[targetCourtId] = {};
        }

        const [startHours, startMinutes] = booking.startTime.split(':').map(Number);
        const [endHours, endMinutes] = booking.endTime ? booking.endTime.split(':').map(Number) : [NaN, NaN];
        const startTotalMinutes = (startHours * 60) + startMinutes;
        const endTotalMinutes = Number.isFinite(endHours) && Number.isFinite(endMinutes)
          ? (endHours * 60) + endMinutes
          : NaN;
        const fallbackDurationMinutes = Number.isFinite(booking.durationMinutes)
          ? booking.durationMinutes
          : parseInt(String(booking.durationMinutes), 10);
        const resolvedEndMinutes = Number.isFinite(endTotalMinutes) && endTotalMinutes > startTotalMinutes
          ? endTotalMinutes
          : startTotalMinutes + (Number.isFinite(fallbackDurationMinutes) ? fallbackDurationMinutes : 15);
        const slotsToFill = Math.max(1, Math.ceil((resolvedEndMinutes - startTotalMinutes) / 15));

        let slotStartTotalMinutes = startTotalMinutes;
        while (slotStartTotalMinutes < resolvedEndMinutes) {
          const slotHours = Math.floor(slotStartTotalMinutes / 60);
          const actualMinutes = slotStartTotalMinutes % 60;
          const period = slotHours >= 12 ? 'PM' : 'AM';
          const displayHour = slotHours > 12 ? slotHours - 12 : slotHours === 0 ? 12 : slotHours;
          const slotTime = `${displayHour}:${actualMinutes.toString().padStart(2, '0')} ${period}`;
          const slotIndex = Math.floor((slotStartTotalMinutes - startTotalMinutes) / 15);

          // Don't overwrite real bookings with blocked entries
          if (transformedBookings[targetCourtId][slotTime]) {
            slotStartTotalMinutes += 15;
            continue;
          }

          if (isBlocked) {
            transformedBookings[targetCourtId][slotTime] = {
              player: `Blocked (${blockedBy})`,
              duration: `${booking.durationMinutes}min`,
              type: 'blocked',
              startTime: booking.startTime,
              endTime: booking.endTime,
              isFirstSlot: slotIndex === 0,
              slotCount: slotsToFill,
              bookingType: 'blocked',
            };
          } else {
            const activityLabel =
              BULLETIN_ACTIVITY_BOOKING_TYPES.has(String(booking.bookingType || '').toLowerCase()) &&
              booking.notes
                ? String(booking.notes)
                : booking.userName || 'Reserved';
            transformedBookings[targetCourtId][slotTime] = {
              player: activityLabel,
              duration: `${booking.durationMinutes}min`,
              type: 'reservation',
              bookingId: booking.id,
              userId: booking.userId,
              startTime: booking.startTime,
              endTime: booking.endTime,
              isFirstSlot: slotIndex === 0,
              slotCount: slotsToFill,
              bookingType: booking.bookingType,
              notes: booking.notes,
              fullDetails: {
                ...booking,
                facilityName: facilityForBookings?.name
              }
            };
          }
          slotStartTotalMinutes += 15;
        }
      };

      // Helper to add blackout slots for a court across a time range
      const addBlackoutSlots = (courtId: string, startHour: number, startMin: number, endHour: number, endMin: number, title: string) => {
        if (!transformedBookings[courtId]) {
          transformedBookings[courtId] = {};
        }
        let h = startHour;
        let m = startMin;
        const totalSlots = Math.max(1, Math.ceil((((endHour * 60) + endMin) - ((startHour * 60) + startMin)) / 15));
        let isFirst = true;
        while (h < endHour || (h === endHour && m < endMin)) {
          const period = h >= 12 ? 'PM' : 'AM';
          const displayHour = h > 12 ? h - 12 : h === 0 ? 12 : h;
          const slotTime = `${displayHour}:${m.toString().padStart(2, '0')} ${period}`;

          if (!transformedBookings[courtId][slotTime]) {
            transformedBookings[courtId][slotTime] = {
              player: title || 'Blackout',
              duration: '',
              type: 'blocked',
              isFirstSlot: isFirst,
              slotCount: totalSlots,
              bookingType: 'blackout',
              startTime: `${startHour.toString().padStart(2, '0')}:${startMin.toString().padStart(2, '0')}:00`,
              endTime: `${endHour.toString().padStart(2, '0')}:${endMin.toString().padStart(2, '0')}:00`,
            };
          }
          isFirst = false;
          m += 15;
          if (m >= 60) { h++; m = 0; }
        }
      };

      // Process blackouts
      const blackouts = blackoutResponse?.success ? (blackoutResponse.data?.blackouts || []) : [];
      blackouts.forEach((b: any) => {
        const bStart = parseLocalDate(b.start_datetime);
        const bEnd = parseLocalDate(b.end_datetime);
        // Clamp to the selected date's boundaries (0:00 - 23:59)
        const dayStart = new Date(selectedDate); dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(selectedDate); dayEnd.setHours(23, 59, 59, 999);
        const effectiveStart = bStart < dayStart ? dayStart : bStart;
        const effectiveEnd = bEnd > dayEnd ? dayEnd : bEnd;
        const startH = effectiveStart.getHours();
        const startM = Math.floor(effectiveStart.getMinutes() / 15) * 15;
        const endH = effectiveEnd.getHours();
        const endM = Math.ceil(effectiveEnd.getMinutes() / 15) * 15;

        const label = b.title || b.blackout_type || 'Blackout';

        if (b.court_id) {
          // Court-specific blackout
          if (courtIdToName[b.court_id]) {
            addBlackoutSlots(b.court_id, startH, startM, endH, endM, label);
          }
        } else {
          // Facility-wide blackout — apply to all courts
          allFacilityCourts.forEach((c: any) => {
            addBlackoutSlots(c.id, startH, startM, endH, endM, label);
          });
        }
      });

      if (response.success && response.data?.bookings) {
        response.data.bookings.forEach((booking: any) => {
          const courtName = booking.courtName;
          const bookingCourtId = booking.courtId || courtNameToId[courtName];
          if (!bookingCourtId) return;

          // Add real booking slots
          addSlotsForCourt(bookingCourtId, booking, false);

          // Propagate blocks to related parent/child courts
          const bookedCourt = allFacilityCourts.find((c: any) => c.id === bookingCourtId);
          if (bookedCourt) {
            // If child court is booked, block the parent
            if (bookedCourt.parentCourtId && courtIdToName[bookedCourt.parentCourtId]) {
              addSlotsForCourt(bookedCourt.parentCourtId, booking, true, courtName);
            }
            // If parent court is booked, block all children
            const children = parentToChildren[bookedCourt.id];
            if (children) {
              children.forEach((childId: string) => {
                addSlotsForCourt(childId, booking, true, courtName);
              });
            }
          }
        });
      }

      setBookingsData(transformedBookings);
    } catch (error) {
      console.error('Error fetching bookings:', error);
      setBookingsData({});
      setCourtDayOperatingByCourtId({});
    } finally {
      setLoadingBookings(false);
    }
  }, [selectedFacility, selectedDate, memberFacilities]);

  // Fetch bookings for selected facility and date
  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  // Recover paid court checkouts that never created a booking (e.g. Stripe returned to wrong host)
  useEffect(() => {
    if (authLoading || !user?.id) return;
    if (searchParams.get('bookingPaymentSuccess') === '1') return;

    let cancelled = false;
    void (async () => {
      try {
        const reconcile = await bookingApi.reconcilePaidBookings();
        if (cancelled || !reconcile.success || !reconcile.count) return;
        const latest = reconcile.recovered?.[0];
        if (latest?.bookingDate) {
          const [y, m, d] = latest.bookingDate.split('-').map(Number);
          if (y && m && d) setSelectedDate(new Date(y, m - 1, d));
        }
        toast.success('Your paid court reservation is now on the calendar.');
        sessionStorage.removeItem('courtBookingCheckoutPending');
        await fetchBookings(latest?.bookingDate);
      } catch (err) {
        console.error('Paid court booking reconcile error:', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, user?.id, searchParams, fetchBookings]);

  // Complete paid bulletin signup after Stripe redirect
  useEffect(() => {
    const signupSuccess = searchParams.get('signupSuccess');
    const sessionId = searchParams.get('session_id');
    const returnPostId = searchParams.get('postId');
    if (signupSuccess !== '1' || !sessionId || sessionId === '{CHECKOUT_SESSION_ID}') return;
    if (authLoading || !user?.id) return;

    const clearParams = () => {
      navigate('/calendar', { replace: true });
    };

    let cancelled = false;
    (async () => {
      try {
        const response = await bulletinBoardApi.confirmSignupPayment(sessionId);
        if (cancelled) return;
        if (response.success) {
          const payload = unwrapApiPayload<{ status?: string; waitlistPosition?: number | null }>(
            response.data
          );
          toast.success(
            response.message ||
              (payload?.status === 'waitlist'
                ? `Payment received — waitlist #${payload.waitlistPosition ?? '?'}`
                : 'Payment received — you are signed up!')
          );
          if (returnPostId) {
            setBulletinActivityModal({ isOpen: true, postId: returnPostId });
          }
          await fetchBookings();
        } else {
          toast.error(
            response.error || 'Payment received but signup could not be confirmed.'
          );
        }
      } catch (err) {
        console.error('Confirm bulletin signup from calendar:', err);
        toast.error('Payment received but signup could not be confirmed.');
      } finally {
        if (!cancelled) clearParams();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, user?.id, searchParams, navigate, fetchBookings]);

  // Open bulletin activity modal from ?postId= (e.g. cancel URL after Stripe)
  useEffect(() => {
    const postId = searchParams.get('postId');
    const signupSuccess = searchParams.get('signupSuccess');
    if (!postId || signupSuccess === '1') return;
    setBulletinActivityModal({ isOpen: true, postId });
    navigate('/calendar', { replace: true });
  }, [searchParams, navigate]);

  // Complete paid court booking after Stripe redirect (or recover orphaned PAID rows)
  useEffect(() => {
    const paymentSuccess = searchParams.get('bookingPaymentSuccess');
    const sessionId = searchParams.get('session_id');
    if (paymentSuccess !== '1') return;
    if (authLoading) return;
    if (!user?.id) {
      toast.error('Please log in again to finish confirming your paid court reservation.');
      return;
    }

    const clearParams = () => {
      sessionStorage.removeItem('courtBookingCheckoutPending');
      navigate('/calendar', { replace: true });
    };

    const facilityName = memberFacilities.find((f) => f.id === selectedFacility)?.name;

    const offerCalendarForBooking = async (
      bookingId: string | undefined,
      message: string,
      options?: { alertTitle?: string }
    ) => {
      if (!bookingId) {
        toast.success(message);
        return;
      }
      const details = await fetchBookingCalendarDetails(bookingId, facilityName);
      offerAddBookingToCalendar(message, details, {
        alertTitle: options?.alertTitle || 'Payment received',
        bookingId,
      });
    };

    const applyRecoveredBookings = async (
      recovered: Array<{ bookingId: string; bookingDate?: string }>
    ) => {
      if (recovered.length === 0) return false;
      const latest = recovered[0];
      if (latest.bookingDate) {
        const [y, m, d] = latest.bookingDate.split('-').map(Number);
        if (y && m && d) setSelectedDate(new Date(y, m - 1, d));
      }
      const message =
        recovered.length > 1
          ? `${recovered.length} paid court reservations are now on your calendar.`
          : 'Your paid court reservation is now on the calendar.';
      if (recovered.length === 1 && latest.bookingId) {
        await offerCalendarForBooking(latest.bookingId, message);
      } else {
        toast.success(message);
      }
      await fetchBookings(latest.bookingDate);
      return true;
    };

    if (!sessionId || sessionId === '{CHECKOUT_SESSION_ID}') {
      void (async () => {
        const reconcile = await bookingApi.reconcilePaidBookings();
        if (reconcile.success && reconcile.count && reconcile.count > 0) {
          await applyRecoveredBookings(reconcile.recovered ?? []);
        } else {
          toast.info('Payment received. Refreshing your calendar…');
          await fetchBookings();
        }
        clearParams();
      })();
      return;
    }

    const storageKey = `courtBookingConfirmed:${sessionId}`;
    const storedBookingId = sessionStorage.getItem(`${storageKey}:bookingId`);
    if (storedBookingId) {
      void fetchBookings().finally(clearParams);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const response = await bookingApi.confirmPayment(sessionId);
        if (cancelled) return;
        if (response.success) {
          const bookingId = (response as { bookingId?: string }).bookingId;
          const bookingDate = (response as { bookingDate?: string }).bookingDate;
          if (!bookingId) {
            const reconcile = await bookingApi.reconcilePaidBookings();
            if (reconcile.success && reconcile.count && reconcile.count > 0) {
              sessionStorage.setItem(storageKey, '1');
              if (reconcile.recovered?.[0]?.bookingId) {
                sessionStorage.setItem(`${storageKey}:bookingId`, reconcile.recovered[0].bookingId);
              }
              await applyRecoveredBookings(reconcile.recovered ?? []);
              return;
            }
            toast.error(
              response.error ||
                'Payment received but the reservation could not be created. Please contact the club.'
            );
            return;
          }
          sessionStorage.setItem(storageKey, '1');
          sessionStorage.setItem(`${storageKey}:bookingId`, bookingId);
          if (bookingDate) {
            const [y, m, d] = bookingDate.split('-').map(Number);
            if (y && m && d) setSelectedDate(new Date(y, m - 1, d));
          }
          await offerCalendarForBooking(
            bookingId,
            response.message || 'Payment received — your court is booked!'
          );
          await fetchBookings(bookingDate);
        } else {
          const reconcile = await bookingApi.reconcilePaidBookings();
          if (reconcile.success && reconcile.count && reconcile.count > 0) {
            await applyRecoveredBookings(reconcile.recovered ?? []);
          } else {
            toast.error(response.error || 'Payment received but booking could not be confirmed.');
          }
        }
      } catch (err) {
        console.error('Confirm booking payment error:', err);
        if (!cancelled) {
          const reconcile = await bookingApi.reconcilePaidBookings();
          if (reconcile.success && reconcile.count && reconcile.count > 0) {
            await applyRecoveredBookings(reconcile.recovered ?? []);
          } else {
            toast.error('Payment received but booking could not be confirmed. Contact the club.');
          }
        }
      } finally {
        if (!cancelled) clearParams();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [searchParams, user?.id, authLoading, navigate, fetchBookings]);

  // Recover paid bookings when checkout finished but redirect params were lost
  useEffect(() => {
    if (authLoading || !user?.id) return;
    if (searchParams.get('bookingPaymentSuccess') === '1') return;
    const pendingRaw = sessionStorage.getItem('courtBookingCheckoutPending');
    if (!pendingRaw) return;

    let cancelled = false;
    void (async () => {
      try {
        const reconcile = await bookingApi.reconcilePaidBookings();
        if (cancelled || !reconcile.success || !reconcile.count) return;
        const latest = reconcile.recovered?.[0];
        if (latest?.bookingDate) {
          const [y, m, d] = latest.bookingDate.split('-').map(Number);
          if (y && m && d) setSelectedDate(new Date(y, m - 1, d));
        }
        toast.success('Your paid court reservation is now on the calendar.');
        sessionStorage.removeItem('courtBookingCheckoutPending');
        await fetchBookings(latest?.bookingDate);
      } catch (err) {
        console.error('Pending court booking reconcile error:', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, user?.id, searchParams, fetchBookings]);

  // Hardcoded fallback facilities (for users without memberships)
  const fallbackFacilities = [
    { 
      id: 'sunrise-valley', 
      name: 'Sunrise Valley HOA', 
      type: 'HOA Tennis & Pickleball Courts',
      courts: [
        { id: 'sunrise-valley-tennis-1', name: 'Tennis Court 1', type: 'tennis' },
        { id: 'sunrise-valley-tennis-2', name: 'Tennis Court 2', type: 'tennis' },
        { id: 'sunrise-valley-pickleball-1', name: 'Pickleball Court 1', type: 'pickleball' },
        { id: 'sunrise-valley-pickleball-2', name: 'Pickleball Court 2', type: 'pickleball' }
      ]
    },
    { 
      id: 'downtown', 
      name: 'Downtown Tennis Center', 
      type: 'Tennis Club',
      courts: [
        { id: 'downtown-tennis-1', name: 'Court 1', type: 'tennis' },
        { id: 'downtown-tennis-2', name: 'Court 2', type: 'tennis' },
        { id: 'downtown-tennis-3', name: 'Court 3', type: 'tennis' },
        { id: 'downtown-tennis-4', name: 'Court 4', type: 'tennis' }
      ]
    },
    { 
      id: 'riverside', 
      name: 'Riverside Tennis Club', 
      type: 'Premium Tennis Club',
      courts: [
        { id: 'riverside-center-court', name: 'Center Court', type: 'tennis' },
        { id: 'riverside-court-a', name: 'Court A', type: 'tennis' },
        { id: 'riverside-court-b', name: 'Court B', type: 'tennis' },
        { id: 'riverside-practice-court', name: 'Practice Court', type: 'tennis' }
      ]
    },
    {
      id: 'westside',
      name: 'Westside Pickleball Club',
      type: 'Pickleball Club',
      courts: [
        { id: 'westside-pickleball-1', name: 'Court 1', type: 'pickleball' },
        { id: 'westside-pickleball-2', name: 'Court 2', type: 'pickleball' },
        { id: 'westside-pickleball-3', name: 'Court 3', type: 'pickleball' },
        { id: 'westside-pickleball-4', name: 'Court 4', type: 'pickleball' },
        { id: 'westside-pickleball-5', name: 'Court 5', type: 'pickleball' },
        { id: 'westside-pickleball-6', name: 'Court 6', type: 'pickleball' }
      ]
    },
    {
      id: 'eastgate',
      name: 'Eastgate Sports Complex',
      type: 'Multi-Sport Complex',
      courts: [
        { id: 'eastgate-tennis-a', name: 'Tennis Court A', type: 'tennis' },
        { id: 'eastgate-tennis-b', name: 'Tennis Court B', type: 'tennis' },
        { id: 'eastgate-pickleball-1', name: 'Pickleball Court 1', type: 'pickleball' },
        { id: 'eastgate-pickleball-2', name: 'Pickleball Court 2', type: 'pickleball' },
        { id: 'eastgate-pickleball-3', name: 'Pickleball Court 3', type: 'pickleball' },
        { id: 'eastgate-pickleball-4', name: 'Pickleball Court 4', type: 'pickleball' }
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

  // Derive operating hours (minute-precise) and timezone from facility config
  const { startHour, endHour, dayStartMinutes, dayEndMinutes, facilityTimezone } = useMemo(() => {
    const oh = currentFacility?.operatingHours;
    const tz = currentFacility?.timezone || 'America/New_York';
    if (!oh) {
      return {
        startHour: 6,
        endHour: 21,
        dayStartMinutes: 6 * 60,
        dayEndMinutes: 21 * 60,
        facilityTimezone: tz,
      };
    }

    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayName = dayNames[selectedDate.getDay()];
    const dayConfig = oh[dayName];

    if (!dayConfig || dayConfig.closed) {
      return {
        startHour: 6,
        endHour: 21,
        dayStartMinutes: 6 * 60,
        dayEndMinutes: 21 * 60,
        facilityTimezone: tz,
      };
    }

    const [openHour, openMinute] = dayConfig.open
      ? dayConfig.open.split(':').map((v: string) => parseInt(v, 10))
      : [6, 0];
    const [closeHour, closeMinute] = dayConfig.close
      ? dayConfig.close.split(':').map((v: string) => parseInt(v, 10))
      : [21, 0];
    const safeOpenHour = Number.isFinite(openHour) ? openHour : 6;
    const safeOpenMinute = Number.isFinite(openMinute) ? openMinute : 0;
    const safeCloseHour = Number.isFinite(closeHour) ? closeHour : 21;
    const safeCloseMinute = Number.isFinite(closeMinute) ? closeMinute : 0;
    const startMinutes = (safeOpenHour * 60) + safeOpenMinute;
    const endMinutes = (safeCloseHour * 60) + safeCloseMinute;

    return {
      startHour: safeOpenHour,
      endHour: safeCloseHour,
      dayStartMinutes: startMinutes,
      dayEndMinutes: endMinutes,
      facilityTimezone: tz,
    };
  }, [currentFacility, selectedDate]);

  // Calculate the position of the current time indicator line
  const currentTimeLinePosition = useMemo(() => {
    if (!isToday(selectedDate)) return null;

    const { hours, minutes } = getTimeComponents(facilityTimezone);

    const currentMinutes = (hours * 60) + minutes;
    if (currentMinutes < dayStartMinutes || currentMinutes > dayEndMinutes) return null;
    const position = ((currentMinutes - dayStartMinutes) / 30) * effectiveSubSlotHeight;

    return position;
  }, [currentTime, selectedDate, isToday, dayStartMinutes, dayEndMinutes, facilityTimezone, effectiveSubSlotHeight]);

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
    const slotStartMinutes = hours * 60 + (minutes || 0);
    const slotEndMinutes = slotStartMinutes + 15;
    const currentMinutes = nowHour * 60 + nowMinute;

    return currentMinutes >= slotEndMinutes;
  }, [selectedDate, currentTime, isToday, facilityTimezone]);

  /** True when this court column is outside its effective open window for the selected day (stricter than facility grid). */
  const isCourtSlotOutsideOperatingHours = useCallback(
    (courtId: string | undefined, timeSlot: string): boolean => {
      if (!courtId) return false;
      const bounds = courtDayOperatingByCourtId[courtId];
      if (!bounds) return false;
      if (!bounds.isOpen) return true;
      const slotMin = calendarSlotToMinutes(timeSlot);
      return slotMin < bounds.openMin || slotMin >= bounds.closeMin;
    },
    [courtDayOperatingByCourtId]
  );

  // Filter courts based on selected court type (re-sort so column order is always correct)
  const allCourts = React.useMemo(
    () => sortCourtsForDisplay([...(currentFacility?.courts || [])]),
    [currentFacility?.courts]
  );
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
    // Show all courts — the calendar container scrolls horizontally
    return filteredCourts;
  }, [filteredCourts, displayedCourtsCount, isMobile]);

  // Auto-zoom to fill available width when court count changes
  useEffect(() => {
    if (userSetZoom || !calendarScrollRef.current || courts.length === 0) return;
    const containerWidth = calendarScrollRef.current.clientWidth;
    const availableForCourts = containerWidth - effectiveTimeColWidth - 2; // subtract time col + border
    const idealCourtWidth = availableForCourts / courts.length;
    const idealZoom = Math.round((idealCourtWidth / COURT_COL_WIDTH) * 100);
    // Clamp between 50% and 200%
    const clamped = Math.max(50, Math.min(200, idealZoom));
    setZoomLevel(clamped);
  }, [courts.length, effectiveTimeColWidth, userSetZoom]);

  useEffect(() => {
    const updateHeaderHeight = () => {
      const measured = headerRowRef.current?.getBoundingClientRect().height;
      if (measured && Number.isFinite(measured) && measured > 0) {
        setMeasuredHeaderHeight(measured);
      } else {
        setMeasuredHeaderHeight(effectiveHeaderHeight);
      }
    };
    updateHeaderHeight();
    window.addEventListener('resize', updateHeaderHeight);
    return () => window.removeEventListener('resize', updateHeaderHeight);
  }, [courts.length, effectiveHeaderHeight, effectiveCourtWidth, zoomLevel, isMobile]);

  // Fetch peak-hours configs for visible courts
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

  // Helper: check if a time slot is during peak hours for a court
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

  // Generate time slots for the day (30-minute intervals)
  const allTimeSlots = React.useMemo(() => {
    const slots: string[] = [];
    for (let minuteOfDay = dayStartMinutes; minuteOfDay <= dayEndMinutes; minuteOfDay += 30) {
      const hour = Math.floor(minuteOfDay / 60);
      const minute = minuteOfDay % 60;
      const period = hour >= 12 ? 'PM' : 'AM';
      const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
      const displayMinute = minute.toString().padStart(2, '0');
      slots.push(`${displayHour}:${displayMinute} ${period}`);
    }
    return slots;
  }, [dayStartMinutes, dayEndMinutes]);

  // Always show all time slots — past slots are greyed out, not hidden
  const timeSlots = React.useMemo(() => {
    return allTimeSlots;
  }, [allTimeSlots]);

  // 30-min visible rows for the table grid
  const visibleTimeSlots = React.useMemo(() => {
    const slots: string[] = [];
    for (let minuteOfDay = dayStartMinutes; minuteOfDay <= dayEndMinutes; minuteOfDay += 30) {
      const hour = Math.floor(minuteOfDay / 60);
      const minute = minuteOfDay % 60;
      const period = hour >= 12 ? 'PM' : 'AM';
      const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
      const displayMinute = minute.toString().padStart(2, '0');
      slots.push(`${displayHour}:${displayMinute} ${period}`);
    }
    return slots;
  }, [dayStartMinutes, dayEndMinutes]);

  // Use fetched bookings from API
  const bookings = bookingsData;
  const hasPeakHoursLegend = useMemo(
    () => Object.values(primeTimeConfigs).some((schedule: any) =>
      (schedule as any[]).some((c: any) => (c.primeTimeStart || c.prime_time_start))
    ),
    [primeTimeConfigs]
  );
  const selectedCourtTypeLabel = selectedCourtType
    ? `${selectedCourtType.charAt(0).toUpperCase()}${selectedCourtType.slice(1)}`
    : 'All courts';
  const displayedCourtsLabel = displayedCourtsCount !== null
    ? `${Math.min(displayedCourtsCount, filteredCourts.length)} shown`
    : `${filteredCourts.length} courts`;

  // Compute booking overlay blocks for the overlay layer
  const bookingOverlays = useMemo(() => {
    const overlays: Array<{
      courtIndex: number;
      courtId: string;
      startSlotIndex: number;
      slotCount: number;
      booking: any;
    }> = [];

    courts.forEach((court, courtIndex) => {
      const courtBookings = bookings[court.id];
      if (!courtBookings) return;

      Object.entries(courtBookings).forEach(([time, booking]: [string, any]) => {
        if (booking?.isFirstSlot) {
          let startIdx = allTimeSlots.indexOf(time);
          if (startIdx === -1) {
            // Booking starts at a non-30-min boundary (e.g. :15/:45) — compute from exact startTime
            const startMins = parseApiTimeToMinutes(booking.startTime);
            if (startMins === null || startMins < dayStartMinutes) return;
            startIdx = Math.floor((startMins - dayStartMinutes) / 30);
          }
          const slotCountFromData = Number(booking.slotCount);
          // slotCount stored in 15-min units; convert to 30-min units for overlay sizing
          const slotCount = Number.isFinite(slotCountFromData) && slotCountFromData > 0
            ? Math.ceil(slotCountFromData / 2)
            : Math.ceil(parseInt(booking.duration) / 30);
          if (!Number.isFinite(slotCount) || slotCount <= 0) return;
          overlays.push({
            courtIndex,
            courtId: court.id,
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

  const handleCalendarDateSelect = (date: Date | undefined) => {
    if (date) {
      setSelectedDate(date);
      setDatePickerOpen(false);
    }
  };

  const renderDatePickerPopover = (buttonClassName: string) => (
    <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" className={buttonClassName}>
          {formatDate(selectedDate)}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="center">
        <CalendarPicker
          mode="single"
          selected={selectedDate}
          onSelect={handleCalendarDateSelect}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );

  const handleBookingClick = (courtId: string, time: string) => {
    const booking = bookings[courtId as keyof typeof bookings]?.[time];
    if (booking?.type === 'reservation' && booking.fullDetails) {
      const details = booking.fullDetails;
      if (isBulletinActivityBooking(details) && details.bulletinPostId) {
        setBulletinActivityModal({
          isOpen: true,
          postId: String(details.bulletinPostId),
        });
        return;
      }
      setReservationDetailsModal({
        isOpen: true,
        reservation: details,
      });
    }
  };

  const handleEmptySlotClick = (courtId: string, time: string, dragCells?: Set<string>) => {
    if (strikeLockout?.isLockedOut) {
      toast.error('Your account is locked due to strikes. You cannot book courts until the lockout ends.');
      return;
    }

    const courtObj = courts.find(c => c.id === courtId);
    if (!courtObj) {
      console.error('Court not found:', courtId);
      return;
    }
    if (courtObj.id && isCourtSlotOutsideOperatingHours(courtObj.id, time)) {
      return;
    }
    if (courtObj.isWalkUp) {
      toast.info('This is a walk-up only court and cannot be booked online.');
      return;
    }

    // Format date as YYYY-MM-DD to avoid timezone issues
    const year = selectedDate.getFullYear();
    const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
    const day = String(selectedDate.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    // If we have selected cells from dragging, open booking wizard with them
    if (dragCells && dragCells.size > 0) {
      const hasOutside = Array.from(dragCells).some((cellId) => {
        const [cId, tSlot] = cellId.split('|');
        return !!(cId && isCourtSlotOutsideOperatingHours(cId, tSlot));
      });
      if (hasOutside) {
        toast.info("That selection includes times outside that court's operating hours.");
        return;
      }

      const selectedSlots = Array.from(dragCells).map(cellId => {
        const [slotCourtId, timeSlot] = cellId.split('|');
        const slotCourtObj = courts.find(c => c.id === slotCourtId);
        return {
          court: slotCourtObj?.name || '',
          courtId: slotCourtId,
          time: timeSlot
        };
      });

      setBookingWizard({
        isOpen: true,
        court: courtObj.name,
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
        court: courtObj.name,
        courtId: courtObj.id,
        time,
        date: dateStr,
        facility: currentFacility?.name || '',
        facilityId: currentFacility?.id || '',
        selectedSlots: undefined
      });
    }
  };
  handleEmptySlotClickRef.current = handleEmptySlotClick;

  // Drag handlers — pointer events + window pointermove so touch drags across cells
  // (touch never receives mouseenter while moving; elementFromPoint fixes that).
  const extendDragSelection = useCallback((courtId: string, time: string) => {
    setDragState(prev => {
      const base = prev.isDragging && prev.startCell ? prev : dragStateRef.current;
      if (!base.isDragging || !base.startCell) return prev;

      const startCourtIndex = courts.findIndex(c => c.id === base.startCell!.court);
      const currentCourtIndex = courts.findIndex(c => c.id === courtId);
      const startTimeIndex = timeSlots.indexOf(base.startCell!.time);
      const currentTimeIndex = timeSlots.indexOf(time);

      if (startCourtIndex < 0 || currentCourtIndex < 0 || startTimeIndex < 0 || currentTimeIndex < 0) {
        return prev;
      }

      const beginCourtIdx = Math.min(startCourtIndex, currentCourtIndex);
      const endCourtIdx = Math.max(startCourtIndex, currentCourtIndex);
      const beginTimeIdx = Math.min(startTimeIndex, currentTimeIndex);
      const endTimeIdx = Math.max(startTimeIndex, currentTimeIndex);

      const newSelectedCells = new Set<string>();
      for (let ci = beginCourtIdx; ci <= endCourtIdx; ci++) {
        const c = courts[ci];
        for (let ti = beginTimeIdx; ti <= endTimeIdx; ti++) {
          const slot = timeSlots[ti];
          const slotBooking = bookings[c.id as keyof typeof bookings]?.[slot];
          const outside = c.id ? isCourtSlotOutsideOperatingHours(c.id, slot) : false;
          if (!slotBooking && !outside) {
            newSelectedCells.add(`${c.id}|${slot}`);
          }
        }
      }

      const next = {
        ...base,
        endCell: { court: courtId, time },
        selectedCells: newSelectedCells
      };
      dragStateRef.current = next;
      return next;
    });
  }, [courts, timeSlots, bookings, isCourtSlotOutsideOperatingHours]);

  const setMobileVerticalSelection = useCallback(
    (courtId: string, startIndex: number, endIndex: number) => {
      const beginIdx = Math.min(startIndex, endIndex);
      const endIdx = Math.max(startIndex, endIndex);
      const startTime = allTimeSlots[beginIdx];
      const endTime = allTimeSlots[endIdx];
      if (!startTime || !endTime) return;

      const newSelectedCells = new Set<string>();
      for (let ti = beginIdx; ti <= endIdx; ti++) {
        const slot = allTimeSlots[ti];
        if (!slot) continue;
        const slotBooking = bookings[courtId as keyof typeof bookings]?.[slot];
        const outside = isCourtSlotOutsideOperatingHours(courtId, slot);
        if (!slotBooking && !outside) {
          newSelectedCells.add(`${courtId}|${slot}`);
        }
      }

      const next = {
        isDragging: true,
        startCell: { court: courtId, time: startTime },
        endCell: { court: courtId, time: endTime },
        selectedCells: newSelectedCells,
      };
      dragStateRef.current = next;
      setDragState(next);
    },
    [allTimeSlots, bookings, isCourtSlotOutsideOperatingHours]
  );

  const clearMobileDragArmTimer = useCallback(() => {
    if (mobileDragArmTimerRef.current) {
      clearTimeout(mobileDragArmTimerRef.current);
      mobileDragArmTimerRef.current = null;
    }
  }, []);

  const releaseMobileTouchLocks = useCallback(() => {
    setCalendarTouchLocked(false);
  }, []);

  const clearMobileDragState = useCallback(() => {
    const cleared = {
      isDragging: false,
      startCell: null as { court: string; time: string } | null,
      endCell: null as { court: string; time: string } | null,
      selectedCells: new Set<string>(),
    };
    dragStateRef.current = cleared;
    setDragState(cleared);
  }, []);

  const finalizeMobileTouch = useCallback(() => {
    mobileTouchCleanupRef.current?.();
    mobileTouchCleanupRef.current = null;
    clearMobileDragArmTimer();

    const gesture = mobileTouchGestureRef.current;
    mobileTouchGestureRef.current = null;
    releaseMobileTouchLocks();
    suppressPointerDownForTouchRef.current = false;

    if (!gesture || gesture.horizontalSwipe) {
      clearMobileDragState();
      return;
    }

    const currentDrag = dragStateRef.current;
    if (gesture.armed) {
      const cells = new Set<string>(currentDrag.selectedCells);
      if (cells.size > 0) {
        const firstSelected = Array.from(cells)[0] as string;
        const [court, time] = firstSelected.split('|');
        handleEmptySlotClickRef.current(court, time, cells);
        dragJustFinishedRef.current = true;
        setTimeout(() => {
          dragJustFinishedRef.current = false;
        }, 400);
      } else {
        handleEmptySlotClickRef.current(gesture.court, gesture.startTime);
        dragJustFinishedRef.current = true;
        setTimeout(() => {
          dragJustFinishedRef.current = false;
        }, 400);
      }
    }

    clearMobileDragState();
  }, [clearMobileDragArmTimer, clearMobileDragState, releaseMobileTouchLocks]);

  const handlePointerDragEnd = () => {
    pointerDragCleanupRef.current?.();
    pointerDragCleanupRef.current = null;

    const currentDrag = dragStateRef.current;
    if (currentDrag.isDragging && currentDrag.selectedCells.size > 0) {
      const cells = new Set<string>(currentDrag.selectedCells);
      const firstSelected = Array.from(cells)[0] as string;
      const [court, time] = firstSelected.split('|');
      handleEmptySlotClick(court, time, cells);
      dragJustFinishedRef.current = true;
      setTimeout(() => { dragJustFinishedRef.current = false; }, 400);
    }

    const cleared = {
      isDragging: false,
      startCell: null as { court: string; time: string } | null,
      endCell: null as { court: string; time: string } | null,
      selectedCells: new Set<string>()
    };
    dragStateRef.current = cleared;
    setDragState(cleared);
  };

  handlePointerDragEndRef.current = handlePointerDragEnd;

  /** Map viewport coordinates to court/time (reliable on iOS; elementFromPoint often fails during touch). */
  const resolveSlotFromPoint = useCallback(
    (clientX: number, clientY: number): { court: string; time: string } | null => {
      const grid = calendarGridRef.current;
      if (!grid || courts.length === 0 || allTimeSlots.length === 0) return null;

      const rect = grid.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      // On mobile the header row lives outside the grid table, so rows start at y=0.
      const headerH = isMobile ? 0 : headerRowRef.current?.offsetHeight ?? measuredHeaderHeight;

      if (y < headerH) return null;

      const courtAreaX = isMobile ? x : x - effectiveTimeColWidth;
      if (courtAreaX < 0) return null;

      const courtIndex = Math.floor(courtAreaX / effectiveCourtWidth);
      if (courtIndex < 0 || courtIndex >= courts.length) return null;

      const slotIndex = Math.floor((y - headerH) / effectiveSubSlotHeight);
      if (slotIndex < 0 || slotIndex >= allTimeSlots.length) return null;

      return { court: courts[courtIndex].id, time: allTimeSlots[slotIndex] };
    },
    [
      allTimeSlots,
      courts,
      effectiveCourtWidth,
      effectiveSubSlotHeight,
      effectiveTimeColWidth,
      measuredHeaderHeight,
      isMobile,
    ]
  );

  type SlotDragTransport = 'pointer' | 'touch-native';

  const startSlotDragTracking = useCallback(
    (
      courtId: string,
      time: string,
      startClientX: number,
      startClientY: number,
      transport: SlotDragTransport,
      opts: {
        pointerId?: number;
        pointerType?: string;
        captureTarget: HTMLElement | null;
        activeTouchId?: number;
      }
    ) => {
      const { pointerId = 0, pointerType = 'mouse', captureTarget, activeTouchId } = opts;

      pointerDragCleanupRef.current?.();
      pointerDragCleanupRef.current = null;
      const armDrag = (c: string, t: string) => {
        const next = {
          isDragging: true,
          startCell: { court: c, time: t },
          endCell: { court: c, time: t },
          selectedCells: new Set([`${c}|${t}`]),
        };
        dragStateRef.current = next;
        setDragState(next);
      };

      const resolvedStart = resolveSlotFromPoint(startClientX, startClientY);
      armDrag(resolvedStart?.court ?? courtId, resolvedStart?.time ?? time);

      if (pointerType === 'mouse' && captureTarget?.setPointerCapture) {
        try {
          captureTarget.setPointerCapture(pointerId);
        } catch {
          // ignore
        }
      }

      const updateFromPoint = (clientX: number, clientY: number) => {
        const resolved = resolveSlotFromPoint(clientX, clientY);
        if (resolved) extendDragSelection(resolved.court, resolved.time);
      };

      if (transport === 'touch-native') {
        const touchId = activeTouchId as number;

        const onTouchMove = (ev: TouchEvent) => {
          const touch = Array.from(ev.touches).find((finger) => finger.identifier === touchId);
          if (!touch) return;
          ev.preventDefault();
          updateFromPoint(touch.clientX, touch.clientY);
        };

        const onTouchEnd = (ev: TouchEvent) => {
          const endedHere = Array.from(ev.changedTouches).some(
            (finger) => finger.identifier === touchId
          );
          if (!endedHere) return;
          window.removeEventListener('touchmove', onTouchMove, true);
          window.removeEventListener('touchend', onTouchEnd, true);
          window.removeEventListener('touchcancel', onTouchEnd, true);
          pointerDragCleanupRef.current = null;

          const coords = getEventCoords(ev);
          if (coords) updateFromPoint(coords.clientX, coords.clientY);

          // touchstart preventDefault blocks the synthetic click — finish booking here (tap or drag).
          ev.preventDefault();
          handlePointerDragEndRef.current();
          suppressPointerDownForTouchRef.current = false;
        };

        window.addEventListener('touchmove', onTouchMove, { capture: true, passive: false });
        window.addEventListener('touchend', onTouchEnd, true);
        window.addEventListener('touchcancel', onTouchEnd, true);
        pointerDragCleanupRef.current = () => {
          window.removeEventListener('touchmove', onTouchMove, true);
          window.removeEventListener('touchend', onTouchEnd, true);
          window.removeEventListener('touchcancel', onTouchEnd, true);
        };
        return;
      }

      const onMove = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        if (pointerType === 'touch') ev.preventDefault();
        const coords = getEventCoords(ev);
        if (!coords) return;
        updateFromPoint(coords.clientX, coords.clientY);
      };

      const onUp = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        window.removeEventListener('pointermove', onMove, true);
        window.removeEventListener('pointerup', onUp, true);
        window.removeEventListener('pointercancel', onUp, true);
        pointerDragCleanupRef.current = null;
        const coords = getEventCoords(ev);
        if (coords) updateFromPoint(coords.clientX, coords.clientY);
        handlePointerDragEndRef.current();
      };

      window.addEventListener('pointermove', onMove, { capture: true, passive: false });
      window.addEventListener('pointerup', onUp, true);
      window.addEventListener('pointercancel', onUp, true);
      pointerDragCleanupRef.current = () => {
        window.removeEventListener('pointermove', onMove, true);
        window.removeEventListener('pointerup', onUp, true);
        window.removeEventListener('pointercancel', onUp, true);
      };
    },
    [extendDragSelection, resolveSlotFromPoint]
  );

  const handlePointerDown = (courtId: string, time: string, event: React.PointerEvent) => {
    if (strikeLockout?.isLockedOut) {
      return;
    }

    if (isMobile && event.pointerType === 'touch') {
      return;
    }

    if (event.pointerType === 'touch' && suppressPointerDownForTouchRef.current) {
      suppressPointerDownForTouchRef.current = false;
      return;
    }

    const booking = bookings[courtId as keyof typeof bookings]?.[time];
    if (booking) return;

    if (isCourtSlotOutsideOperatingHours(courtId, time)) return;

    if (event.pointerType === 'mouse' || event.pointerType === 'touch') {
      event.preventDefault();
    }

    const captureTarget = event.currentTarget as HTMLElement | null;
    startSlotDragTracking(courtId, time, event.clientX, event.clientY, 'pointer', {
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      captureTarget,
    });
  };

  useEffect(() => {
    const root = calendarScrollRef.current;
    if (!root || courts.length === 0) return;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const slot = (e.target as HTMLElement | null)?.closest?.('[data-slot-court][data-slot-time]');
      if (!slot || !root.contains(slot)) return;

      const courtId = slot.getAttribute('data-slot-court');
      const time = slot.getAttribute('data-slot-time');
      if (!courtId || !time) return;

      const booking = bookings[courtId as keyof typeof bookings]?.[time];
      if (booking) return;

      const courtObj = courts.find((c) => c.id === courtId);
      if (courtObj?.isWalkUp) return;
      if (isCourtSlotOutsideOperatingHours(courtId, time)) return;
      if (isPastTime(time)) return;
      const slotBooking = bookings[courtId as keyof typeof bookings]?.[time];
      const blocked = slotBooking?.type === 'blocked';
      if (blocked) return;

      const touch = e.touches[0];
      if (!touch) return;

      suppressPointerDownForTouchRef.current = true;

      if (!isMobile) {
        e.preventDefault();
        startSlotDragTracking(courtId, time, touch.clientX, touch.clientY, 'touch-native', {
          captureTarget: slot as HTMLElement,
          activeTouchId: touch.identifier,
        });
        return;
      }

      // Mobile web: match native app — long-press to arm, vertical drag on one court, scroll otherwise.
      mobileTouchCleanupRef.current?.();
      mobileTouchCleanupRef.current = null;
      clearMobileDragArmTimer();
      clearMobileDragState();

      const startSlotIndex = allTimeSlots.indexOf(time);
      if (startSlotIndex < 0) return;

      mobileTouchGestureRef.current = {
        startClientX: touch.clientX,
        startClientY: touch.clientY,
        court: courtId,
        startTime: time,
        startSlotIndex,
        armed: false,
        moved: false,
        horizontalSwipe: false,
      };

      mobileDragArmTimerRef.current = setTimeout(() => {
        const gesture = mobileTouchGestureRef.current;
        if (!gesture || gesture.court !== courtId) return;
        gesture.armed = true;
        setMobileVerticalSelection(courtId, gesture.startSlotIndex, gesture.startSlotIndex);
        attachDragTouchMove();
      }, MOBILE_DRAG_ARM_DELAY_MS);

      const touchId = touch.identifier;
      let dragTouchMoveAttached = false;

      const detachDragTouchMove = () => {
        if (!dragTouchMoveAttached) return;
        dragTouchMoveAttached = false;
        window.removeEventListener('touchmove', onTouchMoveDrag, true);
      };

      /** Passive while waiting to arm — does not block native horizontal/vertical scroll. */
      const onTouchMovePassive = (ev: TouchEvent) => {
        const gesture = mobileTouchGestureRef.current;
        if (!gesture || gesture.armed) return;
        const finger = Array.from(ev.touches).find((t) => t.identifier === touchId);
        if (!finger) return;

        const deltaX = finger.clientX - gesture.startClientX;
        const deltaY = finger.clientY - gesture.startClientY;
        const absX = Math.abs(deltaX);
        const absY = Math.abs(deltaY);

        if (absX > MOBILE_MOVEMENT_THRESHOLD_PX || absY > MOBILE_MOVEMENT_THRESHOLD_PX) {
          clearMobileDragArmTimer();
          if (absX > MOBILE_MOVEMENT_THRESHOLD_PX && absX > absY + 2) {
            gesture.horizontalSwipe = true;
            releaseMobileTouchLocks();
            mobileTouchCleanupRef.current?.();
            mobileTouchCleanupRef.current = null;
            mobileTouchGestureRef.current = null;
          }
        }
      };

      /** After long-press arms — same vertical drag behavior as before. */
      const onTouchMoveDrag = (ev: TouchEvent) => {
        const gesture = mobileTouchGestureRef.current;
        if (!gesture || !gesture.armed) return;
        const finger = Array.from(ev.touches).find((t) => t.identifier === touchId);
        if (!finger) return;

        const deltaX = finger.clientX - gesture.startClientX;
        const deltaY = finger.clientY - gesture.startClientY;
        const absX = Math.abs(deltaX);
        const absY = Math.abs(deltaY);

        if (absX > 10 && absX > absY + 2) {
          gesture.horizontalSwipe = true;
          clearMobileDragState();
          releaseMobileTouchLocks();
          return;
        }

        if (absY > MOBILE_MOVEMENT_THRESHOLD_PX) {
          ev.preventDefault();
          if (!gesture.moved) {
            gesture.moved = true;
            setCalendarTouchLocked(true);
          }
          const slotOffset = Math.round(deltaY / effectiveSubSlotHeight);
          const endIndex = Math.max(
            0,
            Math.min(allTimeSlots.length - 1, gesture.startSlotIndex + slotOffset)
          );
          setMobileVerticalSelection(gesture.court, gesture.startSlotIndex, endIndex);
        }
      };

      const attachDragTouchMove = () => {
        if (dragTouchMoveAttached) return;
        dragTouchMoveAttached = true;
        window.removeEventListener('touchmove', onTouchMovePassive, true);
        window.addEventListener('touchmove', onTouchMoveDrag, { capture: true, passive: false });
      };

      const onTouchEnd = (ev: TouchEvent) => {
        const endedHere = Array.from(ev.changedTouches).some((t) => t.identifier === touchId);
        if (!endedHere) return;
        const gesture = mobileTouchGestureRef.current;
        if (gesture?.armed) {
          ev.preventDefault();
        }
        finalizeMobileTouch();
      };

      window.addEventListener('touchmove', onTouchMovePassive, { capture: true, passive: true });
      window.addEventListener('touchend', onTouchEnd, true);
      window.addEventListener('touchcancel', onTouchEnd, true);
      mobileTouchCleanupRef.current = () => {
        window.removeEventListener('touchmove', onTouchMovePassive, true);
        detachDragTouchMove();
        window.removeEventListener('touchend', onTouchEnd, true);
        window.removeEventListener('touchcancel', onTouchEnd, true);
      };
    };

    root.addEventListener('touchstart', onTouchStart, { capture: true, passive: false });
    return () => {
      root.removeEventListener('touchstart', onTouchStart, true);
      mobileTouchCleanupRef.current?.();
      mobileTouchCleanupRef.current = null;
      clearMobileDragArmTimer();
    };
  }, [
    allTimeSlots,
    bookings,
    clearMobileDragArmTimer,
    clearMobileDragState,
    courts,
    effectiveSubSlotHeight,
    finalizeMobileTouch,
    isCourtSlotOutsideOperatingHours,
    isMobile,
    isPastTime,
    releaseMobileTouchLocks,
    setMobileVerticalSelection,
    startSlotDragTracking,
  ]);

  useEffect(
    () => () => {
      pointerDragCleanupRef.current?.();
      mobileTouchCleanupRef.current?.();
      clearMobileDragArmTimer();
    },
    [clearMobileDragArmTimer]
  );

  // Quick reserve handlers
  const handleQuickReserve = async (reservation: {
    facility: string;
    court: string;
    date: string;
    time: string;
    duration: string;
    playerName: string;
  }) => {
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



  const handleCourtHorizontalScroll = useCallback(() => {
    if (!isMobile || scrollSyncLockRef.current) return;
    const bodyEl = courtHorizontalScrollRef.current;
    const headerEl = courtHeaderScrollRef.current;
    if (!bodyEl || !headerEl) return;

    scrollSyncLockRef.current = true;
    headerEl.scrollLeft = bodyEl.scrollLeft;
    scrollSyncLockRef.current = false;
  }, [isMobile]);

  const handleCourtHeaderScroll = useCallback(() => {
    if (!isMobile || scrollSyncLockRef.current) return;
    const bodyEl = courtHorizontalScrollRef.current;
    const headerEl = courtHeaderScrollRef.current;
    if (!bodyEl || !headerEl) return;

    scrollSyncLockRef.current = true;
    bodyEl.scrollLeft = headerEl.scrollLeft;
    scrollSyncLockRef.current = false;
  }, [isMobile]);

  // Function to scroll to current time
  const scrollToCurrentTime = useCallback((opts?: { reliable?: boolean }) => {
    if (!calendarScrollRef.current || currentTimeLinePosition === null) return;

    const container = calendarScrollRef.current;
    const containerHeight = container.clientHeight;
    const headerHeight = isMobile ? 0 : measuredHeaderHeight;

    // Scroll so the "now" line sits in the upper part of the viewport so more upcoming
    // slots are visible (past grey + red line styling unchanged — only scroll bias).
    const actualPosition = currentTimeLinePosition + headerHeight;
    const nowLineFromTop = Math.max(56, containerHeight * 0.12);
    const scrollPosition = Math.max(0, actualPosition - nowLineFromTop);
    const maxScroll = Math.max(0, container.scrollHeight - containerHeight);
    const clampedPosition = Math.min(scrollPosition, maxScroll);

    const applyScroll = () => {
      if (!calendarScrollRef.current) return;
      const useSmooth = !opts?.reliable && !isMobile;
      calendarScrollRef.current.scrollTo({
        top: clampedPosition,
        behavior: useSmooth ? 'smooth' : 'auto',
      });
      // Direct assignment helps iOS when scrollTo runs before layout is final
      calendarScrollRef.current.scrollTop = clampedPosition;
    };

    if (isMobile || opts?.reliable) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          applyScroll();
          setTimeout(applyScroll, 50);
          setTimeout(applyScroll, 160);
          setTimeout(applyScroll, 320);
        });
      });
    } else {
      applyScroll();
    }
  }, [currentTimeLinePosition, measuredHeaderHeight, isMobile]);

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
        scrollToCurrentTime({ reliable: isMobile });
        if (isMobile) {
          setTimeout(() => scrollToCurrentTime({ reliable: true }), 140);
        }
      } else {
        calendarScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }, isMobile ? 300 : 150);
    return () => clearTimeout(timer);
  }, [selectedDate, isToday, currentTimeLinePosition, scrollToCurrentTime, scrollTrigger, isMobile]);

  const courtGridWidth = courts.length * effectiveCourtWidth;
  const calendarGridHeight = measuredHeaderHeight + visibleTimeSlots.length * effectiveSubSlotHeight;

  const renderTimeLabelRow = (visibleIdx: number, time30: string, asTableCell: boolean) => {
    const isHourLabel = time30.endsWith(':00 AM') || time30.endsWith(':00 PM');
    const rowStartMinute = parseInt(time30.split(' ')[0].split(':')[1], 10);
    const rowEndsOnHour = Number.isFinite(rowStartMinute) && ((rowStartMinute + 30) % 60 === 0);
    const borderBottom = rowEndsOnHour ? '1px solid #d1d5db' : '1px dashed #e5e7eb';
    const content = (
      <div
        className="relative z-[2] flex h-full items-center justify-center px-2"
      >
        <span className={`text-xs whitespace-nowrap ${isHourLabel ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>
          {time30}
        </span>
      </div>
    );

    if (asTableCell) {
      return (
        <td
          className="sticky left-0 z-10 bg-green-50 border-r border-green-100 p-0"
          style={{
            width: effectiveTimeColWidth,
            minWidth: effectiveTimeColWidth,
            height: effectiveSubSlotHeight,
            verticalAlign: 'top',
            position: 'relative',
            borderBottom,
          }}
        >
          {content}
        </td>
      );
    }

    return (
      <div
        key={visibleIdx}
        className="relative bg-green-50 border-r border-green-100 shrink-0"
        style={{
          width: effectiveTimeColWidth,
          minWidth: effectiveTimeColWidth,
          height: effectiveSubSlotHeight,
          borderBottom,
        }}
      >
        {content}
      </div>
    );
  };

  const renderCourtCellsForRow = (visibleIdx: number) => {
    const time30 = visibleTimeSlots[visibleIdx];
    const rowStartMinute = parseInt(time30.split(' ')[0].split(':')[1], 10);
    const rowEndsOnHour = Number.isFinite(rowStartMinute) && ((rowStartMinute + 30) % 60 === 0);
    const topTime = allTimeSlots[visibleIdx];

    return courts.map((court, courtIndex) => {
      const topBooking = bookings[court.id as keyof typeof bookings]?.[topTime];
      const topBlocked = topBooking?.type === 'blocked';
      const topPast = isPastTime(topTime);
      const topSelected = dragState.selectedCells.has(`${court.id}|${topTime}`);
      const topPrime = isPrimeTimeSlot(court.id, topTime);
      const isWalkUpCourt = court.isWalkUp === true;
      const topOutsideCourt =
        !isWalkUpCourt &&
        !topBooking &&
        !!(court.id && isCourtSlotOutsideOperatingHours(court.id, topTime));

      return (
        <td
          key={courtIndex}
          className={`relative border-r border-gray-200 last:border-r-0 p-0${isMobile && !calendarTouchLocked ? ' calendar-slot-pan-x' : ''}`}
          style={{
            width: effectiveCourtWidth,
            minWidth: effectiveCourtWidth,
            height: effectiveSubSlotHeight,
            verticalAlign: 'top',
            borderBottom: rowEndsOnHour ? '1px solid #d1d5db' : '1px dashed #e5e7eb',
          }}
        >
          <div
            data-slot-court={court.id}
            data-slot-time={topTime}
            className={`absolute top-0 left-0 right-0 bottom-0 select-none ${calendarTouchLocked || !isMobile ? 'touch-none' : 'calendar-slot-pan-x'}
              ${isWalkUpCourt ? 'bg-amber-100 cursor-not-allowed' : ''}
              ${!isWalkUpCourt && topOutsideCourt ? 'bg-neutral-900/75 cursor-not-allowed' : ''}
              ${!isWalkUpCourt && !topOutsideCourt && topBlocked ? 'bg-gray-200 cursor-not-allowed' : ''}
              ${!isWalkUpCourt && !topOutsideCourt && topPast && !topBooking ? 'bg-gray-100 cursor-not-allowed' : ''}
              ${!isWalkUpCourt && !topOutsideCourt && !topPast && !topBooking && !topBlocked ? `cursor-pointer ${topPrime ? 'bg-purple-50 hover:bg-purple-100' : 'hover:bg-green-50'}` : ''}
              ${topBooking && !topBlocked ? 'cursor-pointer' : ''}
              ${topSelected ? 'bg-green-100 ring-1 ring-inset ring-green-400' : ''}
            `}
            onClick={() => {
              if (dragJustFinishedRef.current) return;
              if (isWalkUpCourt) return toast.info('This is a walk-up only court and cannot be booked online.');
              if (court.id && isCourtSlotOutsideOperatingHours(court.id, topTime)) return;
              if (topBlocked || (topPast && !topBooking)) return;
              if (topBooking) handleBookingClick(court.id, topTime);
              else handleEmptySlotClick(court.id, topTime);
            }}
            onPointerDown={(e) =>
              !isWalkUpCourt &&
              !topBooking &&
              !topPast &&
              !topBlocked &&
              !(court.id && isCourtSlotOutsideOperatingHours(court.id, topTime)) &&
              handlePointerDown(court.id, topTime, e)
            }
            onPointerEnter={() =>
              !isWalkUpCourt &&
              !topPast &&
              !topBlocked &&
              !(court.id && isCourtSlotOutsideOperatingHours(court.id, topTime)) &&
              extendDragSelection(court.id, topTime)
            }
          />
        </td>
      );
    });
  };

  const renderCourtHeaderCells = () =>
    courts.map((court, index) => (
      <th
        key={index}
        className="sticky top-0 z-30 bg-gradient-to-b from-green-600 to-green-700 text-white border-r border-b-2 border-green-800 last:border-r-0 px-2 py-1 text-left font-normal"
        style={{ width: effectiveCourtWidth, minWidth: effectiveCourtWidth, height: effectiveHeaderHeight, verticalAlign: 'middle' }}
      >
        <div className="truncate font-semibold text-xs leading-tight text-white">
          {court.name}
        </div>
        <div className="truncate text-[10px] leading-none text-green-200 capitalize">
          {formatCourtCalendarSubtitle({
            typeLabel: (court as { typeLabel?: string }).typeLabel ?? court.type,
            surfaceType: (court as { surfaceType?: string }).surfaceType,
            isWalkUp: court.isWalkUp,
          })}
        </div>
      </th>
    ));

  const renderMobileCourtHeaderCells = () =>
    courts.map((court, index) => (
      <div
        key={index}
        className="shrink-0 bg-gradient-to-b from-green-600 to-green-700 text-white border-r border-b-2 border-green-800 last:border-r-0 px-2 py-1 text-left"
        style={{ width: effectiveCourtWidth, minWidth: effectiveCourtWidth, height: effectiveHeaderHeight }}
      >
        <div className="truncate font-semibold text-xs leading-tight text-white">
          {court.name}
        </div>
        <div className="truncate text-[10px] leading-none text-green-200 capitalize">
          {formatCourtCalendarSubtitle({
            typeLabel: (court as { typeLabel?: string }).typeLabel ?? court.type,
            surfaceType: (court as { surfaceType?: string }).surfaceType,
            isWalkUp: court.isWalkUp,
          })}
        </div>
      </div>
    ));

  const renderBookingOverlayLayer = (timeColOffset: number) => (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: timeColOffset + courtGridWidth,
        height: calendarGridHeight - (isMobile ? measuredHeaderHeight : 0),
        zIndex: 5,
        pointerEvents: 'none',
        overflow: 'visible',
      }}
    >
      {bookingOverlays.map((overlay, idx) => {
        const { booking } = overlay;
        const isBlocked = booking.type === 'blocked';
        const parseMinutes = (timeValue?: string): number | null => {
          if (!timeValue || typeof timeValue !== 'string') return null;
          const [h, m] = timeValue.split(':').map(Number);
          if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
          return h * 60 + m;
        };
        const bookingStartMinutes = parseMinutes(booking.startTime);
        const bookingEndMinutes = parseMinutes(booking.endTime);
        const dayStartMinutesForOverlay = dayStartMinutes;
        const hasExactRange = bookingStartMinutes !== null
          && bookingEndMinutes !== null
          && bookingEndMinutes > bookingStartMinutes;
        const top = hasExactRange
          ? (isMobile ? 0 : measuredHeaderHeight) + ((bookingStartMinutes - dayStartMinutesForOverlay) / 30) * effectiveSubSlotHeight + (isBlocked ? 0 : 2)
          : (isMobile ? 0 : measuredHeaderHeight) + overlay.startSlotIndex * effectiveSubSlotHeight + (isBlocked ? 0 : 2);
        const left = timeColOffset + overlay.courtIndex * effectiveCourtWidth + (isBlocked ? 0 : 4);
        const width = effectiveCourtWidth - (isBlocked ? 0 : 8);
        const height = hasExactRange
          ? (((bookingEndMinutes - bookingStartMinutes) / 30) * effectiveSubSlotHeight) - (isBlocked ? 0 : 4)
          : overlay.slotCount * effectiveSubSlotHeight - (isBlocked ? 0 : 4);
        const colorClass = isBlocked
          ? 'bg-gray-200 text-gray-500 border-0'
          : booking.bookingType
            ? getBookingTypeBadgeColor(booking.bookingType)
            : 'bg-blue-50 text-blue-900 border-blue-200';

        const tooltipText = isBlocked
          ? `Blocked${booking.player ? ` — ${booking.player}` : ''}`
          : [booking.player, booking.duration, booking.startTime && booking.endTime ? `${booking.startTime.slice(0,5)}–${booking.endTime.slice(0,5)}` : ''].filter(Boolean).join(' · ');

        return (
          <div
            key={`booking-${booking.bookingId || idx}`}
            title={tooltipText}
            className={`absolute ${isBlocked ? '' : 'rounded-lg border cursor-pointer'} ${isBlocked ? 'opacity-70' : ''} transition-shadow pointer-events-auto overflow-hidden ${isMobile && !calendarTouchLocked ? 'calendar-booking-pan-x' : ''} ${colorClass}`}
            style={{
              top,
              left,
              width,
              height,
              transform: 'none',
              filter: 'none',
              boxShadow: isBlocked
                ? 'none'
                : '0 10px 20px -10px rgba(15, 23, 42, 0.28)',
            }}
            onClick={() => !isBlocked && handleBookingClick(overlay.courtId, allTimeSlots[overlay.startSlotIndex])}
          >
            <div className={`${isBlocked ? 'px-1.5 py-1' : 'px-2 py-1'} h-full flex flex-col overflow-hidden`}>
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
              {booking.notes && height > effectiveSubSlotHeight * 3 && (
                <div className="text-[9px] mt-1 truncate italic opacity-70">
                  {booking.notes.length > 30 ? `${booking.notes.substring(0, 30)}...` : booking.notes}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );

  const renderCurrentTimeIndicator = (timeColOffset: number, showLabelInTimeColumn: boolean) => {
    if (currentTimeLinePosition === null) return null;

    const lineTop = currentTimeLinePosition + (showLabelInTimeColumn ? 0 : measuredHeaderHeight);

    if (showLabelInTimeColumn) {
      return (
        <div
          className="pointer-events-none absolute left-0 right-0"
          style={{
            top: `${lineTop}px`,
            height: '2px',
            zIndex: 20,
          }}
        >
          <div className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 z-[25]">
            <div className="bg-white border border-red-400 text-gray-800 text-[10px] font-bold px-1.5 py-0.5 rounded shadow-md whitespace-nowrap">
              {formatCurrentTime(facilityTimezone)}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div
        className="pointer-events-none"
        style={{
          position: 'absolute',
          top: `${lineTop}px`,
          left: 0,
          width: timeColOffset + courtGridWidth,
          zIndex: 20,
          height: '2px',
        }}
      >
        <div
          className="sticky left-0 inline-flex items-center"
          style={{ zIndex: 25 }}
        >
          <div className="bg-white border border-red-400 text-gray-800 text-[10px] font-bold px-1.5 py-0.5 rounded shadow-md">
            {formatCurrentTime(facilityTimezone)}
          </div>
        </div>
        <div
          className="absolute bg-red-600"
          style={{
            left: `${timeColOffset}px`,
            right: 0,
            top: '50%',
            height: '2px',
            transform: 'translateY(-50%)',
            boxShadow: '0 0 6px rgba(220, 38, 38, 0.6)',
          }}
        />
        <div
          className="absolute w-3 h-3 bg-red-600 rounded-full border-2 border-white shadow-md"
          style={{
            left: `${timeColOffset - 6}px`,
            top: '50%',
            transform: 'translateY(-50%)',
          }}
        />
      </div>
    );
  };

  const renderMobileCurrentTimeLine = () => {
    if (currentTimeLinePosition === null) return null;
    return (
      <div
        className="pointer-events-none absolute left-0"
        style={{
          top: `${currentTimeLinePosition}px`,
          width: courtGridWidth,
          height: '2px',
          zIndex: 20,
        }}
      >
        <div className="absolute bg-red-600 left-0 right-0 top-1/2 -translate-y-1/2 h-0.5 shadow-[0_0_6px_rgba(220,38,38,0.6)]" />
        <div className="absolute w-3 h-3 bg-red-600 rounded-full border-2 border-white shadow-md left-0 top-1/2 -translate-y-1/2 -translate-x-1/2" />
      </div>
    );
  };

  return (
    <>
      {/* Main Content */}
      <div className="flex flex-col overflow-hidden h-[calc(100dvh-3.5rem-env(safe-area-inset-top,0px))] md:h-screen">
        {/* Controls - Sticky Header */}
        {authLoading || loadingFacilities ? (
          <div className="flex flex-1 items-center justify-center px-3 md:px-6 py-12">
            <div className="flex flex-col items-center gap-3 text-gray-600">
              <Loader2 className="h-10 w-10 animate-spin text-green-600" aria-hidden />
              <p className="text-sm font-medium">Loading calendar…</p>
            </div>
          </div>
        ) : memberFacilities.length === 0 ? (
          // Show "no membership" message when user has no facilities (auth resolved and fetch complete)
          <div className="px-3 md:px-6 py-6">
          <Card>
            <CardContent className="p-4 md:p-8">
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
        {/* Facility Status Banner */}
        {currentFacility?.status && currentFacility.status !== 'active' && (
          <div className={`flex-shrink-0 px-4 py-3 flex items-center gap-3 ${
            currentFacility.status === 'suspended' ? 'bg-amber-50 border-b border-amber-200 text-amber-800' :
            currentFacility.status === 'closed' ? 'bg-red-50 border-b border-red-200 text-red-800' :
            'bg-blue-50 border-b border-blue-200 text-blue-800'
          }`}>
            <AlertTriangle className="h-5 w-5 flex-shrink-0" />
            <span className="text-sm font-medium">
              {currentFacility.status === 'suspended' && `${currentFacility.name} is temporarily suspended. Reservations are not available at this time.`}
              {currentFacility.status === 'closed' && `${currentFacility.name} is permanently closed. Reservations are no longer available.`}
              {currentFacility.status === 'pending' && `${currentFacility.name} is still being set up. Reservations are not yet available.`}
            </span>
          </div>
        )}

        <StrikeLockoutAlerts status={strikeLockout} />

        {/* Controls Header */}
        <div className="flex-shrink-0 z-40 bg-gradient-to-r from-green-50 to-emerald-50 border-b border-green-200">
          <div className="px-3 md:px-4 py-2">
            <div className="md:hidden">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-medium truncate">{currentFacility?.name}</h3>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-600">
                    <span>{selectedCourtTypeLabel}</span>
                    <span className="text-gray-400">•</span>
                    <span>{displayedCourtsLabel}</span>
                    {hasPeakHoursLegend && (
                      <>
                        <span className="text-gray-400">•</span>
                        <span className="inline-flex items-center gap-1">
                          <span className="h-2.5 w-2.5 rounded-sm bg-purple-100 border border-purple-300" />
                          Peak Hours
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <NotificationBell />
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => setMobileControlsExpanded(prev => !prev)}
                    aria-expanded={mobileControlsExpanded}
                    aria-controls="mobile-calendar-controls"
                  >
                    Controls
                    <ChevronDown className={`h-4 w-4 transition-transform ${mobileControlsExpanded ? 'rotate-180' : ''}`} />
                  </Button>
                </div>
              </div>

              {calendarViewMode === 'court' && (
              <div className="mt-2 flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => navigateDate('prev')}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                {isMobile ? (
                  renderDatePickerPopover('flex-1 min-w-0 justify-center text-center font-medium hover:bg-gray-100 text-sm')
                ) : (
                  <Button variant="ghost" className="flex-1 min-w-0 justify-center text-center font-medium hover:bg-gray-100 text-sm">
                    {formatDate(selectedDate)}
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => navigateDate('next')}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              )}

              {mobileControlsExpanded && (
                <div
                  id="mobile-calendar-controls"
                  className="mt-3 rounded-lg border border-green-200 bg-white/80 p-3 space-y-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-9 w-9 p-0 rounded-full">
                          <Info className="h-4 w-4 text-gray-500" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[calc(100vw-2rem)] max-w-80">
                        <p className="text-sm text-gray-700">
                          Tap a time slot to book, or long press and drag up or down to select a range. Swipe the calendar to scroll.
                        </p>
                      </PopoverContent>
                    </Popover>

                    <Button
                      onClick={() => setShowQuickReserve(true)}
                      className="flex-1 font-medium shadow-md"
                      size="sm"
                    >
                      <Calendar className="h-4 w-4" />
                      Quick Reserve
                    </Button>
                  </div>

                  {/* Mobile view mode switcher */}
                  {weekMonthViewEnabled && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">View</p>
                      <div className="flex gap-1.5">
                        <Button
                          variant={calendarViewMode === 'court' ? 'default' : 'outline'}
                          size="sm"
                          className="flex-1 text-xs"
                          onClick={() => setCalendarViewMode('court')}
                        >
                          Courts
                        </Button>
                        <Button
                          variant={calendarViewMode === 'week' ? 'default' : 'outline'}
                          size="sm"
                          className="flex-1 text-xs"
                          onClick={() => setCalendarViewMode('week')}
                        >
                          Week
                        </Button>
                        <Button
                          variant={calendarViewMode === 'month' ? 'default' : 'outline'}
                          size="sm"
                          className="flex-1 text-xs"
                          onClick={() => setCalendarViewMode('month')}
                        >
                          Month
                        </Button>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Court Type</p>
                    <div className="flex gap-2">
                      <Button
                        variant={selectedCourtType === 'tennis' ? 'default' : 'outline'}
                        size="sm"
                        className="flex-1"
                        onClick={() => { setSelectedCourtType(selectedCourtType === 'tennis' ? null : 'tennis'); setUserSetZoom(false); }}
                      >
                        Tennis
                      </Button>
                      <Button
                        variant={selectedCourtType === 'pickleball' ? 'default' : 'outline'}
                        size="sm"
                        className="flex-1"
                        onClick={() => { setSelectedCourtType(selectedCourtType === 'pickleball' ? null : 'pickleball'); setUserSetZoom(false); }}
                      >
                        Pickleball
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Visible Courts</p>
                    <Select
                      value={displayedCourtsCount?.toString() || 'all'}
                      onValueChange={(v) => { setDisplayedCourtsCount(v === 'all' ? null : parseInt(v)); setUserSetZoom(false); }}
                    >
                      <SelectTrigger className="w-full">
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
                </div>
              )}
            </div>

            <div className="hidden md:block">
              {/* Top Row: Facility Name, Court Type Filter, Courts, Zoom, Bell */}
              <div className="flex flex-wrap items-center justify-between gap-2 md:gap-3">
                <div className="flex flex-wrap items-center gap-2 md:gap-3">
                  <h3 className="text-base md:text-lg font-medium w-full md:w-auto">{currentFacility?.name}</h3>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-600 hidden md:inline">Court Type:</span>
                    <div className="flex gap-1">
                      <Button
                        variant={selectedCourtType === 'tennis' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => { setSelectedCourtType(selectedCourtType === 'tennis' ? null : 'tennis'); setUserSetZoom(false); }}
                      >
                        Tennis
                      </Button>
                      <Button
                        variant={selectedCourtType === 'pickleball' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => { setSelectedCourtType(selectedCourtType === 'pickleball' ? null : 'pickleball'); setUserSetZoom(false); }}
                      >
                        Pickleball
                      </Button>
                    </div>
                  </div>

                  {/* Court Display Count */}
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-600 hidden md:inline">Courts:</span>
                    <Select
                      value={displayedCourtsCount?.toString() || 'all'}
                      onValueChange={(v) => { setDisplayedCourtsCount(v === 'all' ? null : parseInt(v)); setUserSetZoom(false); }}
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

                  {/* Zoom Controls - hidden on mobile */}
                  <div className="hidden md:flex items-center gap-1.5">
                    <span className="text-sm font-medium text-gray-600">Zoom:</span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 w-9 md:h-7 md:w-7 p-0"
                      onClick={() => { setUserSetZoom(true); setZoomLevel(prev => Math.max(50, prev - 10)); }}
                      disabled={zoomLevel <= 50}
                    >
                      <ZoomOut className="h-3.5 w-3.5" />
                    </Button>
                    <span className="text-xs font-medium text-gray-700 min-w-[36px] text-center">{zoomLevel}%</span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 w-9 md:h-7 md:w-7 p-0"
                      onClick={() => { setUserSetZoom(true); setZoomLevel(prev => Math.min(200, prev + 10)); }}
                      disabled={zoomLevel >= 200}
                    >
                      <ZoomIn className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  {/* Peak-Hours Legend */}
                  {hasPeakHoursLegend && (
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded-sm bg-purple-100 border border-purple-300" />
                      <span className="text-xs text-gray-500">Peak Hours</span>
                    </div>
                  )}
                </div>

                {/* Right side: Notification Bell — desktop only */}
                <div className="hidden md:block">
                  <NotificationBell />
                </div>
              </div>

              {/* Bottom Row: Facility info, Quick Reserve, Date Navigation */}
              <div className="flex flex-wrap items-center justify-between gap-3 mt-2">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    {/* Info Popover */}
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-9 w-9 md:h-6 md:w-6 p-0 rounded-full">
                          <Info className="h-4 w-4 text-gray-500" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[calc(100vw-2rem)] max-w-80">
                        <p className="text-sm text-gray-700">
                          Tap a time slot to book, or long press and drag up or down to select a range. Swipe the calendar to scroll.
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

                  {/* View mode switcher — only when feature is enabled */}
                  {weekMonthViewEnabled && (
                    <div className="flex items-center gap-1 rounded-md border border-gray-200 bg-white p-0.5">
                      <Button
                        variant={calendarViewMode === 'court' ? 'default' : 'ghost'}
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => setCalendarViewMode('court')}
                      >
                        <Grid3X3 className="h-3.5 w-3.5 mr-1" />
                        Courts
                      </Button>
                      <Button
                        variant={calendarViewMode === 'week' ? 'default' : 'ghost'}
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => setCalendarViewMode('week')}
                      >
                        <Calendar className="h-3.5 w-3.5 mr-1" />
                        Week
                      </Button>
                      <Button
                        variant={calendarViewMode === 'month' ? 'default' : 'ghost'}
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => setCalendarViewMode('month')}
                      >
                        <CalendarDays className="h-3.5 w-3.5 mr-1" />
                        Month
                      </Button>
                    </div>
                  )}
                </div>

                {/* Date Navigation with Picker — only shown in court view */}
                {calendarViewMode === 'court' && (
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => navigateDate('prev')}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  {!isMobile ? (
                    renderDatePickerPopover('text-center min-w-0 md:min-w-[200px] font-medium hover:bg-gray-100 text-sm')
                  ) : (
                    <Button variant="ghost" className="text-center min-w-0 md:min-w-[200px] font-medium hover:bg-gray-100 text-sm">
                      {formatDate(selectedDate)}
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => navigateDate('next')}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Calendar Grid Container */}
        <div className="flex-1 min-h-0 flex flex-col px-4 py-2">
        {calendarViewMode !== 'court' ? (
          <WeekMonthCalendarView
            facilityId={selectedFacility}
            facilityName={currentFacility?.name || ''}
            viewMode={calendarViewMode}
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
            onSwitchToCourtView={(date) => {
              setSelectedDate(date);
              setCalendarViewMode('court');
            }}
          />
        ) : courts.length === 0 ? (
          <div
            className="bg-white rounded-lg shadow-lg border border-gray-200 p-4 md:p-8 text-center text-gray-500 h-full"
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
        ) : isMobile ? (
          <div
            className={`flex flex-col flex-1 min-h-0 w-full bg-white rounded-lg shadow-lg border border-gray-200 select-none${calendarTouchLocked ? ' calendar-scroll--touch-locked' : ''}`}
          >
            <div className="flex flex-shrink-0 border-b-2 border-green-800">
              <div
                className="shrink-0 bg-green-700 border-r border-green-800 flex items-center justify-center"
                style={{ width: effectiveTimeColWidth, minWidth: effectiveTimeColWidth, height: effectiveHeaderHeight }}
              >
                <span className="font-semibold text-xs text-green-100">Time (EST)</span>
              </div>
              <div
                ref={courtHeaderScrollRef}
                className="flex-1 overflow-x-auto overflow-y-hidden calendar-court-header-sync"
                onScroll={handleCourtHeaderScroll}
              >
                <div ref={headerRowRef} className="flex" style={{ width: courtGridWidth }}>
                  {renderMobileCourtHeaderCells()}
                </div>
              </div>
            </div>

            <div
              ref={calendarScrollRef}
              className={`calendar-scroll calendar-scroll-mobile-y flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-y-contain${calendarTouchLocked ? ' calendar-scroll--touch-locked' : ''}`}
            >
              <div
                className="flex min-w-0"
                style={{ height: visibleTimeSlots.length * effectiveSubSlotHeight }}
              >
                <div
                  className="shrink-0 relative z-20 bg-green-50 border-r border-green-100"
                  style={{ width: effectiveTimeColWidth, minWidth: effectiveTimeColWidth }}
                >
                  {visibleTimeSlots.map((time30, visibleIdx) => renderTimeLabelRow(visibleIdx, time30, false))}
                  {renderCurrentTimeIndicator(0, true)}
                </div>
                <div
                  ref={courtHorizontalScrollRef}
                  className="calendar-court-body-scroll flex-1 min-w-0 overflow-x-auto overflow-y-hidden relative"
                  onScroll={handleCourtHorizontalScroll}
                >
                  <table
                    ref={calendarGridRef}
                    style={{ tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0, width: courtGridWidth }}
                  >
                    <tbody>
                      {visibleTimeSlots.map((time30, visibleIdx) => (
                        <tr key={visibleIdx} style={{ height: effectiveSubSlotHeight }}>
                          {renderCourtCellsForRow(visibleIdx)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {renderBookingOverlayLayer(0)}
                  {renderMobileCurrentTimeLine()}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div
            ref={calendarScrollRef}
            className={`calendar-scroll overscroll-y-contain bg-white rounded-lg shadow-lg border border-gray-200 overflow-auto relative w-full flex-1 min-h-0 select-none${calendarTouchLocked ? ' calendar-scroll--touch-locked' : ''}`}
          >
            <table
              ref={calendarGridRef}
              style={{ tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0, width: effectiveTimeColWidth + courtGridWidth }}
            >
              <thead>
                <tr ref={headerRowRef as React.RefObject<HTMLTableRowElement>}>
                  <th
                    className="sticky top-0 left-0 z-40 bg-green-700 border-r border-b-2 border-green-800"
                    style={{ width: effectiveTimeColWidth, minWidth: effectiveTimeColWidth, height: effectiveHeaderHeight, textAlign: 'center', verticalAlign: 'middle' }}
                  >
                    <span className="font-semibold text-xs text-green-100">Time (EST)</span>
                  </th>
                  {renderCourtHeaderCells()}
                </tr>
              </thead>
              <tbody>
                {visibleTimeSlots.map((time30, visibleIdx) => (
                  <tr key={visibleIdx} style={{ height: effectiveSubSlotHeight }}>
                    {renderTimeLabelRow(visibleIdx, time30, true)}
                    {renderCourtCellsForRow(visibleIdx)}
                  </tr>
                ))}
              </tbody>
            </table>
            {renderBookingOverlayLayer(effectiveTimeColWidth)}
            {renderCurrentTimeIndicator(effectiveTimeColWidth, false)}
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

      {/* Reservation Details Modal (includes post-play roster + staff Close out) */}
      <ReservationManagementModal
        isOpen={reservationDetailsModal.isOpen}
        onClose={closeReservationDetailsModal}
        reservation={reservationDetailsModal.reservation}
        allowStaffCloseOut
        onUpdate={() => {
          void fetchBookings();
        }}
      />

      <BulletinActivitySignupModal
        isOpen={bulletinActivityModal.isOpen}
        postId={bulletinActivityModal.postId}
        onClose={() => setBulletinActivityModal({ isOpen: false, postId: null })}
        onSignupChange={() => void fetchBookings()}
        returnPath="calendar"
      />
    </>
  );
}
