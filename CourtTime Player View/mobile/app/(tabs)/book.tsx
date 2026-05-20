/**
 * Book Court Tab
 * Calendar date picker → court selector → time slot grid → booking details → confirm
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  LayoutAnimation,
  useWindowDimensions,
  Switch,
} from 'react-native';
import { showAlert, showApiErrorAlert } from '../../src/utils/alert';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { hapticSuccess, hapticError } from '../../src/utils/haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { MiniCalendar } from '../../src/components/MiniCalendar';
import { CourtCalendarGrid } from '../../src/components/CourtCalendarGrid';
import { TimePicker, PICKER_HEIGHT } from '../../src/components/TimePicker';
import { useAuth } from '../../src/contexts/AuthContext';
import { api, paymentApi } from '../../src/api/client';
import { courtBookingCheckoutUrls } from '../../../shared/utils/mobileCheckoutUrls';
import {
  courtGuestFeeCents,
  courtRequiresPayment,
  formatCentsAsUsd,
  openStripeCheckout,
} from '../../src/utils/payments';
import { Colors, Gradients, Spacing, FontSize, BorderRadius, TouchTarget, FontFamily } from '../../src/constants/theme';
import type { Court } from '../../src/types/database';
import { sortCourtsForDisplay } from '../../../shared/utils/courtDisplayOrder';
import { createRouteErrorBoundary } from '../../src/components/RouteErrorBoundary';
import { Button } from '../../src/components/Button';
import { Input } from '../../src/components/Input';
import { Card } from '../../src/components/Card';
import type { BookingWithDetails } from '../../src/types/database';
import { OfflineBanner } from '../../src/components/OfflineBanner';
import { EmptyState } from '../../src/components/EmptyState';
import { useOfflineApi } from '../../src/hooks/useOfflineApi';
import {
  offerAddBookingToCalendar,
  fetchBookingCalendarDetails,
  addBookingToCalendarWithFeedback,
  bookingWithDetailsToCalendarDetails,
} from '../../src/utils/bookingCalendar';
import { userFacingApiMessage, type ApiFailureShape } from '../../src/utils/apiUserMessages';
import {
  RESERVATION_LABEL_TYPE_KEYS,
  getBookingTypeLabel,
} from '../../../shared/constants/bookingTypes';
import { fetchStrikeLockout, type StrikeLockoutStatus } from '../../../shared/utils/strikeLockout';
import { StrikeLockoutBanner } from '../../src/components/StrikeLockoutBanner';
import {
  buildTimeSlotsFromAvailability,
  parseHHMMToMinutes,
  formatMinutesAsHHMM,
  type CourtAvailabilityData,
  type TimeSlot,
} from '../../../shared/utils/courtAvailability';

export const ErrorBoundary = createRouteErrorBoundary('Book');

type BookModalKind = 'booking' | 'violations' | null;

function paramString(v: string | string[] | undefined): string | undefined {
  if (v == null) return undefined;
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === 'string' && s.length > 0 ? s : undefined;
}

function formatTimeForToast(startHHMM: string): string {
  if (!startHHMM || !startHHMM.includes(':')) return startHHMM || '';
  const [hStr, mStr] = startHHMM.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr || '0', 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return startHHMM;
  const d = new Date(1970, 0, 1, h, m, 0, 0);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

type AvailabilityResponse = CourtAvailabilityData;

function computeAvailableEndTimesHHMM(slots: TimeSlot[], startHHMM: string): string[] {
  const startMin = parseHHMMToMinutes(startHHMM);
  const slotDur =
    slots.length >= 2
      ? parseHHMMToMinutes(slots[1].startTime) - parseHHMMToMinutes(slots[0].startTime)
      : 30;
  const lastSlot = slots[slots.length - 1];
  const closeMin = lastSlot ? parseHHMMToMinutes(lastSlot.endTime) : startMin + 120;
  let maxEnd = closeMin;
  for (const slot of slots) {
    const slotMin = parseHHMMToMinutes(slot.startTime);
    if (slotMin > startMin && !slot.available) {
      maxEnd = slotMin;
      break;
    }
  }
  const ends: string[] = [];
  for (let m = startMin + slotDur; m <= maxEnd; m += slotDur) {
    ends.push(formatMinutesAsHHMM(m));
  }
  return ends;
}

interface RuleViolation {
  ruleCode: string;
  ruleName: string;
  message: string;
  severity?: string;
}

function bookingTypeLabel(typeKey: string): string {
  return getBookingTypeLabel(typeKey);
}

/** Dimmed overlay visible above the booking sheet */
const BOOKING_MODAL_OVERLAY_TOP = 24;
/** Minimum sheet height so time pickers + confirm button remain usable on small phones */
const BOOKING_MODAL_MIN_HEIGHT = 360;

export default function BookCourtScreen() {
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    facilityId?: string;
    bookingDate?: string;
    bookingId?: string;
    bookingPaymentSuccess?: string;
    bookingPaymentCancelled?: string;
    session_id?: string;
  }>();
  const { user, facilityId, facilities, setFacilityId, selectedBookDate, setSelectedBookDate } = useAuth();
  const { bannerState, lastCachedAt, retryConnectivity } = useOfflineApi();
  const facilityList = facilities ?? [];
  const currentFacilityName = facilityList.find(f => f.id === facilityId)?.name;
  /** Avoid applying slot results from a stale availability request after the user picks another court on the grid. */
  const selectedCourtIdRef = useRef<string | null>(null);
  const [courts, setCourts] = useState<Court[]>([]);
  const [selectedDate, setSelectedDate] = useState(selectedBookDate || getTodayString());
  const [selectedCourt, setSelectedCourt] = useState<Court | null>(null);
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [strikeLockout, setStrikeLockout] = useState<StrikeLockoutStatus | null>(null);
  const [booking, setBooking] = useState(false);
  const [quickReserving, setQuickReserving] = useState(false);
  const [calendarExpanded, setCalendarExpanded] = useState(false);
  const [topInfoExpanded, setTopInfoExpanded] = useState(false);
  /** When the day grid has a finger down, disable the outer Book ScrollView so it does not steal vertical drags. */
  const [calendarScrollLocked, setCalendarScrollLocked] = useState(false);
  const onCalendarInteractionLock = useCallback((locked: boolean) => {
    setCalendarScrollLocked(locked);
  }, []);

  const onRequestTodayForGrid = useCallback(() => {
    setSelectedDate(getTodayString());
    setSelectedCourt(null);
  }, []);

  // Booking / rule violations: single modal kind so only one native Modal is active
  const [modalKind, setModalKind] = useState<BookModalKind>(null);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [bookingType, setBookingType] = useState('match');
  const [bookingNotes, setBookingNotes] = useState('');
  const [modalStartTime, setModalStartTime] = useState('');
  const [modalEndTime, setModalEndTime] = useState('');
  const [additionalCourtIds, setAdditionalCourtIds] = useState<string[]>([]);
  const [additionalCourtsExpanded, setAdditionalCourtsExpanded] = useState(false);
  const [recurringBookingExpanded, setRecurringBookingExpanded] = useState(false);
  const [recurringBookingEnabled, setRecurringBookingEnabled] = useState(false);
  const [recurringDays, setRecurringDays] = useState<string[]>([]);
  const [recurringEndDate, setRecurringEndDate] = useState('');
  const [bringGuest, setBringGuest] = useState(false);

  // Rule violations modal payload (shown when modalKind === 'violations')
  const [violations, setViolations] = useState<RuleViolation[]>([]);
  const [warnings, setWarnings] = useState<RuleViolation[]>([]);
  const isAdmin = user?.adminFacilities?.includes(facilityId || '') || false;
  const [selectedCalendarBooking, setSelectedCalendarBooking] = useState<BookingWithDetails | null>(null);
  const [courtLoadError, setCourtLoadError] = useState<ApiFailureShape | null>(null);

  function getTodayString() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  useEffect(() => {
    const fid = paramString(params.facilityId);
    const bdate = paramString(params.bookingDate);
    if (fid && facilityList.some(f => f.id === fid)) {
      setFacilityId(fid);
    }
    if (bdate && /^\d{4}-\d{2}-\d{2}$/.test(bdate)) {
      setSelectedBookDate(bdate);
      setSelectedDate(bdate);
      setSelectedCourt(null);
    }
  }, [params.facilityId, params.bookingDate, facilityList, setFacilityId, setSelectedBookDate]);

  useEffect(() => {
    if (selectedBookDate && selectedBookDate !== selectedDate) {
      setSelectedDate(selectedBookDate);
      setSelectedCourt(null);
    }
  }, [selectedBookDate]);

  useEffect(() => {
    setSelectedBookDate(selectedDate);
  }, [selectedDate, setSelectedBookDate]);

  useEffect(() => {
    selectedCourtIdRef.current = selectedCourt?.id ?? null;
  }, [selectedCourt?.id]);

  useEffect(() => {
    if (modalKind !== null) {
      return;
    }
    setSelectedSlot(null);
    setBookingType('match');
    setBookingNotes('');
    setModalStartTime('');
    setModalEndTime('');
    setAdditionalCourtIds([]);
    setAdditionalCourtsExpanded(false);
    setRecurringBookingExpanded(false);
    setRecurringBookingEnabled(false);
    setRecurringDays([]);
    setRecurringEndDate('');
    setBringGuest(false);
  }, [modalKind]);

  const primaryCourtGuestFee = selectedCourt ? courtGuestFeeCents(selectedCourt) : null;
  const selectedCourtRequiresPayment = selectedCourt ? courtRequiresPayment(selectedCourt) : false;
  const bookingCheckoutUrls = courtBookingCheckoutUrls();

  // ── Fetch courts ──
  const fetchCourts = useCallback(async () => {
    if (!facilityId) {
      setCourts([]);
      setCourtLoadError(null);
      return;
    }
    console.log('[book] fetch courts', {
      facilityId,
      selectedDate,
      courtsUrl: `/api/facilities/${facilityId}/courts`,
      bookingsUrl: `/api/bookings/facility/${facilityId}?date=${selectedDate}`,
      courtConfigFacilityUrl: `/api/court-config/facility/${facilityId}?date=${selectedDate}`,
    });
    const res = await api.get(`/api/facilities/${facilityId}/courts`);
    console.log('[book] courts response', {
      success: res.success,
      errorCategory: res.errorCategory,
      error: res.error,
      hasData: Boolean(res.data),
    });
    if (res.success && res.data) {
      const courtList = Array.isArray(res.data) ? res.data : res.data.courts || [];
      const availableish = courtList.filter((c: Court) => {
        const status = String(c.status || '').toLowerCase();
        return status === '' || status === 'available' || status === 'active';
      });
      const sorted = sortCourtsForDisplay(
        availableish.map((c: any) => ({
          ...c,
          courtType: c.courtType ?? c.court_type,
          courtNumber: c.courtNumber ?? c.court_number,
          parentCourtId: c.parentCourtId ?? c.parent_court_id ?? null,
        }))
      );
      setCourts(sorted.filter((c: any) => !c.isWalkUp) as Court[]);
      setCourtLoadError(null);
    } else {
      setCourts([]);
      setCourtLoadError(res);
    }
  }, [facilityId, selectedDate]);

  // ── Fetch time slots ──
  const fetchTimeSlots = useCallback(async () => {
    if (!selectedCourt) {
      setTimeSlots([]);
      return;
    }

    const courtId = selectedCourt.id;
    const res = await api.get(`/api/court-config/${courtId}/availability?date=${selectedDate}`);
    console.log('[book] fetch slot availability', {
      selectedDate,
      url: `/api/court-config/${courtId}/availability?date=${selectedDate}`,
      success: res.success,
      errorCategory: res.errorCategory,
      error: res.error,
      hasData: Boolean(res.data),
    });

    if (selectedCourtIdRef.current !== courtId) {
      return;
    }

    if (res.success && res.data) {
      const data = res.data as AvailabilityResponse;
      setTimeSlots(buildTimeSlotsFromAvailability(data, selectedDate, getTodayString()));
    } else {
      setTimeSlots([]);
    }
  }, [selectedCourt, selectedDate]);

  useEffect(() => {
    fetchCourts();
  }, [fetchCourts]);

  useEffect(() => {
    setSelectedCourt(null);
  }, [facilityId]);

  useEffect(() => {
    if (!user?.id || !facilityId) {
      setStrikeLockout(null);
      return;
    }
    let cancelled = false;
    fetchStrikeLockout((path) => api.get(path), user.id, facilityId).then((status) => {
      if (!cancelled) setStrikeLockout(status);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id, facilityId]);

  useEffect(() => {
    fetchTimeSlots();
  }, [fetchTimeSlots]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchCourts();
    await fetchTimeSlots();
    setRefreshing(false);
  }, [fetchCourts, fetchTimeSlots]);

  // Complete paid court booking after Stripe redirect
  useEffect(() => {
    const paymentSuccess = paramString(params.bookingPaymentSuccess);
    const sessionId = paramString(params.session_id);
    if (paymentSuccess !== '1' || !user?.id) return;

    let cancelled = false;

    const finish = async (message: string, bookingDate?: string, bookingId?: string) => {
      if (cancelled) return;
      if (bookingDate && /^\d{4}-\d{2}-\d{2}$/.test(bookingDate)) {
        setSelectedDate(bookingDate);
        setSelectedBookDate(bookingDate);
      }
      hapticSuccess();
      const calendarDetails = bookingId
        ? await fetchBookingCalendarDetails(bookingId, currentFacilityName)
        : null;
      offerAddBookingToCalendar(message, calendarDetails, { alertTitle: 'Payment received' });
      void fetchCourts();
      void fetchTimeSlots();
    };

    void (async () => {
      if (!sessionId || sessionId === '{CHECKOUT_SESSION_ID}') {
        const reconcile = await paymentApi.bookings.reconcilePaidBookings();
        if (!cancelled && reconcile.success && reconcile.count && reconcile.count > 0) {
          const firstRecovered = reconcile.recovered?.[0];
          await finish(
            reconcile.count > 1
              ? `${reconcile.count} paid court reservations are on your calendar.`
              : 'Your paid court reservation is on your calendar.',
            firstRecovered?.bookingDate,
            reconcile.count === 1 ? firstRecovered?.bookingId : undefined
          );
        } else if (!cancelled) {
          showAlert('Payment received', 'Refreshing your calendar…');
          void fetchCourts();
        }
        return;
      }

      const response = await paymentApi.bookings.confirmPayment(sessionId);
      if (cancelled) return;
      if (response.success) {
        const bookingDate = (response as { bookingDate?: string }).bookingDate;
        const confirmedBookingId = (response as { bookingId?: string }).bookingId;
        if (confirmedBookingId) {
          await finish('Your paid court reservation is confirmed.', bookingDate, confirmedBookingId);
          return;
        }
        const reconcile = await paymentApi.bookings.reconcilePaidBookings();
        if (reconcile.success && reconcile.count && reconcile.count > 0) {
          const firstRecovered = reconcile.recovered?.[0];
          await finish(
            'Your paid court reservation is on your calendar.',
            firstRecovered?.bookingDate,
            reconcile.count === 1 ? firstRecovered?.bookingId : undefined
          );
        } else {
          showAlert(
            'Payment received',
            'Your reservation is processing. Pull to refresh if it does not appear.'
          );
        }
      } else {
        showAlert(
          'Payment',
          response.error || 'Could not confirm your reservation yet. Pull to refresh.'
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [params.bookingPaymentSuccess, params.session_id, user?.id, fetchCourts, fetchTimeSlots, setSelectedBookDate, currentFacilityName]);

  // ── Handle calendar grid booking selection ──
  /** Load slot list for this court before opening the modal so TimePickers include the dragged range. */
  async function handleCalendarGridSelection(court: Court, startTime: string, endTime: string) {
    try {
      const start5 = startTime.slice(0, 5);
      const end5 = endTime.slice(0, 5);

      const res = await api.get(`/api/court-config/${court.id}/availability?date=${selectedDate}`);

      let slots: TimeSlot[] = [];
      if (!res.success) {
        showApiErrorAlert(res, 'Could not load open times');
        return;
      }

      if (res.data) {
        slots = buildTimeSlotsFromAvailability(res.data as AvailabilityResponse, selectedDate, getTodayString());
      }

      const starts = slots.filter((s) => s.available).map((s) => s.startTime.slice(0, 5));
      if (starts.length === 0) {
        showAlert(
          'Unavailable',
          'Could not load open times for this court. Pull down to refresh and try again.'
        );
        return;
      }

      let pickStart = start5;
      if (!starts.includes(start5)) {
        const target = parseHHMMToMinutes(start5);
        const future = starts
          .filter((s) => parseHHMMToMinutes(s) >= target)
          .sort((a, b) => parseHHMMToMinutes(a) - parseHHMMToMinutes(b));
        pickStart = future[0] ?? starts[0];
      }

      const endOpts = computeAvailableEndTimesHHMM(slots, pickStart);
      let pickEnd = end5;
      if (endOpts.length === 0) {
        pickEnd = formatMinutesAsHHMM(parseHHMMToMinutes(pickStart) + 30);
      } else if (!endOpts.includes(end5)) {
        const targetEnd = parseHHMMToMinutes(end5);
        const atOrBefore = endOpts.filter((e) => parseHHMMToMinutes(e) <= targetEnd);
        pickEnd =
          atOrBefore.length > 0 ? atOrBefore[atOrBefore.length - 1]! : endOpts[endOpts.length - 1]!;
      }
      if (parseHHMMToMinutes(pickEnd) <= parseHHMMToMinutes(pickStart) && endOpts.length > 0) {
        pickEnd = endOpts[0]!;
      }

      selectedCourtIdRef.current = court.id;
      setTimeSlots(slots);
      setSelectedCourt(court);
      setSelectedSlot({
        startTime: pickStart + ':00',
        endTime: pickEnd + ':00',
        available: true,
      });
      setModalStartTime(pickStart);
      setModalEndTime(pickEnd);
      setBookingType('match');
      setBookingNotes('');
      setAdditionalCourtIds([]);
      setAdditionalCourtsExpanded(false);
      setRecurringBookingExpanded(false);
      setRecurringBookingEnabled(false);
      setRecurringDays([]);
      setRecurringEndDate('');
      setModalKind('booking');
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      showAlert('Booking', `Could not open booking from the calendar. ${message}`);
    }
  }

  // ── Quick Reserve (autofill soonest available slot like web) ──
  async function handleQuickReserve() {
    if (!facilityId || courts.length === 0) {
      showAlert('Quick Reserve', 'No courts are available to reserve right now.');
      return;
    }

    setQuickReserving(true);

    const today = getTodayString();
    const now = new Date();

    try {
      const availabilityResults = await Promise.all(
        courts.map(async (court) => {
          const res = await api.get(`/api/court-config/${court.id}/availability?date=${today}`);
          return { court, res };
        })
      );

      type Candidate = { court: Court; startTime: string; endTime: string };
      const candidates: Candidate[] = [];

      for (const { court, res } of availabilityResults) {
        if (!res.success || !res.data || !res.data.isOpen) continue;

        const data = res.data as AvailabilityResponse;
        const slotDur = data.slotDuration || 30;
        const slotsNeeded = Math.ceil(60 / slotDur); // Quick Reserve defaults to 1 hour
        const bookedTimes = new Set((data.existingBookings || []).map((b) => b.startTime));
        const [openH, openM] = data.operatingHours.open.split(':').map(Number);
        const [closeH, closeM] = data.operatingHours.close.split(':').map(Number);
        const closeMinutes = closeH * 60 + closeM;

        let h = openH;
        let m = openM;

        while (h < closeH || (h === closeH && m < closeM)) {
          const slotPast = h < now.getHours() || (h === now.getHours() && m <= now.getMinutes());
          if (!slotPast) {
            let checkH = h;
            let checkM = m;
            let contiguous = true;

            for (let i = 0; i < slotsNeeded; i++) {
              const checkTime = `${String(checkH).padStart(2, '0')}:${String(checkM).padStart(2, '0')}:00`;
              const checkMinutes = checkH * 60 + checkM;
              if (checkMinutes >= closeMinutes || bookedTimes.has(checkTime)) {
                contiguous = false;
                break;
              }
              checkM += slotDur;
              if (checkM >= 60) {
                checkH += Math.floor(checkM / 60);
                checkM = checkM % 60;
              }
            }

            if (contiguous) {
              const startTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
              const endMinutes = h * 60 + m + 60;
              const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}:00`;
              candidates.push({ court, startTime, endTime });
              break; // earliest valid slot for this court found
            }
          }

          m += slotDur;
          if (m >= 60) {
            h += Math.floor(m / 60);
            m = m % 60;
          }
        }
      }

      if (candidates.length === 0) {
        showAlert('Quick Reserve', 'No open 1-hour slots are available today.');
        return;
      }

      candidates.sort((a, b) => a.startTime.localeCompare(b.startTime));
      const best = candidates[0];

      setSelectedDate(today);
      setCalendarExpanded(false);
      setSelectedCourt(best.court);
      setSelectedSlot({ startTime: best.startTime, endTime: best.endTime, available: true });
      setModalStartTime(best.startTime.slice(0, 5));
      setModalEndTime(best.endTime.slice(0, 5));
      setBookingType('match');
      setBookingNotes('');
      setAdditionalCourtIds([]);
      setAdditionalCourtsExpanded(false);
      setRecurringBookingExpanded(false);
      setRecurringBookingEnabled(false);
      setRecurringDays([]);
      setRecurringEndDate('');
      setModalKind('booking');
    } catch {
      showAlert('Quick Reserve', 'Could not load quick reserve availability. Please try again.');
    } finally {
      setQuickReserving(false);
    }
  }

  // ── Calculate duration ──
  function calcDuration(startTime: string, endTime: string): number {
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    return (eh * 60 + em) - (sh * 60 + sm);
  }

  // ── Submit booking ──
  async function handleConfirmBooking() {
    console.log('[book.confirm] start', {
      hasSelectedCourt: Boolean(selectedCourt),
      selectedCourtId: selectedCourt?.id,
      hasUser: Boolean(user),
      userId: user?.id,
      facilityId,
      modalStartTime,
      modalEndTime,
      bookingType,
      additionalCourtIds,
    });

    if (!facilityId) {
      showAlert('Booking failed', 'No club selected. Please pick a club from the header and try again.');
      hapticError();
      return;
    }
    if (!user) {
      showAlert('Booking failed', 'Your session expired. Please log in again.');
      hapticError();
      return;
    }
    if (!selectedCourt) {
      showAlert('Booking failed', 'Please pick a court before confirming.');
      hapticError();
      return;
    }
    if (!modalStartTime || !modalEndTime) {
      showAlert('Booking failed', 'Please pick a start and end time.');
      hapticError();
      return;
    }

    const startTime = modalStartTime + ':00';
    const endTime = modalEndTime + ':00';

    if (toMinutes(modalEndTime) <= toMinutes(modalStartTime)) {
      console.log('[book.confirm] invalid time range', { modalStartTime, modalEndTime });
      showAlert('Invalid Time', 'End time must be after start time.');
      hapticError();
      return;
    }

    setBooking(true);

    const extraCourtIds = additionalCourtIds.filter((id) => id !== selectedCourt.id);
    const allCourtIds = [selectedCourt.id, ...extraCourtIds];

    const extraCourtsRequirePayment = extraCourtIds.some((id) => {
      const court = courts.find((c) => c.id === id);
      return court ? courtRequiresPayment(court) : false;
    });
    const needsPaidCheckout =
      selectedCourtRequiresPayment ||
      extraCourtsRequirePayment ||
      Boolean(bringGuest && primaryCourtGuestFee);
    if (needsPaidCheckout && allCourtIds.length > 1) {
      showAlert(
        'Paid booking',
        'Paid courts and guest fees must be booked one court at a time.'
      );
      hapticError();
      setBooking(false);
      return;
    }

    if (isAdmin && recurringBookingEnabled) {
      if (needsPaidCheckout) {
        showAlert(
          'Paid booking',
          'Paid courts and guest fees cannot be booked as a recurring series. Book one reservation at a time.'
        );
        hapticError();
        setBooking(false);
        return;
      }
      if (recurringDays.length === 0) {
        showAlert('Recurring Booking', 'Select at least one day of the week.');
        hapticError();
        setBooking(false);
        return;
      }
      if (!recurringEndDate) {
        showAlert('Recurring Booking', 'Please set a repeat-until date.');
        hapticError();
        setBooking(false);
        return;
      }
      if (new Date(recurringEndDate + 'T00:00:00') < new Date(selectedDate + 'T00:00:00')) {
        showAlert('Recurring Booking', 'Repeat-until date must be on or after the booking date.');
        hapticError();
        setBooking(false);
        return;
      }

      const recurringDates = generateRecurringDates();
      const durationMinutes = calcDuration(startTime, endTime);
      const instances = recurringDates.flatMap((bookingDate) =>
        allCourtIds.map((courtId) => ({
          courtId,
          bookingDate,
          startTime,
          endTime,
          durationMinutes,
        }))
      );

      const recurringRes = await api.post('/api/bookings/recurring-series', {
        userId: user.id,
        facilityId,
        bookingType,
        notes: bookingNotes.trim() || undefined,
        instances,
      });

      if (recurringRes.success) {
        setModalKind(null);
        hapticSuccess();
        showAlert(
          'Booked!',
          `Created ${instances.length} recurring booking${instances.length === 1 ? '' : 's'} (${recurringDates.length} date${recurringDates.length === 1 ? '' : 's'}${allCourtIds.length > 1 ? ` x ${allCourtIds.length} courts` : ''}).`
        );
        fetchTimeSlots();
      } else if (recurringRes.ruleViolations && recurringRes.ruleViolations.length > 0) {
        hapticError();
        setViolations(recurringRes.ruleViolations as RuleViolation[]);
        setWarnings((recurringRes.warnings || []) as RuleViolation[]);
        setModalKind('violations');
      } else {
        hapticError();
        showAlert('Booking Failed', recurringRes.error || 'Could not create recurring booking series.');
      }
      setBooking(false);
      return;
    }

    let allSuccess = true;
    let firstError: string | null = null;
    let firstViolations: RuleViolation[] | null = null;
    let firstWarnings: RuleViolation[] = [];

    const priorInThisRequest: Array<{
      bookingDate: string;
      courtId: string;
      startTime: string;
      endTime: string;
      durationMinutes: number;
    }> = [];

    for (const courtId of allCourtIds) {
      const bookingData = {
        courtId,
        facilityId,
        userId: user.id,
        bookingDate: selectedDate,
        startTime,
        endTime,
        durationMinutes: calcDuration(startTime, endTime),
        bookingType,
        notes: bookingNotes.trim() || undefined,
        ...bookingCheckoutUrls,
        bringGuest: bringGuest || undefined,
        ...(priorInThisRequest.length > 0
          ? { provisionalSameRequestBookings: [...priorInThisRequest] }
          : {}),
      };

      console.log('[book.confirm] POST /api/bookings', { courtId, bookingData });
      const res = await paymentApi.bookings.create(bookingData);
      console.log('[book.confirm] response', {
        courtId,
        success: res.success,
        errorCategory: res.errorCategory,
        error: res.error,
        hasViolations: Array.isArray(res.ruleViolations) && res.ruleViolations.length > 0,
      });

      if (res.requiresPayment && res.checkoutUrl) {
        setModalKind(null);
        setBooking(false);
        const opened = await openStripeCheckout(res.checkoutUrl);
        if (!opened) {
          showAlert('Payment', 'Could not open Stripe checkout. Try again.');
          hapticError();
        } else {
          showAlert(
            'Complete payment',
            'Finish card payment in your browser to confirm this court reservation.'
          );
        }
        return;
      }

      if (!res.success) {
        allSuccess = false;
        if (res.ruleViolations && res.ruleViolations.length > 0 && !firstViolations) {
          firstViolations = res.ruleViolations as RuleViolation[];
          firstWarnings = (res.warnings || []) as RuleViolation[];
        } else if (!firstError) {
          firstError = res.error || 'Could not complete booking.';
        }
        break;
      }

      priorInThisRequest.push({
        bookingDate: selectedDate,
        courtId,
        startTime,
        endTime,
        durationMinutes: calcDuration(startTime, endTime),
      });
    }

    if (allSuccess) {
      setModalKind(null);
      hapticSuccess();
      const primaryName = selectedCourt.name;
      const timeLabel = formatTimeForToast(modalStartTime);
      const bookedBody =
        allCourtIds.length > 1
          ? `${primaryName} (+ ${allCourtIds.length - 1} more) on ${selectedDateLabel} at ${timeLabel}.`
          : `${primaryName} on ${selectedDateLabel} at ${timeLabel}.`;
      offerAddBookingToCalendar(
        bookedBody,
        allCourtIds.length === 1
          ? {
              title: currentFacilityName ? `${currentFacilityName} - ${primaryName}` : `Court booking - ${primaryName}`,
              bookingDate: selectedDate,
              startTime,
              endTime,
              location: currentFacilityName,
              notes: [
                'Booked from CourtTime.',
                `Booking type: ${bookingTypeLabel(bookingType)}.`,
                bookingNotes.trim() ? `Notes: ${bookingNotes.trim()}` : null,
              ]
                .filter(Boolean)
                .join('\n'),
            }
          : null
      );
      fetchTimeSlots();
    } else if (firstViolations) {
      hapticError();
      setViolations(firstViolations);
      setWarnings(firstWarnings);
      setModalKind('violations');
    } else {
      hapticError();
      showAlert('Booking Failed', firstError || 'Could not complete booking.');
    }
    setBooking(false);
  }

  // ── Admin override booking ──
  async function handleAdminOverride() {
    if (!selectedCourt || !user || !facilityId || !selectedSlot) return;

    setBooking(true);

    const res = await api.post('/api/bookings/admin-override', {
      courtId: selectedCourt.id,
      facilityId,
      userId: user.id,
      bookingDate: selectedDate,
      startTime: selectedSlot.startTime,
      endTime: selectedSlot.endTime,
      durationMinutes: calcDuration(selectedSlot.startTime, selectedSlot.endTime),
      bookingType,
      notes: bookingNotes.trim() || undefined,
      overriddenBy: user.id,
      overrideReason: 'Admin override from mobile app',
      overrideRules: violations.map(v => v.ruleCode),
    });

    setModalKind(null);
    if (res.success) {
      hapticSuccess();
      offerAddBookingToCalendar(
        'Booking created with admin override.',
        {
          title: currentFacilityName ? `${currentFacilityName} - ${selectedCourt.name}` : `Court booking - ${selectedCourt.name}`,
          bookingDate: selectedDate,
          startTime: selectedSlot.startTime,
          endTime: selectedSlot.endTime,
          location: currentFacilityName,
          notes: [
            'Booked from CourtTime.',
            `Booking type: ${bookingTypeLabel(bookingType)}.`,
            bookingNotes.trim() ? `Notes: ${bookingNotes.trim()}` : null,
            'Created with admin override.',
          ]
            .filter(Boolean)
            .join('\n'),
        }
      );
      fetchTimeSlots();
    } else {
      showAlert('Override Failed', res.error || 'Could not complete booking.');
    }
    setBooking(false);
  }

  // ── Helpers ──
  const toMinutes = (t: string) => {
    const p = t.split(':');
    return parseInt(p[0]) * 60 + parseInt(p[1] || '0');
  };

  // Get available start times (slots that are not booked and not in the past)
  const getAvailableStartTimes = (): string[] => {
    return timeSlots.filter(s => s.available).map(s => s.startTime.slice(0, 5));
  };

  // Get available end times based on selected start time
  // Max end = next booking start time or closing time, whichever comes first
  // Min end = start + 30 min (one slot)
  const getAvailableEndTimes = (startTime: string): string[] =>
    computeAvailableEndTimesHHMM(timeSlots, startTime);

  // Toggle additional court
  const toggleAdditionalCourt = (courtId: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setAdditionalCourtIds(prev =>
      prev.includes(courtId) ? prev.filter(id => id !== courtId) : [...prev, courtId]
    );
  };

  const selectedDateLabel = new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const generateRecurringDates = (): string[] => {
    if (!recurringBookingEnabled || recurringDays.length === 0 || !recurringEndDate) {
      return [selectedDate];
    }
    const start = new Date(selectedDate + 'T00:00:00');
    const end = new Date(recurringEndDate + 'T00:00:00');
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
      return [selectedDate];
    }
    const dates: string[] = [];
    const cur = new Date(start);
    while (cur <= end) {
      if (recurringDays.includes(dayNames[cur.getDay()]!)) {
        dates.push(
          `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`
        );
      }
      cur.setDate(cur.getDate() + 1);
    }
    return dates.length > 0 ? dates : [selectedDate];
  };

  const toggleRecurringDay = (day: string) => {
    setRecurringDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  };

  const stepDate = (deltaDays: number) => {
    const base = new Date(selectedDate + 'T00:00:00');
    base.setDate(base.getDate() + deltaDays);
    const next = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-${String(base.getDate()).padStart(2, '0')}`;
    setSelectedDate(next);
    setSelectedCourt(null);
  };

  const bookingModalMaxHeight = Math.max(
    BOOKING_MODAL_MIN_HEIGHT,
    Math.round(
      windowHeight - insets.top - insets.bottom - BOOKING_MODAL_OVERLAY_TOP
    )
  );
  const bookingModalFooterPaddingBottom = Math.max(insets.bottom, Spacing.lg);

  const formatTimeLabel = (time: string) => {
    const [h, m] = time.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
  };

  const onBookedSlotPress = useCallback((court: Court, booking: any) => {
    const bookingId = booking.id || booking.bookingId || booking.booking_id || `${court.id}_${selectedDate}_${booking.startTime}`;
    const bookingUserId = booking.userId || booking.user_id || '';
    const bookingDate = booking.bookingDate || booking.booking_date || selectedDate;
    const bookingStart = booking.startTime || booking.start_time || '';
    const bookingEnd = booking.endTime || booking.end_time || '';
    const bookingUserName = booking.userName || booking.user_name || 'Member';
    const bookingType = booking.bookingType || booking.booking_type;
    const bookingNotes = booking.notes || booking.booking_notes;

    const mapped: BookingWithDetails = {
      id: bookingId,
      courtId: court.id,
      userId: bookingUserId,
      facilityId: facilityId || '',
      bookingDate: bookingDate as any,
      startTime: bookingStart,
      endTime: bookingEnd,
      durationMinutes: calcDuration(bookingStart, bookingEnd),
      status: 'confirmed',
      bookingType,
      notes: bookingNotes,
      createdAt: new Date().toISOString() as any,
      updatedAt: new Date().toISOString() as any,
      courtName: court.name,
      facilityName: 'CourtTime',
      userName: bookingUserName,
      userEmail: '',
    };
    setSelectedCalendarBooking(mapped);
  }, [facilityId, selectedDate]);

  const handleCancelSelectedBooking = async () => {
    if (!selectedCalendarBooking || !user) return;
    const res = await api.delete(`/api/bookings/${selectedCalendarBooking.id}?userId=${user.id}`);
    if (res.success) {
      showAlert('Cancelled', 'Booking was cancelled successfully.');
      setSelectedCalendarBooking(null);
      fetchCourts();
      fetchTimeSlots();
    } else {
      showApiErrorAlert(res, 'Could not cancel');
    }
  };

  return (
    <View style={styles.screenRoot}>
      <ScrollView
        style={styles.container}
        scrollEnabled={!calendarScrollLocked}
        nestedScrollEnabled
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
      <OfflineBanner state={bannerState} cachedAt={lastCachedAt} onRetry={retryConnectivity} />
      <StrikeLockoutBanner status={strikeLockout} />
      {!facilityId && (
        <View style={styles.noFacility}>
          <Ionicons name="warning-outline" size={20} color={Colors.warning} />
          <Text style={styles.noFacilityText}>
            You are not a member of any facility yet. Join a facility from your Profile.
          </Text>
        </View>
      )}

      {/* ── Calendar ── */}
      <LinearGradient
        colors={[...Gradients.bookCalendar]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.calendarSection}
      >
        <View style={styles.dayNavRow}>
          <TouchableOpacity
            style={styles.dayArrow}
            onPress={() => stepDate(-1)}
            accessibilityRole="button"
            accessibilityLabel="Previous day"
          >
            <Ionicons name="chevron-back" size={18} color={Colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.datePill}
            onPress={() => setCalendarExpanded(v => !v)}
            accessibilityRole="button"
            accessibilityLabel={`Selected date ${selectedDateLabel}. Tap to ${calendarExpanded ? 'collapse' : 'expand'} calendar.`}
          >
            <Ionicons name="calendar" size={16} color={Colors.primary} />
            <Text style={styles.datePillText}>{selectedDateLabel}</Text>
            <Ionicons
              name={calendarExpanded ? 'chevron-up' : 'chevron-down'}
              size={14}
              color={Colors.textMuted}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.dayArrow}
            onPress={() => stepDate(1)}
            accessibilityRole="button"
            accessibilityLabel="Next day"
          >
            <Ionicons name="chevron-forward" size={18} color={Colors.primary} />
          </TouchableOpacity>
        </View>

        <View style={styles.compactToolsRow}>
          <Text
            style={styles.compactToolsText}
            numberOfLines={1}
            accessibilityRole="text"
          >
            {facilityId && currentFacilityName ? `Booking at ${currentFacilityName}` : 'Choose a club to book'}
          </Text>
          <TouchableOpacity
            style={styles.compactToolsToggle}
            onPress={() => setTopInfoExpanded((value) => !value)}
            accessibilityRole="button"
            accessibilityLabel={`${topInfoExpanded ? 'Hide' : 'Show'} booking tools`}
            accessibilityState={{ expanded: topInfoExpanded }}
          >
            <Text style={styles.compactToolsToggleText}>{topInfoExpanded ? 'Less' : 'More'}</Text>
            <Ionicons
              name={topInfoExpanded ? 'chevron-up' : 'chevron-down'}
              size={14}
              color={Colors.textMuted}
            />
          </TouchableOpacity>
        </View>

        {topInfoExpanded && (
          <View style={styles.quickReserveRow}>
            <Button
              title="Quick Reserve"
              onPress={handleQuickReserve}
              disabled={!facilityId}
              loading={quickReserving}
              leftIcon={<Ionicons name="flash" size={14} color={Colors.textInverse} />}
              style={styles.quickReserveButton}
            />
          </View>
        )}

        {calendarExpanded && (
          <MiniCalendar
            selectedDate={selectedDate}
            onSelectDate={(date) => {
              console.log('[book] selectedDate from MiniCalendar', date);
              setSelectedDate(date);
              setSelectedCourt(null);
              setCalendarExpanded(false);
            }}
            minDate={getTodayString()}
          />
        )}
      </LinearGradient>

      {/* ══════ CALENDAR GRID (Website-style default view) ══════ */}
      {facilityId && courtLoadError ? (
        <EmptyState
          icon={courtLoadError.errorCategory === 'offline' ? 'cloud-offline-outline' : 'alert-circle-outline'}
          title={courtLoadError.errorCategory === 'offline' ? 'You are offline' : 'Could not load courts'}
          description={userFacingApiMessage(courtLoadError)}
          actionLabel="Try again"
          onAction={() => {
            void fetchCourts();
          }}
        />
      ) : facilityId ? (
        <CourtCalendarGrid
          courts={courts}
          selectedDate={selectedDate}
          facilityId={facilityId}
          onBookingSelected={handleCalendarGridSelection}
          onBookedSlotPress={onBookedSlotPress}
          onInteractionLockChange={onCalendarInteractionLock}
          onRequestToday={onRequestTodayForGrid}
        />
      ) : null}

      <View style={{ height: Spacing.xl }} />
      </ScrollView>

      {/* ── Booking Details Modal (sibling of main ScrollView — avoids scroll gesture capture) ── */}
      <Modal
        visible={modalKind === 'booking'}
        transparent
        animationType="slide"
        presentationStyle={Platform.OS === 'ios' ? 'overFullScreen' : undefined}
        onRequestClose={() => setModalKind(null)}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalKeyboardAvoid}
          >
            <View style={[styles.modalBookingSheet, { maxHeight: bookingModalMaxHeight, height: bookingModalMaxHeight }]}>
              <View style={styles.modalBookingHeader}>
                <Text style={styles.modalTitle}>Booking Details</Text>
                <Pressable
                  testID="dismiss-booking-modal"
                  onPress={() => setModalKind(null)}
                  style={({ pressed }) => [styles.modalIconHit, pressed && styles.pressedOpacity]}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                >
                  <Ionicons name="close" size={24} color={Colors.textSecondary} />
                </Pressable>
              </View>

              <ScrollView
                style={styles.modalBookingBody}
                contentContainerStyle={styles.modalBookingScrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator
                bounces={false}
                nestedScrollEnabled
              >
                {/* Summary */}
                <Card style={styles.modalSummary} padded>
                  <Text style={styles.summaryCourtName}>{selectedCourt?.name}</Text>
                  <Text style={styles.summaryDate}>{selectedDateLabel}</Text>
                </Card>

                {/* Time Pickers */}
                <Text style={styles.modalLabel}>Select Time</Text>
                <View style={styles.timePickerRow}>
                  <View style={styles.timePickerColumn}>
                    <TimePicker
                      label="Start"
                      times={getAvailableStartTimes()}
                      selectedTime={modalStartTime}
                      onSelect={(t) => {
                        setModalStartTime(t);
                        const ends = getAvailableEndTimes(t);
                        if (ends.length > 0 && (toMinutes(modalEndTime) <= toMinutes(t) || !ends.includes(modalEndTime))) {
                          setModalEndTime(ends[0]);
                        }
                      }}
                    />
                  </View>
                  <View style={styles.timePickerDivider}>
                    <Text style={styles.timePickerDividerText}>to</Text>
                  </View>
                  <View style={styles.timePickerColumn}>
                    <TimePicker
                      label="End"
                      times={getAvailableEndTimes(modalStartTime)}
                      selectedTime={modalEndTime}
                      onSelect={setModalEndTime}
                    />
                  </View>
                </View>

                {/* Duration display */}
                {modalStartTime && modalEndTime && toMinutes(modalEndTime) > toMinutes(modalStartTime) && (
                  <View style={styles.durationBadge}>
                    <Ionicons name="time-outline" size={14} color={Colors.primary} />
                    <Text style={styles.durationText}>
                      {calcDuration(modalStartTime + ':00', modalEndTime + ':00')} minutes
                    </Text>
                  </View>
                )}

                {/* Booking Type */}
                <Text style={styles.modalLabel}>Booking Type</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  style={{ marginBottom: Spacing.sm }}
                >
                  <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                    {RESERVATION_LABEL_TYPE_KEYS.map((key) => (
                      <TouchableOpacity
                        key={key}
                        style={[styles.typeChip, bookingType === key && styles.typeChipSelected]}
                        onPress={() => setBookingType(key)}
                        accessibilityRole="button"
                        accessibilityLabel={`${getBookingTypeLabel(key)} booking type`}
                        accessibilityState={{ selected: bookingType === key }}
                      >
                        <Text style={[styles.typeChipText, bookingType === key && styles.typeChipTextSelected]}>
                          {getBookingTypeLabel(key)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>

                {/* Additional Courts (Admin only) */}
                {isAdmin && courts.length > 1 && (
                  <>
                    <TouchableOpacity
                      style={styles.dropdownToggle}
                      onPress={() => setAdditionalCourtsExpanded(v => !v)}
                      accessibilityRole="button"
                      accessibilityLabel={`${additionalCourtsExpanded ? 'Collapse' : 'Expand'} additional courts`}
                    >
                      <Text style={styles.modalLabel}>Additional Courts (Admin)</Text>
                      <Ionicons
                        name={additionalCourtsExpanded ? 'chevron-up' : 'chevron-down'}
                        size={16}
                        color={Colors.textMuted}
                      />
                    </TouchableOpacity>
                    {additionalCourtsExpanded && (
                      <View style={styles.additionalCourtsWrap}>
                        {courts.filter(c => c.id !== selectedCourt?.id).map(court => (
                          <TouchableOpacity
                            key={court.id}
                            style={[styles.typeChip, additionalCourtIds.includes(court.id) && styles.typeChipSelected]}
                            onPress={() => toggleAdditionalCourt(court.id)}
                            accessibilityRole="button"
                            accessibilityLabel={`Add ${court.name} to this booking`}
                            accessibilityState={{ selected: additionalCourtIds.includes(court.id) }}
                          >
                            <Text style={[styles.typeChipText, additionalCourtIds.includes(court.id) && styles.typeChipTextSelected]}>
                              {court.name}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </>
                )}

                {/* Recurring Booking (Admin only) */}
                {isAdmin && (
                  <>
                    <TouchableOpacity
                      style={styles.dropdownToggle}
                      onPress={() => setRecurringBookingExpanded(v => !v)}
                      accessibilityRole="button"
                      accessibilityLabel={`${recurringBookingExpanded ? 'Collapse' : 'Expand'} recurring booking options`}
                    >
                      <Text style={styles.modalLabel}>Recurring Booking (Admin)</Text>
                      <Ionicons
                        name={recurringBookingExpanded ? 'chevron-up' : 'chevron-down'}
                        size={16}
                        color={Colors.textMuted}
                      />
                    </TouchableOpacity>
                    {recurringBookingExpanded && (
                      <View style={styles.recurringWrap}>
                        <View style={styles.recurringModeRow}>
                          <TouchableOpacity
                            style={[styles.typeChip, !recurringBookingEnabled && styles.typeChipSelected]}
                            onPress={() => setRecurringBookingEnabled(false)}
                            accessibilityRole="button"
                            accessibilityLabel="Create a one time booking"
                            accessibilityState={{ selected: !recurringBookingEnabled }}
                          >
                            <Text style={[styles.typeChipText, !recurringBookingEnabled && styles.typeChipTextSelected]}>
                              One-time
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.typeChip, recurringBookingEnabled && styles.typeChipSelected]}
                            onPress={() => setRecurringBookingEnabled(true)}
                            accessibilityRole="button"
                            accessibilityLabel="Create a weekly recurring booking"
                            accessibilityState={{ selected: recurringBookingEnabled }}
                          >
                            <Text style={[styles.typeChipText, recurringBookingEnabled && styles.typeChipTextSelected]}>
                              Weekly recurring
                            </Text>
                          </TouchableOpacity>
                        </View>
                        {recurringBookingEnabled && (
                          <View style={styles.recurringOptionsWrap}>
                            <Text style={styles.recurringSectionLabel}>Days of week</Text>
                            <View style={styles.recurringDaysRow}>
                              {dayNames.map((day) => (
                                <TouchableOpacity
                                  key={day}
                                  style={[styles.weekChip, recurringDays.includes(day) && styles.weekChipSelected]}
                                  onPress={() => toggleRecurringDay(day)}
                                  accessibilityRole="button"
                                  accessibilityLabel={`Repeat on ${day}`}
                                  accessibilityState={{ selected: recurringDays.includes(day) }}
                                >
                                  <Text style={[styles.weekChipText, recurringDays.includes(day) && styles.weekChipTextSelected]}>
                                    {day.slice(0, 3)}
                                  </Text>
                                </TouchableOpacity>
                              ))}
                            </View>

                            <Text style={[styles.recurringSectionLabel, { marginTop: Spacing.xs }]}>Repeat until (YYYY-MM-DD)</Text>
                            <Input
                              value={recurringEndDate}
                              onChangeText={setRecurringEndDate}
                              placeholder={selectedDate}
                              keyboardType="numbers-and-punctuation"
                              autoCapitalize="none"
                              autoCorrect={false}
                            />

                            {recurringDays.length > 0 && recurringEndDate ? (
                              <View style={styles.recurringSummaryBox}>
                                <Text style={styles.recurringSummaryText}>
                                  Every {recurringDays.join(', ')} through {recurringEndDate}
                                </Text>
                                <Text style={styles.recurringSummaryTextStrong}>
                                  Total bookings: {generateRecurringDates().length * (1 + additionalCourtIds.length)}
                                </Text>
                              </View>
                            ) : null}
                          </View>
                        )}
                      </View>
                    )}
                  </>
                )}

                {primaryCourtGuestFee && additionalCourtIds.length === 0 && !recurringBookingEnabled ? (
                  <View style={styles.guestFeeRow}>
                    <View style={styles.guestFeeText}>
                      <Text style={styles.modalLabel}>Bringing a guest</Text>
                      <Text style={styles.guestFeeHint}>
                        +{formatCentsAsUsd(primaryCourtGuestFee)} guest fee
                      </Text>
                    </View>
                    <Switch
                      value={bringGuest}
                      onValueChange={setBringGuest}
                      trackColor={{ false: Colors.border, true: Colors.primary + '88' }}
                      thumbColor={bringGuest ? Colors.primary : Colors.textMuted}
                    />
                  </View>
                ) : null}

                {(selectedCourtRequiresPayment || (bringGuest && primaryCourtGuestFee)) &&
                additionalCourtIds.length === 0 ? (
                  <Text style={styles.paidBookingHint}>
                    Card payment via Stripe is required to confirm this reservation.
                  </Text>
                ) : null}

                {/* Notes */}
                <Text style={styles.modalLabel}>Notes (optional)</Text>
                <Input
                  style={styles.notesInput}
                  value={bookingNotes}
                  onChangeText={setBookingNotes}
                  placeholder="Special requests or notes..."
                  accessibilityLabel="Booking notes"
                  multiline
                  maxLength={200}
                />
              </ScrollView>

              <View style={[styles.modalBookingFooter, { paddingBottom: bookingModalFooterPaddingBottom }]}>
                <Button
                  title={
                    additionalCourtIds.length > 0
                      ? `Book ${1 + additionalCourtIds.length} Courts`
                      : selectedCourtRequiresPayment || (bringGuest && primaryCourtGuestFee)
                        ? 'Pay and Book'
                        : 'Confirm Booking'
                  }
                  onPress={handleConfirmBooking}
                  loading={booking}
                  style={styles.confirmButton}
                />
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ── Rule Violations Modal ── */}
      <Modal
        visible={modalKind === 'violations'}
        transparent
        animationType="fade"
        presentationStyle={Platform.OS === 'ios' ? 'overFullScreen' : undefined}
        onRequestClose={() => setModalKind(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: Colors.error }]}>Booking Not Allowed</Text>
              <Pressable
                onPress={() => setModalKind(null)}
                style={({ pressed }) => [styles.modalIconHit, pressed && styles.pressedOpacity]}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </Pressable>
            </View>

            <Text style={styles.violationSubtitle}>
              This booking violates the following facility rules:
            </Text>

            <ScrollView style={{ maxHeight: 250 }}>
              {violations.map((v, i) => (
                <View key={i} style={styles.violationCard}>
                  <Ionicons name="alert-circle" size={20} color={Colors.error} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.violationRuleName}>{v.ruleName}</Text>
                    <Text style={styles.violationMessage}>{v.message}</Text>
                  </View>
                </View>
              ))}
              {warnings.length > 0 && (
                <>
                  <Text style={[styles.violationSubtitle, { marginTop: Spacing.md }]}>Warnings:</Text>
                  {warnings.map((w, i) => (
                    <View key={`w-${i}`} style={[styles.violationCard, { borderLeftColor: Colors.warning }]}>
                      <Ionicons name="warning" size={20} color={Colors.warning} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.violationRuleName}>{w.ruleName}</Text>
                        <Text style={styles.violationMessage}>{w.message}</Text>
                      </View>
                    </View>
                  ))}
                </>
              )}
            </ScrollView>

            <Button variant="secondary" title="Dismiss" onPress={() => setModalKind(null)} style={styles.confirmButton} />

            {/* Admin Override */}
            {isAdmin && (
              <Button
                variant="warning"
                title="Override as Admin"
                onPress={handleAdminOverride}
                loading={booking}
                style={{ marginTop: Spacing.sm }}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* ── Calendar Booking Details ── */}
      <Modal
        visible={selectedCalendarBooking !== null}
        transparent
        animationType="fade"
        presentationStyle={Platform.OS === 'ios' ? 'overFullScreen' : undefined}
        onRequestClose={() => setSelectedCalendarBooking(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Booking Details</Text>
              <Pressable
                onPress={() => setSelectedCalendarBooking(null)}
                style={({ pressed }) => [styles.modalIconHit, pressed && styles.pressedOpacity]}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </Pressable>
            </View>
            {selectedCalendarBooking && (
              <>
                <Text style={styles.summaryCourtName}>{selectedCalendarBooking.courtName}</Text>
                <Text style={styles.summaryDate}>
                  {new Date(String(selectedCalendarBooking.bookingDate)).toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </Text>
                <Text style={[styles.summaryDate, { marginTop: 2 }]}>
                  {formatTimeLabel(selectedCalendarBooking.startTime)} - {formatTimeLabel(selectedCalendarBooking.endTime)}
                </Text>
                <Text style={[styles.summaryDate, { marginTop: 2 }]}>
                  Booked by: {selectedCalendarBooking.userName || 'Member'}
                </Text>
                {selectedCalendarBooking.bookingType ? (
                  <Text style={[styles.summaryDate, { marginTop: 2 }]}>Type: {selectedCalendarBooking.bookingType}</Text>
                ) : null}

                {user && (selectedCalendarBooking.userId === user.id || isAdmin) ? (
                  <View style={{ marginTop: Spacing.md, gap: Spacing.sm }}>
                    {selectedCalendarBooking.userId === user.id && Platform.OS !== 'web' ? (
                      <Button
                        title="Add to Calendar"
                        variant="secondary"
                        onPress={() => {
                          void addBookingToCalendarWithFeedback(
                            bookingWithDetailsToCalendarDetails(selectedCalendarBooking, {
                              facilityName: currentFacilityName,
                            }),
                            { bookingConfirmed: false }
                          );
                        }}
                      />
                    ) : null}
                    <Button
                      title="Edit Booking"
                      variant="secondary"
                      onPress={async () => {
                        const court = courts.find((c) => c.id === selectedCalendarBooking.courtId);
                        if (!court) {
                          showAlert('Error', 'Could not find this court to open booking details.');
                          return;
                        }
                        setSelectedCalendarBooking(null);
                        await handleCalendarGridSelection(
                          court,
                          selectedCalendarBooking.startTime,
                          selectedCalendarBooking.endTime
                        );
                      }}
                    />
                    <Button
                      title="Cancel Booking"
                      variant="destructive"
                      onPress={handleCancelSelectedBooking}
                    />
                  </View>
                ) : (
                  <Text style={[styles.violationMessage, { marginTop: Spacing.md }]}>
                    You can only edit or cancel your own bookings.
                  </Text>
                )}
              </>
            )}
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  screenRoot: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  container: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  noFacility: {
    flexDirection: 'row',
    margin: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.warning + '15',
    borderRadius: BorderRadius.md,
    borderLeftWidth: 3,
    borderLeftColor: Colors.warning,
    gap: Spacing.sm,
    alignItems: 'center',
  },
  noFacilityText: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.text,
  },

  // ── Calendar ──
  calendarSection: {
    marginHorizontal: Spacing.md,
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.primary + '22',
    shadowColor: Colors.primaryDark,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 4,
  },
  dayNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    gap: Spacing.xs,
  },
  dayArrow: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.primary + '30',
  },
  datePill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.card,
    borderWidth: 1.5,
    borderColor: Colors.primary + '35',
    borderRadius: BorderRadius.full,
    paddingVertical: Spacing.sm,
    minHeight: TouchTarget.min,
    paddingHorizontal: Spacing.md,
  },
  datePillText: {
    flex: 1,
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.text,
    textAlign: 'center',
  },
  quickReserveRow: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  quickReserveButton: {
    alignSelf: 'stretch',
    minHeight: 36,
    paddingVertical: 5,
  },
  compactToolsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  compactToolsText: {
    flex: 1,
    fontSize: FontSize.sm,
    fontFamily: FontFamily.medium,
    color: Colors.textSecondary,
  },
  compactToolsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: TouchTarget.min,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  compactToolsToggleText: {
    fontSize: FontSize.xs,
    fontFamily: FontFamily.medium,
    color: Colors.textSecondary,
  },
  modalIconHit: {
    minWidth: TouchTarget.min,
    minHeight: TouchTarget.min,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressedOpacity: {
    opacity: 0.85,
  },

  // ── Modals ──
  modalOverlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    padding: Spacing.lg,
    maxHeight: '85%',
  },
  modalKeyboardAvoid: {
    flex: 1,
    width: '100%',
    justifyContent: 'flex-end',
    flexShrink: 1,
  },
  modalBookingSheet: {
    width: '100%',
    alignSelf: 'stretch',
    backgroundColor: Colors.card,
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    overflow: 'hidden',
    flexDirection: 'column',
    flexShrink: 1,
  },
  modalBookingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexShrink: 0,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  modalBookingBody: {
    flex: 1,
    minHeight: 0,
  },
  modalBookingScrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  modalBookingFooter: {
    flexShrink: 0,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    backgroundColor: Colors.card,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  modalTitle: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.text,
  },
  modalSummary: {
    backgroundColor: Colors.surface,
    marginBottom: Spacing.sm,
    borderLeftWidth: 4,
    borderLeftColor: Colors.primary,
  },
  summaryCourtName: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.text,
  },
  summaryDate: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  modalLabel: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: Spacing.sm,
  },
  dropdownToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  additionalCourtsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  recurringWrap: {
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  recurringModeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  recurringOptionsWrap: {
    gap: Spacing.xs,
  },
  recurringSectionLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  recurringDaysRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  weekChip: {
    minWidth: 34,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  weekChipSelected: {
    backgroundColor: Colors.primary + '15',
    borderColor: Colors.primary,
  },
  weekChipText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  weekChipTextSelected: {
    color: Colors.primary,
  },
  recurringSummaryBox: {
    backgroundColor: Colors.primary + '10',
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.primary + '30',
    padding: Spacing.sm,
    gap: 2,
  },
  recurringSummaryText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
  recurringSummaryTextStrong: {
    fontSize: FontSize.xs,
    color: Colors.primary,
    fontWeight: '700',
  },
  typeChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  typeChipSelected: {
    backgroundColor: Colors.primary + '15',
    borderColor: Colors.primary,
  },
  typeChipText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  typeChipTextSelected: {
    color: Colors.primary,
    fontWeight: '600',
  },
  guestFeeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  guestFeeText: { flex: 1, marginRight: Spacing.md },
  guestFeeHint: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  paidBookingHint: {
    fontSize: FontSize.xs,
    color: Colors.primary,
    marginBottom: Spacing.md,
    lineHeight: 18,
  },
  notesInput: {
    minHeight: 52,
    textAlignVertical: 'top',
    marginBottom: Spacing.sm,
  },
  timePickerRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginBottom: Spacing.sm,
  },
  timePickerColumn: {
    flex: 1,
    minHeight: PICKER_HEIGHT + Spacing.xl + Spacing.sm,
  },
  timePickerDivider: {
    paddingTop: Spacing.xl + Spacing.sm,
    paddingHorizontal: Spacing.sm,
  },
  timePickerDividerText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  durationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 6,
    backgroundColor: Colors.primary + '10',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    marginBottom: Spacing.md,
  },
  durationText: {
    fontSize: FontSize.sm,
    color: Colors.primary,
    fontWeight: '600',
  },
  confirmButton: {
    alignSelf: 'stretch',
  },

  // ── Rule Violations ──
  violationSubtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },
  violationCard: {
    flexDirection: 'row',
    gap: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: Colors.error + '08',
    borderRadius: BorderRadius.md,
    borderLeftWidth: 3,
    borderLeftColor: Colors.error,
    marginBottom: Spacing.sm,
  },
  violationRuleName: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.text,
  },
  violationMessage: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
    lineHeight: 20,
  },
});
