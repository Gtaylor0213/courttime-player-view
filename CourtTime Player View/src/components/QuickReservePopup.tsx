import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Checkbox } from './ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Calendar, Clock, MapPin, User, Zap, AlertCircle, Info } from 'lucide-react';
import { RuleViolationDialog } from './RuleViolationDialog';
import { CourtWaiverAcceptanceDialog, useCourtWaiverGate } from './CourtWaiverAcceptanceDialog';
import { useAuth } from '../contexts/AuthContext';
import { bookingApi, courtConfigApi } from '../api/client';
import {
  formatMinutesAsHHMM,
  parseHHMMToMinutes,
  type CourtAvailabilityData,
} from '../../shared/utils/courtAvailability';
import { BOOKING_TYPES, RESERVATION_LABEL_TYPE_KEYS } from '../constants/bookingTypes';
import { parseLocalDate } from '../utils/dateUtils';
import { checkBookingPeakHours } from '../utils/bookingPeakHours';
import { confirmSkipRecurringConflicts } from '../utils/recurringConflicts';
import { courtBookingCheckoutUrls } from '../../shared/utils/courtBookingCheckoutUrls';
import { FEATURE_FLAGS } from '../../shared/constants/featureFlags';
import {
  bookingWithDetailsToCalendarDetails,
  offerAddBookingToCalendar,
} from '../utils/bookingCalendar';

interface QuickReservePopupProps {
  isOpen: boolean;
  onClose: () => void;
  onReserve: (reservation: {
    facility: string;
    court: string;
    date: string;
    time: string;
    duration: string;
    playerName: string;
  }) => void;
  facilities: Array<{
    id: string;
    name: string;
    type: string;
    courts: Array<{
      id: string;
      name: string;
      type: string;
      parentCourtId?: string | null;
      isSplitCourt?: boolean;
      isWalkUp?: boolean;
      requirePayment?: boolean;
      bookingAmountCents?: number | null;
      guestFeeCents?: number | null;
      ballMachineFeeCents?: number | null;
    }>;
  }>;
  selectedFacilityId: string;
}

type FacilityCourt = QuickReservePopupProps['facilities'][number]['courts'][number];

const QUICK_RESERVE_SLOT_STEP_MINUTES = 15;
const MINUTES_PER_DAY = 24 * 60;

function minutesTo12HourSlotLabel(totalMinutes: number): string {
  const normalized = ((totalMinutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hour24 = Math.floor(normalized / 60);
  const minute = normalized % 60;
  const period = hour24 >= 12 ? 'PM' : 'AM';
  const displayHour = hour24 % 12 || 12;
  return `${displayHour}:${minute.toString().padStart(2, '0')} ${period}`;
}

function slotLabelToMinutes(label: string): number {
  const [time, period] = label.split(' ');
  const [hourStr, minuteStr] = (time || '').split(':');
  let hour = parseInt(hourStr, 10);
  const minute = parseInt(minuteStr || '0', 10);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return Number.NaN;
  if (period === 'PM' && hour !== 12) hour += 12;
  if (period === 'AM' && hour === 12) hour = 0;
  return hour * 60 + minute;
}

function durationToMinutes(durationHours: string): number {
  const duration = parseFloat(durationHours);
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  return Math.round(duration * 60);
}

type BookedInterval = { start: number; end: number };

/**
 * Exact booked windows in minutes. Slot-set comparisons miss overlaps when the
 * court's slot size (30/60 min) is coarser than the 15-minute starts offered here.
 */
function bookedIntervalsFor(availability: CourtAvailabilityData | undefined): BookedInterval[] {
  const intervals: BookedInterval[] = [];
  for (const row of availability?.existingBookings || []) {
    const rawStart = row.startTime || row.start_time;
    const rawEnd = row.endTime || row.end_time;
    if (!rawStart || !rawEnd) continue;
    const start = parseHHMMToMinutes(rawStart);
    const end = parseHHMMToMinutes(rawEnd);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    intervals.push({ start, end });
  }
  return intervals;
}

function nextQuarterHourMinutes(): number {
  const now = new Date();
  const roundedMinutes = Math.ceil(now.getMinutes() / QUICK_RESERVE_SLOT_STEP_MINUTES) * QUICK_RESERVE_SLOT_STEP_MINUTES;
  const totalMinutes = now.getHours() * 60 + roundedMinutes;
  return Math.min(totalMinutes, MINUTES_PER_DAY);
}

function todayYmd(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** Next 15-minute slot at or after now (12h label). */
function nextQuarterHourSlot(): string {
  return minutesTo12HourSlotLabel(Math.min(nextQuarterHourMinutes(), MINUTES_PER_DAY - QUICK_RESERVE_SLOT_STEP_MINUTES));
}

function futureStartMinutes(selectedDate: string): number {
  return selectedDate === todayYmd() ? nextQuarterHourMinutes() : 0;
}

function roundUpToSlotStep(minutes: number): number {
  return Math.ceil(minutes / QUICK_RESERVE_SLOT_STEP_MINUTES) * QUICK_RESERVE_SLOT_STEP_MINUTES;
}

function isWithinCourtHours(
  court: FacilityCourt,
  startTime: string,
  durationHours: string,
  availabilityByCourtId: Record<string, CourtAvailabilityData>
): boolean {
  const availability = availabilityByCourtId[court.id];
  if (!availability?.isOpen) return false;

  const startMinutes = slotLabelToMinutes(startTime);
  const durationMinutes = durationToMinutes(durationHours);
  const openMinutes = parseHHMMToMinutes(availability.operatingHours.open);
  const closeMinutes = parseHHMMToMinutes(availability.operatingHours.close);

  return (
    Number.isFinite(startMinutes) &&
    durationMinutes > 0 &&
    startMinutes >= openMinutes &&
    startMinutes + durationMinutes <= closeMinutes &&
    startMinutes >= futureStartMinutes(availability.date)
  );
}

function isCourtAvailableForDuration(
  court: FacilityCourt,
  startTime: string,
  durationHours: string,
  availabilityByCourtId: Record<string, CourtAvailabilityData>,
  bookedByCourtId: Record<string, BookedInterval[]>
): boolean {
  if (!isWithinCourtHours(court, startTime, durationHours, availabilityByCourtId)) return false;

  const startMinutes = slotLabelToMinutes(startTime);
  const endMinutes = startMinutes + durationToMinutes(durationHours);
  const booked = bookedByCourtId[court.id] || [];
  return !booked.some((interval) => startMinutes < interval.end && endMinutes > interval.start);
}

function buildBookableStartSlots(
  courts: FacilityCourt[],
  selectedDate: string,
  durationHours: string,
  availabilityByCourtId: Record<string, CourtAvailabilityData>
): string[] {
  const durationMinutes = durationToMinutes(durationHours);
  if (!selectedDate || durationMinutes <= 0) return [];

  const earliestStart = futureStartMinutes(selectedDate);
  const slotMinutes = new Set<number>();

  for (const court of courts) {
    const availability = availabilityByCourtId[court.id];
    if (!availability?.isOpen) continue;

    const openMinutes = parseHHMMToMinutes(availability.operatingHours.open);
    const closeMinutes = parseHHMMToMinutes(availability.operatingHours.close);
    const firstStart = roundUpToSlotStep(Math.max(openMinutes, earliestStart));
    const lastStart = closeMinutes - durationMinutes;

    for (let t = firstStart; t <= lastStart; t += QUICK_RESERVE_SLOT_STEP_MINUTES) {
      slotMinutes.add(t);
    }
  }

  return [...slotMinutes]
    .filter((minutes) => minutes >= 0 && minutes < MINUTES_PER_DAY)
    .sort((a, b) => a - b)
    .map(minutesTo12HourSlotLabel);
}

export function QuickReservePopup({
  isOpen,
  onClose,
  onReserve,
  facilities,
  selectedFacilityId
}: QuickReservePopupProps) {
  const { user } = useAuth();
  const isAdmin = user?.userType === 'admin';
  const [selectedFacility, setSelectedFacility] = useState(selectedFacilityId);
  const [facilityFeatures, setFacilityFeatures] = useState<string[]>([]);
  const canUseRecurring = isAdmin || facilityFeatures.includes(FEATURE_FLAGS.PLAYER_RECURRING_BOOKINGS);
  const canSplitPayment = facilityFeatures.includes(FEATURE_FLAGS.SPLIT_COURT_PAYMENTS);
  const [selectedCourtType, setSelectedCourtType] = useState<'tennis' | 'pickleball' | null>(null);
  const [selectedCourt, setSelectedCourt] = useState('');
  const [selectedCourtId, setSelectedCourtId] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [selectedEndTime, setSelectedEndTime] = useState('');
  const [duration, setDuration] = useState('1');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const courtWaiverGate = useCourtWaiverGate();
  const [availabilityByCourtId, setAvailabilityByCourtId] = useState<Record<string, CourtAvailabilityData>>({});
  const [bookingErrors, setBookingErrors] = useState<Array<{ ruleCode: string; ruleName: string; message: string; severity: string }>>([]);
  const [bookingWarnings, setBookingWarnings] = useState<Array<{ ruleCode: string; ruleName: string; message: string }>>([]);
  const [isPrimeTime, setIsPrimeTime] = useState(false);

  // Booking type
  const [bookingType, setBookingType] = useState<string>('');

  // Multi-court selection
  const [additionalCourtIds, setAdditionalCourtIds] = useState<string[]>([]);

  // Advanced booking state
  const [advancedBooking, setAdvancedBooking] = useState(false);
  const [recurringDays, setRecurringDays] = useState<string[]>([]);
  const [recurringEndDate, setRecurringEndDate] = useState('');
  const [splitPayment, setSplitPayment] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [memberResults, setMemberResults] = useState<Array<{ userId: string; fullName: string; email: string }>>([]);
  const [splitMembers, setSplitMembers] = useState<Array<{ userId: string; fullName: string }>>([]);

  // Set once the user picks a start or end time; their choice then wins over autofill
  const [userChoseTime, setUserChoseTime] = useState(false);

  // Initialize with current date and time, reset notes when modal opens
  useEffect(() => {
    if (!isOpen) return;

    setUserChoseTime(false);
    setSelectedDate(todayYmd());
    setSelectedTime(nextQuarterHourSlot());
    setDuration('1');

    // Reset notes, booking type, advanced booking, and errors when modal opens
    setNotes('');
    setBookingType('');
    setAdvancedBooking(false);
    setRecurringDays([]);
    setRecurringEndDate('');
    setBookingErrors([]);
    setBookingWarnings([]);
    setIsPrimeTime(false);
    setAdditionalCourtIds([]);
    setSplitPayment(false);
    setMemberSearch('');
    setMemberResults([]);
    setSplitMembers([]);
  }, [isOpen]);

  useEffect(() => {
    if (!splitPayment || !selectedFacility || memberSearch.trim().length < 2) { setMemberResults([]); return; }
    let cancelled = false;
    bookingApi.lookupFacilityMembers(selectedFacility, memberSearch).then((res: any) => {
      if (!cancelled && res.success) setMemberResults((res.members || res.data?.members || []).filter((m: any) => m.userId !== user?.id));
    }).catch(() => !cancelled && setMemberResults([]));
    return () => { cancelled = true; };
  }, [splitPayment, selectedFacility, memberSearch, user?.id]);

  // Reset court selection when facility changes
  useEffect(() => {
    setSelectedCourt('');
    setSelectedCourtId('');
    setSelectedCourtType(null);
    setAdditionalCourtIds([]);
  }, [selectedFacility]);

  // Fetch feature flags for the currently selected facility
  useEffect(() => {
    if (!selectedFacility) { setFacilityFeatures([]); return; }
    fetch(`/api/facilities/${selectedFacility}/feature-flags`)
      .then(r => r.json())
      .then(res => { if (res.success) setFacilityFeatures(res.data); })
      .catch(() => setFacilityFeatures([]));
  }, [selectedFacility]);

  // Peak-hours status from rules engine (same logic as booking validation)
  useEffect(() => {
    if (!isOpen || !user?.id || !selectedCourtId || !selectedFacility || !selectedDate || !selectedTime || !selectedEndTime) {
      setIsPrimeTime(false);
      return;
    }

    let cancelled = false;
    const run = async () => {
      const result = await checkBookingPeakHours({
        courtId: selectedCourtId,
        userId: user.id,
        facilityId: selectedFacility,
        bookingDate: selectedDate,
        startTime12h: selectedTime,
        endTime12h: selectedEndTime,
      });
      if (!cancelled) {
        setIsPrimeTime(result.isPrimeTime);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [
    isOpen,
    user?.id,
    selectedCourtId,
    selectedFacility,
    selectedDate,
    selectedTime,
    selectedEndTime,
  ]);

  const currentFacility = facilities.find(f => f.id === selectedFacility);
  const allCourts = React.useMemo(
    () => (currentFacility?.courts || []).filter(c => !c.isWalkUp),
    [currentFacility]
  );
  // Stable key so refreshed facility props don't restart the availability fetch
  const courtIdsKey = allCourts.map(c => c.id).join(',');

  // Determine if facility has both types of courts
  const hasTennisCourts = allCourts.some(court => court.type === 'tennis');
  const hasPickleballCourts = allCourts.some(court => court.type === 'pickleball');
  const hasMultipleCourtTypes = hasTennisCourts && hasPickleballCourts;

  // Auto-select court type when there's only one type available
  useEffect(() => {
    if (!hasMultipleCourtTypes && selectedCourtType === null) {
      if (hasTennisCourts && !hasPickleballCourts) {
        setSelectedCourtType('tennis');
      } else if (hasPickleballCourts && !hasTennisCourts) {
        setSelectedCourtType('pickleball');
      }
    }
  }, [hasMultipleCourtTypes, hasTennisCourts, hasPickleballCourts, selectedCourtType]);

  // Filter courts by selected type
  const availableCourts = React.useMemo(() => {
    if (selectedCourtType === null) {
      return allCourts;
    }
    return allCourts.filter(court => court.type === selectedCourtType);
  }, [allCourts, selectedCourtType]);

  // Per-court availability (same API as mobile book flow)
  useEffect(() => {
    if (!isOpen || !selectedFacility || !selectedDate || allCourts.length === 0) return;

    let cancelled = false;

    (async () => {
      try {
        const byCourtId: Record<string, CourtAvailabilityData> = {};
        await Promise.all(
          allCourts.map(async (c) => {
            const res = await courtConfigApi.getAvailability(c.id, selectedDate);
            if (res.success && res.data) {
              byCourtId[c.id] = res.data as CourtAvailabilityData;
            }
          })
        );
        if (cancelled) return;
        setAvailabilityByCourtId(byCourtId);
      } catch (error) {
        console.error('Error fetching court availability:', error);
        if (!cancelled) setAvailabilityByCourtId({});
      }
    })();

    return () => {
      cancelled = true;
    };
    // courtIdsKey (not allCourts) keeps this from refiring on every parent refresh
  }, [isOpen, selectedFacility, selectedDate, courtIdsKey]);

  const bookedByCourtId = React.useMemo(() => {
    const map: Record<string, BookedInterval[]> = {};
    for (const courtId of Object.keys(availabilityByCourtId)) {
      map[courtId] = bookedIntervalsFor(availabilityByCourtId[courtId]);
    }
    return map;
  }, [availabilityByCourtId]);

  // All future start times that fit within at least one selected-type court's operating hours.
  const timeSlots = React.useMemo(() => {
    return buildBookableStartSlots(availableCourts, selectedDate, duration, availabilityByCourtId);
  }, [availableCourts, selectedDate, duration, availabilityByCourtId]);

  const findSoonestOpening = React.useCallback(
    (durationHours: string) => {
      const startSlots = buildBookableStartSlots(availableCourts, selectedDate, durationHours, availabilityByCourtId);
      for (const timeSlot of startSlots) {
        for (const court of availableCourts) {
          if (isCourtAvailableForDuration(court, timeSlot, durationHours, availabilityByCourtId, bookedByCourtId)) {
            return { court, time: timeSlot };
          }
        }
      }
      return null;
    },
    [availableCourts, selectedDate, availabilityByCourtId, bookedByCourtId]
  );

  // Autofill the soonest opening, but never overwrite a time the user picked while it is still bookable
  useEffect(() => {
    if (!isOpen) return;

    if (!selectedCourtType) {
      setSelectedCourt('');
      setSelectedCourtId('');
      return;
    }
    if (availableCourts.length === 0 || !selectedDate) return;

    // A time the user picked is only replaced once it stops being offered at all
    // (date moved on, court hours changed, or the slot slipped into the past).
    if (userChoseTime && selectedTime && timeSlots.includes(selectedTime)) return;

    const soonest = findSoonestOpening(duration);
    if (soonest) {
      setSelectedCourtId(soonest.court.id);
      setSelectedCourt(soonest.court.name);
      setSelectedTime(soonest.time);
      if (userChoseTime) setUserChoseTime(false);
    } else {
      // Nothing bookable for this date, court type, and length
      const firstCourt = availableCourts[0];
      setSelectedCourtId(firstCourt.id);
      setSelectedCourt(firstCourt.name);
      setSelectedTime('');
    }
  }, [
    isOpen,
    selectedCourtType,
    availableCourts,
    availabilityByCourtId,
    bookedByCourtId,
    selectedDate,
    duration,
    selectedTime,
    timeSlots,
    userChoseTime,
    findSoonestOpening,
  ]);

  // Calculate which courts are available at the selected time and duration
  const courtsWithAvailability = React.useMemo(() => {
    if (!selectedCourtType || !selectedTime || availableCourts.length === 0) {
      return [];
    }

    return availableCourts.map(court => ({
      ...court,
      isAvailable: isCourtAvailableForDuration(court, selectedTime, duration, availabilityByCourtId, bookedByCourtId),
    }));
  }, [selectedCourtType, selectedTime, duration, availableCourts, availabilityByCourtId, bookedByCourtId]);

  // Keep the court selection on a court that can actually host the chosen window
  useEffect(() => {
    if (!selectedCourtId || courtsWithAvailability.length === 0) return;
    const current = courtsWithAvailability.find(c => c.id === selectedCourtId);
    if (current?.isAvailable) return;

    const replacement = courtsWithAvailability.find(c => c.isAvailable);
    setSelectedCourtId(replacement?.id || '');
    setSelectedCourt(replacement?.name || '');
  }, [courtsWithAvailability, selectedCourtId]);

  // A start time that fell outside the bookable window (date change, time passing) can't stay selected
  useEffect(() => {
    if (!selectedTime || timeSlots.length === 0 || timeSlots.includes(selectedTime)) return;
    setUserChoseTime(false);
    setSelectedTime(timeSlots[0]);
  }, [selectedTime, timeSlots]);

  const toggleRecurringDay = (day: string) => {
    setRecurringDays(prev =>
      prev.includes(day)
        ? prev.filter(d => d !== day)
        : [...prev, day]
    );
  };

  // Toggle additional court selection
  const toggleCourtSelection = (courtId: string, courtName: string) => {
    if (courtId === selectedCourtId) {
      // Clicking primary court — deselect only if there are additional courts
      if (additionalCourtIds.length > 0) {
        const nextPrimaryId = additionalCourtIds[0];
        const nextPrimary = availableCourts.find(c => c.id === nextPrimaryId);
        setSelectedCourtId(nextPrimaryId);
        setSelectedCourt(nextPrimary?.name || '');
        setAdditionalCourtIds(prev => prev.filter(id => id !== nextPrimaryId));
      }
    } else if (additionalCourtIds.includes(courtId)) {
      // Already additional — remove it
      setAdditionalCourtIds(prev => prev.filter(id => id !== courtId));
    } else {
      // Not selected — add it
      if (!selectedCourtId) {
        setSelectedCourtId(courtId);
        setSelectedCourt(courtName);
      } else {
        setAdditionalCourtIds(prev => [...prev, courtId]);
      }
    }
  };

  // All selected courts (primary + additional)
  const allSelectedCourts = React.useMemo(() => {
    const courts: Array<{ id: string; name: string }> = [];
    if (selectedCourtId) {
      courts.push({ id: selectedCourtId, name: selectedCourt });
    }
    for (const id of additionalCourtIds) {
      const c = availableCourts.find(court => court.id === id);
      if (c) courts.push({ id: c.id, name: c.name });
    }
    return courts;
  }, [selectedCourtId, selectedCourt, additionalCourtIds, availableCourts]);

  const getDayOfWeek = (date: Date): string => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[date.getDay()];
  };

  const generateRecurringDates = (): string[] => {
    if (!advancedBooking || recurringDays.length === 0 || !recurringEndDate) {
      return [selectedDate];
    }

    const dates: string[] = [];
    const start = parseLocalDate(selectedDate);
    const end = parseLocalDate(recurringEndDate);

    let current = new Date(start);
    while (current <= end) {
      const dayName = getDayOfWeek(current);
      if (recurringDays.includes(dayName)) {
        // Use local date components to avoid timezone issues
        const year = current.getFullYear();
        const month = String(current.getMonth() + 1).padStart(2, '0');
        const day = String(current.getDate()).padStart(2, '0');
        dates.push(`${year}-${month}-${day}`);
      }
      current.setDate(current.getDate() + 1);
    }

    return dates;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedCourt || !selectedCourtId) {
      alert('Please select a court');
      return;
    }

    if (!selectedTime || !selectedEndTime) {
      alert('Please select an available time while the court is open');
      return;
    }

    const selectedCourtsAreOpen = allSelectedCourts.every((court) => {
      const fullCourt = availableCourts.find((c) => c.id === court.id);
      return fullCourt && isCourtAvailableForDuration(fullCourt, selectedTime, duration, availabilityByCourtId, bookedByCourtId);
    });
    if (!selectedCourtsAreOpen) {
      alert('Selected court is not available for the full reservation time.');
      return;
    }

    if (!user?.id) {
      alert('You must be logged in to make a reservation');
      return;
    }

    const includesPaidCourt = allSelectedCourts.some((court) => {
      const fullCourt = availableCourts.find((c) => c.id === court.id);
      return Boolean(fullCourt?.requirePayment && fullCourt?.bookingAmountCents);
    });
    if (includesPaidCourt && (allSelectedCourts.length > 1 || advancedBooking)) {
      alert('Paid court reservations must be booked one court and one time at a time.');
      return;
    }

    // Validate advanced booking
    if (advancedBooking) {
      if (recurringDays.length === 0) {
        alert('Please select at least one day of the week for recurring bookings');
        return;
      }
      if (!recurringEndDate) {
        alert('Please select an end date for recurring bookings');
        return;
      }
      if (new Date(recurringEndDate) < new Date(selectedDate)) {
        alert('End date must be on or after the start date');
        return;
      }
    }

    // Court-specific waivers must be accepted before booking
    const waiversAccepted = await courtWaiverGate.ensureAccepted(
      allSelectedCourts.map((c) => c.id)
    );
    if (!waiversAccepted) return;

    setIsSubmitting(true);

    try {
      const checkoutReturnUrls =
        typeof window !== 'undefined' ? courtBookingCheckoutUrls(window.location.origin) : undefined;

      // Book exactly the window shown in the form
      const startMinutes = slotLabelToMinutes(selectedTime);
      const endMinutes = slotLabelToMinutes(selectedEndTime);
      const durationMinutes = endMinutes - startMinutes;
      if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes) || durationMinutes <= 0) {
        setIsSubmitting(false);
        alert('Please select a valid start and end time');
        return;
      }

      const startTime24 = `${formatMinutesAsHHMM(startMinutes)}:00`;
      const endTime24 = `${formatMinutesAsHHMM(endMinutes)}:00`;

      // Generate dates for booking
      const datesToBook = generateRecurringDates();

      // Create bookings for all courts × all dates
      const bookingRequests = allSelectedCourts.flatMap(c =>
        datesToBook.map(date => ({
          courtId: c.id,
          userId: user.id,
          facilityId: selectedFacility,
          bookingDate: date,
          startTime: startTime24,
          endTime: endTime24,
          durationMinutes: Math.round(durationMinutes),
          bookingType: bookingType || undefined,
          notes: notes || undefined
          ,splitParticipantIds: splitPayment ? splitMembers.map(m => m.userId) : undefined
        }))
      );

      const isRecurringSeries = advancedBooking;
      const results = isRecurringSeries
        ? await (async () => {
            const seriesPayload = {
              userId: user.id,
              facilityId: selectedFacility,
              bookingType: bookingType || undefined,
              notes: notes || undefined,
              instances: bookingRequests
            };
            let res = await bookingApi.createRecurringSeries(seriesPayload);
            if (!res.success && res.conflicts?.length) {
              if (!confirmSkipRecurringConflicts(res.conflicts)) {
                return null;
              }
              res = await bookingApi.createRecurringSeries({ ...seriesPayload, skipConflicts: true });
            }
            return [res];
          })()
        : await (async () => {
            const out: Awaited<ReturnType<typeof bookingApi.create>>[] = [];
            const prior: Array<{
              bookingDate: string;
              courtId: string;
              startTime: string;
              endTime: string;
              durationMinutes: number;
            }> = [];
            for (const req of bookingRequests) {
              const res = await bookingApi.create({
                ...req,
                ...checkoutReturnUrls,
                provisionalSameRequestBookings: prior.length > 0 ? [...prior] : undefined
              });
              if (res.requiresPayment && res.checkoutUrl) {
                sessionStorage.setItem(
                  'courtBookingCheckoutPending',
                  JSON.stringify({
                    courtId: req.courtId,
                    bookingDate: req.bookingDate,
                    facilityId: selectedFacility,
                  })
                );
                window.location.replace(res.checkoutUrl);
                return [res];
              }
              out.push(res);
              if (!res.success) break;
              prior.push({
                bookingDate: req.bookingDate,
                courtId: req.courtId,
                startTime: req.startTime,
                endTime: req.endTime,
                durationMinutes: req.durationMinutes
              });
            }
            return out;
          })();

      if (results === null) return; // User cancelled after seeing the conflict list

      const paymentResult = results.find((r) => r.requiresPayment && r.checkoutUrl);
      if (paymentResult?.checkoutUrl) {
        return;
      }

      const failedBookings = results.filter(r => !r.success);
      const successfulBookings = results.filter(
        (r) =>
          r.success &&
          !r.requiresPayment &&
          ((r as { booking?: unknown }).booking ||
            ((r as { bookings?: unknown[] }).bookings?.length ?? 0) > 0)
      );
      const createdCount = successfulBookings
        .map((r) =>
          (r as { bookings?: unknown[] }).bookings?.length ??
          ((r as { booking?: unknown }).booking ? 1 : 0)
        )
        .reduce((a: number, b: number) => a + b, 0);

      if (successfulBookings.length > 0) {
        // Call the parent callback to refresh bookings
        const reservation = {
          facility: currentFacility?.name || '',
          court: selectedCourt,
          date: selectedDate,
          time: selectedTime,
          duration,
          playerName: user.name || user.email || 'Player'
        };
        onReserve(reservation);

        const msg =
          createdCount > 1
            ? `${createdCount} court reservations were created at ${currentFacility?.name || 'your club'}.`
            : `Your ${selectedCourt} booking at ${currentFacility?.name || 'your club'} is confirmed for ${selectedDate} at ${selectedTime}.`;

        const calendarDetails =
          createdCount === 1
            ? bookingWithDetailsToCalendarDetails({
                courtName: selectedCourt,
                facilityName: currentFacility?.name,
                bookingDate: datesToBook[0] || selectedDate,
                startTime: startTime24,
                endTime: endTime24,
                bookingType: bookingType || undefined,
                notes: notes || undefined,
              })
            : null;

        const firstSuccess = successfulBookings[0] as {
          booking?: { id?: string };
          bookings?: Array<{ id?: string }>;
        };
        const createdBookingId = firstSuccess?.booking?.id ?? firstSuccess?.bookings?.[0]?.id;

        offerAddBookingToCalendar(msg, calendarDetails, { bookingId: createdBookingId });

        if (failedBookings.length > 0) {
          // Collect rule violations from failed bookings
          const violations = failedBookings
            .filter(r => r.ruleViolations && r.ruleViolations.length > 0)
            .flatMap(r => r.ruleViolations!);
          if (violations.length > 0) {
            setBookingErrors(violations);
          } else {
            setBookingErrors([{ ruleCode: '', ruleName: '', message: `${failedBookings.length} bookings failed (possibly due to conflicts).`, severity: 'error' }]);
          }
        }

        onClose();
      } else {
        // Show rule violations from the first failed result
        const firstFailed = failedBookings[0];
        if (firstFailed?.ruleViolations && firstFailed.ruleViolations.length > 0) {
          setBookingErrors(firstFailed.ruleViolations);
          if (firstFailed.warnings) {
            setBookingWarnings(firstFailed.warnings);
          }
          if (firstFailed.isPrimeTime !== undefined) {
            setIsPrimeTime(firstFailed.isPrimeTime);
          }
        } else {
          setBookingErrors([{ ruleCode: '', ruleName: '', message: firstFailed?.error || 'Failed to create booking. There may be conflicts with existing reservations.', severity: 'error' }]);
        }
      }
    } catch (error) {
      console.error('Booking error:', error);
      setBookingErrors([{ ruleCode: '', ruleName: '', message: 'An error occurred while creating your booking(s)', severity: 'error' }]);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDisplayDate = (date: string) => {
    return parseLocalDate(date).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const calculateEndTime = (startTime: string, durationHours: string) => {
    const [time, period] = startTime.split(' ');
    const timeParts = time.split(':');
    let hours = parseInt(timeParts[0]);
    let minutes = timeParts[1] ? parseInt(timeParts[1]) : 0;
    
    // Convert to 24-hour format
    if (period === 'PM' && hours !== 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;
    
    // Add duration
    const durationFloat = parseFloat(durationHours);
    hours += Math.floor(durationFloat);
    minutes += (durationFloat % 1) * 60;
    
    // Handle minutes overflow
    if (minutes >= 60) {
      hours += Math.floor(minutes / 60);
      minutes = minutes % 60;
    }
    
    // Convert back to 12-hour format
    const endPeriod = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours === 12 ? 12 : hours;
    
    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${endPeriod}`;
  };

  // End time options: only times that remain inside the selected court's operating hours.
  const endTimeSlots = React.useMemo(() => {
    if (!selectedTime) return [];
    const startMinutes = slotLabelToMinutes(selectedTime);
    if (!Number.isFinite(startMinutes)) return [];

    const eligibleCourts = selectedCourtId
      ? availableCourts.filter((court) => court.id === selectedCourtId)
      : availableCourts;
    const endMinutes = new Set<number>();

    for (const court of eligibleCourts) {
      const availability = availabilityByCourtId[court.id];
      if (!availability?.isOpen) continue;

      const openMinutes = parseHHMMToMinutes(availability.operatingHours.open);
      const closeMinutes = parseHHMMToMinutes(availability.operatingHours.close);
      if (startMinutes < openMinutes || startMinutes >= closeMinutes) continue;

      // Stop at the next reservation on this court so end times can't overlap it
      const nextBookingStart = (bookedByCourtId[court.id] || [])
        .filter((interval) => interval.start > startMinutes)
        .reduce((soonest, interval) => Math.min(soonest, interval.start), Number.POSITIVE_INFINITY);
      const latestEnd = Math.min(closeMinutes, nextBookingStart);

      for (let t = startMinutes + QUICK_RESERVE_SLOT_STEP_MINUTES; t <= latestEnd; t += QUICK_RESERVE_SLOT_STEP_MINUTES) {
        endMinutes.add(t);
      }
    }

    return [...endMinutes]
      .filter((minutes) => minutes > 0 && minutes < MINUTES_PER_DAY)
      .sort((a, b) => a - b)
      .map(minutesTo12HourSlotLabel);
  }, [selectedTime, selectedCourtId, availableCourts, availabilityByCourtId, bookedByCourtId]);

  // Keep the end time (and the duration derived from it) inside the bookable window
  useEffect(() => {
    if (!selectedTime) {
      setSelectedEndTime('');
      return;
    }
    const calculatedEndTime = calculateEndTime(selectedTime, duration);
    if (endTimeSlots.includes(calculatedEndTime)) {
      setSelectedEndTime(calculatedEndTime);
      return;
    }

    const fallbackEndTime = endTimeSlots[endTimeSlots.length - 1] || '';
    setSelectedEndTime(fallbackEndTime);
    if (fallbackEndTime) {
      const trimmedMinutes = slotLabelToMinutes(fallbackEndTime) - slotLabelToMinutes(selectedTime);
      if (trimmedMinutes > 0) setDuration((trimmedMinutes / 60).toString());
    }
  }, [selectedTime, duration, endTimeSlots]);

  // When user picks an end time, derive duration
  const handleEndTimeChange = (newEndTime: string) => {
    setUserChoseTime(true);
    setSelectedEndTime(newEndTime);
    const diff = slotLabelToMinutes(newEndTime) - slotLabelToMinutes(selectedTime);
    if (diff > 0) {
      setDuration((diff / 60).toString());
    }
  };

  // Computed duration label for display
  const durationLabel = React.useMemo(() => {
    const mins = parseFloat(duration) * 60;
    if (mins <= 0) return '';
    const h = Math.floor(mins / 60);
    const m = Math.round(mins % 60);
    if (h === 0) return `${m} min`;
    if (m === 0) return `${h} hr`;
    return `${h} hr ${m} min`;
  }, [duration]);

  return (
    <>
    <CourtWaiverAcceptanceDialog {...courtWaiverGate.dialogProps} />
    <Dialog open={isOpen} onOpenChange={() => !isSubmitting && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[calc(100dvh-2rem)] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-green-600" />
            Quick Reserve
          </DialogTitle>
          <DialogDescription>
            Quick Reserve autofills for the soonest possible date and time of reservation.
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto min-h-0">
          <form onSubmit={handleSubmit} id="quick-reserve-form" className="h-full flex flex-col">
            <div className="flex-1 space-y-3 overflow-y-auto pb-4">
              {/* Facility Selection */}
              <div className="flex items-center gap-3">
                <Label htmlFor="facility" className="flex items-center gap-2 min-w-[80px]">
                  <MapPin className="h-4 w-4" />
                  Facility
                </Label>
                <Select value={selectedFacility} onValueChange={setSelectedFacility}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Select facility" />
                  </SelectTrigger>
                  <SelectContent>
                    {facilities.map((facility) => (
                      <SelectItem key={facility.id} value={facility.id}>
                        {facility.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

          {/* Court Type Filter - Only show if facility has multiple court types */}
          {hasMultipleCourtTypes && (
            <div className="flex items-center gap-3">
              <Label className="min-w-[80px]">Court Type</Label>
              <div className="flex gap-2">
                {hasTennisCourts && (
                  <Button
                    type="button"
                    variant={selectedCourtType === 'tennis' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedCourtType(selectedCourtType === 'tennis' ? null : 'tennis')}
                  >
                    Tennis
                  </Button>
                )}
                {hasPickleballCourts && (
                  <Button
                    type="button"
                    variant={selectedCourtType === 'pickleball' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedCourtType(selectedCourtType === 'pickleball' ? null : 'pickleball')}
                  >
                    Pickleball
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Date Selection */}
          <div className="flex items-center gap-3">
            <Label htmlFor="date" className="flex items-center gap-2 min-w-[80px]">
              <Calendar className="h-4 w-4" />
              Date
            </Label>
            <Input
              id="date"
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              min={(() => {
                const now = new Date();
                return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
              })()}
              required
              className="flex-1"
            />
          </div>

          {/* Start Time */}
          <div className="flex items-center gap-3">
            <Label htmlFor="time" className="flex items-center gap-2 min-w-[80px]">
              <Clock className="h-4 w-4" />
              Start
            </Label>
            <Select value={selectedTime} onValueChange={(val) => {
              setUserChoseTime(true);
              setSelectedTime(val);
              // Keep same duration, recalculate end time via the effect
            }}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Select start time" />
              </SelectTrigger>
              <SelectContent>
                {timeSlots.map((time) => (
                  <SelectItem key={time} value={time}>
                    {time}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* End Time */}
          <div className="flex items-center gap-3">
            <Label className="min-w-[80px]">End</Label>
            <Select value={selectedEndTime} onValueChange={handleEndTimeChange}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Select end time" />
              </SelectTrigger>
              <SelectContent>
                {endTimeSlots.map((time) => (
                  <SelectItem key={time} value={time}>
                    {time}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {durationLabel && (
              <span className="text-xs text-gray-500 min-w-[60px]">{durationLabel}</span>
            )}
          </div>

          {/* Booking Type Dropdown */}
          <div className="flex items-center gap-3">
            <Label className="min-w-[80px]">Type</Label>
            <Select value={bookingType} onValueChange={setBookingType}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Select type (optional)..." />
              </SelectTrigger>
              <SelectContent>
                {RESERVATION_LABEL_TYPE_KEYS.map((key) => (
                  <SelectItem key={key} value={key}>{BOOKING_TYPES[key].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes (Optional)</Label>
            <Textarea
              id="notes"
              placeholder="Add any special requests or notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="resize-none"
            />
          </div>

          {/* Available Courts Selection - Show when court type, date, and time are selected */}
          {selectedCourtType && selectedDate && selectedTime && courtsWithAvailability.length > 0 && (
            <div className="space-y-2">
              <Label>Available Courts</Label>
              <Select
                value={selectedCourtId || undefined}
                onValueChange={(value) => {
                  const court = courtsWithAvailability.find(c => c.id === value);
                  if (court) {
                    setSelectedCourtId(court.id);
                    setSelectedCourt(court.name);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a court" />
                </SelectTrigger>
                <SelectContent>
                  {courtsWithAvailability
                    .filter(court => court.isAvailable)
                    .map((court) => (
                      <SelectItem key={court.id} value={court.id}>
                        {court.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {!selectedCourtId && (
                <p className="text-xs text-amber-600">
                  {courtsWithAvailability.some(court => court.isAvailable)
                    ? 'Please select a court'
                    : `No ${selectedCourtType} courts are free from ${selectedTime} to ${selectedEndTime}. Try another time.`}
                </p>
              )}
            </div>
          )}

          {/* Advanced Booking Checkbox - admins always; players when enabled for the facility */}
          {canSplitPayment && !advancedBooking && allSelectedCourts.length === 1 && (
            <div className="space-y-2 rounded-md border border-blue-200 bg-blue-50 p-3">
              <div className="flex items-center gap-2">
                <Checkbox id="split-payment" checked={splitPayment} onCheckedChange={(checked) => setSplitPayment(checked === true)} />
                <Label htmlFor="split-payment" className="cursor-pointer text-sm font-medium">Split this court fee with members</Label>
              </div>
              {splitPayment && <>
                <p className="text-xs text-blue-800">Each selected member, including you, pays an equal share. The court is held for 15 minutes while everyone pays.</p>
                <Input value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)} placeholder="Search a member by name or email" />
                {memberResults.map((member) => (
                  <button type="button" key={member.userId} className="block w-full text-left text-sm text-blue-800 hover:underline" onClick={() => {
                    if (!splitMembers.some(m => m.userId === member.userId)) setSplitMembers(prev => [...prev, member]);
                    setMemberSearch(''); setMemberResults([]);
                  }}>{member.fullName} <span className="text-xs">({member.email})</span></button>
                ))}
                {splitMembers.length > 0 && <div className="flex flex-wrap gap-1 text-xs">{splitMembers.map(member => <button type="button" key={member.userId} onClick={() => setSplitMembers(prev => prev.filter(m => m.userId !== member.userId))} className="rounded bg-white px-2 py-1 text-blue-800">{member.fullName} ×</button>)}</div>}
              </>}
            </div>
          )}

          {/* Advanced Booking Checkbox - admins always; players when enabled for the facility */}
          {canUseRecurring && (
          <div className="flex items-center gap-2 pt-2">
            <Checkbox
              id="advanced-booking"
              checked={advancedBooking}
              onCheckedChange={(checked) => setAdvancedBooking(checked === true)}
            />
            <Label htmlFor="advanced-booking" className="text-sm font-medium cursor-pointer">
              Advanced Booking (Recurring)
            </Label>
          </div>
          )}

          {/* Recurring Options - Show when Advanced Booking is checked */}
          {advancedBooking && canUseRecurring && (
            <div className="space-y-3 p-3 bg-gray-50 rounded-md border border-gray-200">
              {/* Days of the Week */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Select Days of the Week</Label>
                <div className="grid grid-cols-4 gap-2">
                  {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day) => (
                    <div key={day} className="flex items-center gap-2">
                      <Checkbox
                        id={`day-${day}`}
                        checked={recurringDays.includes(day)}
                        onCheckedChange={() => toggleRecurringDay(day)}
                      />
                      <Label htmlFor={`day-${day}`} className="text-xs cursor-pointer">
                        {day.slice(0, 3)}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              {/* End Date */}
              <div className="space-y-2">
                <Label htmlFor="recurring-end-date" className="text-sm font-medium">
                  Repeat Until
                </Label>
                <Input
                  id="recurring-end-date"
                  type="date"
                  value={recurringEndDate}
                  onChange={(e) => setRecurringEndDate(e.target.value)}
                  min={selectedDate}
                  className="w-full"
                />
              </div>

              {/* Recurring Summary */}
              {recurringDays.length > 0 && recurringEndDate && (
                <div className="text-xs text-gray-600 bg-green-50 p-2 rounded border border-green-200">
                  <span className="font-medium">Will create bookings:</span>
                  <div className="mt-1">
                    Every {recurringDays.join(', ')} from {parseLocalDate(selectedDate).toLocaleDateString()} to {parseLocalDate(recurringEndDate).toLocaleDateString()}
                  </div>
                  <div className="mt-1 font-medium">
                    Total bookings: {generateRecurringDates().length * allSelectedCourts.length}
                    {allSelectedCourts.length > 1 && ` (${generateRecurringDates().length} dates × ${allSelectedCourts.length} courts)`}
                  </div>
                </div>
              )}
            </div>
          )}

              {/* Rule Violations Dialog */}
              <RuleViolationDialog
                open={bookingErrors.length > 0}
                onClose={() => setBookingErrors([])}
                violations={bookingErrors}
              />

              {/* Rule Warnings */}
              {bookingWarnings.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-md p-3 space-y-2">
                  <div className="flex items-center gap-2 text-amber-800 font-medium text-sm">
                    <Info className="h-4 w-4" />
                    Heads up
                  </div>
                  <ul className="space-y-1">
                    {bookingWarnings.map((w, i) => (
                      <li key={i} className="text-sm text-amber-700 flex items-start gap-2">
                        <span className="text-amber-400 mt-0.5">-</span>
                        <span>{w.message}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Peak Hours Badge */}
              {isPrimeTime && (
                <div className="flex items-center gap-2 text-sm bg-blue-50 border border-blue-200 text-blue-700 rounded-md px-3 py-2">
                  <Clock className="h-4 w-4" />
                  This reservation is during peak hours
                </div>
              )}

              {/* Reservation Summary */}
              {selectedCourt && selectedTime && selectedDate && (
                <div className="bg-green-50 p-3 rounded-md border border-green-200">
                  <div className="text-sm">
                    <div className="font-medium text-green-800 mb-1">Reservation Summary</div>
                    <div className="text-green-700">
                      <div>{currentFacility?.name}</div>
                      <div>
                        {allSelectedCourts.length > 1
                          ? `${allSelectedCourts.length} Courts: ${allSelectedCourts.map(c => c.name).join(', ')}`
                          : selectedCourt}
                      </div>
                      <div>{formatDisplayDate(selectedDate)}</div>
                      <div>{selectedTime} - {selectedEndTime} ({durationLabel})</div>
                    </div>
                  </div>
                </div>
              )}
            </div>

          </form>
        </div>

        {/* Action Buttons - Fixed footer */}
        <div className="flex gap-2 p-4 border-t border-gray-200 bg-white flex-shrink-0">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="quick-reserve-form"
            disabled={isSubmitting || !selectedCourt || !selectedTime || !selectedEndTime}
            className="flex-1"
          >
            {isSubmitting ? 'Reserving...' : allSelectedCourts.length > 1 ? `Reserve ${allSelectedCourts.length} Courts` : 'Quick Reserve'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
