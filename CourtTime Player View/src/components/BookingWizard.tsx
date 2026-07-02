import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Checkbox } from './ui/checkbox';
import { Calendar, Clock, MapPin, AlertCircle, Info, Repeat } from 'lucide-react';
import { RuleViolationDialog } from './RuleViolationDialog';
import { useNotifications } from '../contexts/NotificationContext';
import {
  bookingWithDetailsToCalendarDetails,
  offerAddBookingToCalendar,
} from '../utils/bookingCalendar';
import { useAuth } from '../contexts/AuthContext';
import { useAppContext } from '../contexts/AppContext';
import { bookingApi, courtConfigApi, facilitiesApi } from '../api/client';
import {
  buildExistingBookingsMapByCourtName,
  type CourtAvailabilityData,
} from '../../shared/utils/courtAvailability';
import { toast } from 'sonner';
import { BOOKING_TYPES, RESERVATION_LABEL_TYPE_KEYS } from '../constants/bookingTypes';
import { parseLocalDate } from '../utils/dateUtils';
import { checkBookingPeakHours } from '../utils/bookingPeakHours';
import { courtBookingCheckoutUrls } from '../../shared/utils/courtBookingCheckoutUrls';
import { FEATURE_FLAGS } from '../../shared/constants/featureFlags';

interface RuleViolation {
  ruleCode: string;
  ruleName: string;
  message: string;
  severity: string;
}

interface RuleWarning {
  ruleCode: string;
  ruleName: string;
  message: string;
}

interface BookingWizardProps {
  isOpen: boolean;
  onClose: () => void;
  court: string;
  courtId: string;
  date: string;
  time: string;
  facility: string;
  facilityId: string;
  selectedSlots?: Array<{ court: string; courtId: string; time: string }>;
  onBookingCreated?: () => void;
}

// Generate all 15-min time slots from 6 AM to 9 PM in 12h format
const ALL_TIME_SLOTS: string[] = [];
for (let hour = 6; hour <= 21; hour++) {
  for (let minute = 0; minute < 60; minute += 15) {
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    ALL_TIME_SLOTS.push(`${displayHour}:${minute.toString().padStart(2, '0')} ${period}`);
  }
}

function convertTo24Hour(time12h: string): string {
  const [t, period] = time12h.split(' ');
  let [hours, minutes] = t.split(':').map(Number);
  if (period === 'PM' && hours !== 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;
  return `${hours.toString().padStart(2, '0')}:${(minutes || 0).toString().padStart(2, '0')}:00`;
}

function timeSlotIndex(time12h: string): number {
  const idx = ALL_TIME_SLOTS.indexOf(time12h);
  return idx >= 0 ? idx : 0;
}

function sortSlotsByTime<T extends { time: string }>(slots: T[]): T[] {
  return [...slots].sort((a, b) => timeSlotIndex(a.time) - timeSlotIndex(b.time));
}

function addMinutesTo12h(time12h: string, mins: number): string {
  const [t, period] = time12h.split(' ');
  let [hours, minutes] = t.split(':').map(Number);
  if (period === 'PM' && hours !== 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;
  const totalMins = hours * 60 + minutes + mins;
  const newH = Math.floor(totalMins / 60);
  const newM = totalMins % 60;
  const newPeriod = newH >= 12 ? 'PM' : 'AM';
  const displayH = newH > 12 ? newH - 12 : newH === 0 ? 12 : newH;
  return `${displayH}:${newM.toString().padStart(2, '0')} ${newPeriod}`;
}

function durationMinutesBetween(start12h: string, end12h: string): number {
  const s = convertTo24Hour(start12h);
  const e = convertTo24Hour(end12h);
  const [sh, sm] = s.split(':').map(Number);
  const [eh, em] = e.split(':').map(Number);
  return (eh * 60 + em) - (sh * 60 + sm);
}

export function BookingWizard({ isOpen, onClose, court, courtId, date, time, facility, facilityId, selectedSlots, onBookingCreated }: BookingWizardProps) {
  const [startTime, setStartTime] = useState(time);
  const [endTime, setEndTime] = useState(() => {
    if (selectedSlots && selectedSlots.length > 1) {
      const sorted = sortSlotsByTime(selectedSlots);
      return addMinutesTo12h(sorted[sorted.length - 1].time, 15);
    }
    return addMinutesTo12h(time, 60);
  });
  const [bookingType, setBookingType] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [ruleViolations, setRuleViolations] = useState<RuleViolation[]>([]);
  const [ruleWarnings, setRuleWarnings] = useState<RuleWarning[]>([]);
  const [isPrimeTime, setIsPrimeTime] = useState(false);
  const [advancedBooking, setAdvancedBooking] = useState(false);
  const [recurringDays, setRecurringDays] = useState<string[]>([]);
  const [recurringEndDate, setRecurringEndDate] = useState('');
  const [facilityCourts, setFacilityCourts] = useState<
    Array<{
      id: string;
      name: string;
      status: string;
      isWalkUp?: boolean;
      requirePayment?: boolean;
      bookingAmountCents?: number | null;
      guestFeeCents?: number | null;
      ballMachineFeeCents?: number | null;
    }>
  >([]);
  const [guestCount, setGuestCount] = useState(0);
  const [guestNames, setGuestNames] = useState<string[]>([]);
  const [addBallMachine, setAddBallMachine] = useState(false);
  const [existingBookings, setExistingBookings] = useState<Record<string, Set<string>>>({});
  const [additionalCourtIds, setAdditionalCourtIds] = useState<string[]>([]);
  const { showToast, addNotification } = useNotifications();
  const { user } = useAuth();
  const { enabledFeatures } = useAppContext();
  const isAdmin = user?.userType === 'admin';
  const canUseRecurring = isAdmin || enabledFeatures.includes(FEATURE_FLAGS.PLAYER_RECURRING_BOOKINGS);

  // Fetch all courts for this facility when wizard opens
  useEffect(() => {
    if (isOpen && facilityId) {
      facilitiesApi.getCourts(facilityId).then(res => {
        if (res.success && res.data?.courts) {
          setFacilityCourts(res.data.courts.filter((c: any) => c.status === 'available' && !c.isWalkUp));
        }
      });
    }
  }, [isOpen, facilityId]);

  // Per-court availability (same API as mobile book flow)
  useEffect(() => {
    if (!isOpen || !facilityId || !date || facilityCourts.length === 0) return;
    let cancelled = false;

    (async () => {
      const byCourtId: Record<string, CourtAvailabilityData> = {};
      await Promise.all(
        facilityCourts.map(async (c) => {
          const res = await courtConfigApi.getAvailability(c.id, date);
          if (res.success && res.data) {
            byCourtId[c.id] = res.data as CourtAvailabilityData;
          }
        })
      );
      if (cancelled) return;
      setExistingBookings(
        buildExistingBookingsMapByCourtName(
          facilityCourts.map((c) => ({ id: c.id, name: c.name })),
          byCourtId
        )
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, facilityId, date, facilityCourts]);

  // Build the primary court set from drag selection
  const dragSelectedCourts = useMemo(() => {
    if (!selectedSlots || selectedSlots.length === 0) return [{ court, courtId }];
    const seen = new Map<string, string>();
    for (const slot of selectedSlots) {
      if (!seen.has(slot.courtId)) {
        seen.set(slot.courtId, slot.court);
      }
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ court: name, courtId: id }));
  }, [selectedSlots, court, courtId]);

  // Merge drag-selected courts + manually checked additional courts
  const selectedCourts = useMemo(() => {
    const merged = new Map<string, string>();
    for (const c of dragSelectedCourts) {
      merged.set(c.courtId, c.court);
    }
    for (const id of additionalCourtIds) {
      if (!merged.has(id)) {
        const fc = facilityCourts.find(c => c.id === id);
        if (fc) merged.set(fc.id, fc.name);
      }
    }
    return Array.from(merged.entries()).map(([id, name]) => ({ court: name, courtId: id }));
  }, [dragSelectedCourts, additionalCourtIds, facilityCourts]);

  const hasPaidCourt = useMemo(() => {
    return selectedCourts.some((c) => {
      const meta = facilityCourts.find((fc) => fc.id === c.courtId);
      return meta?.requirePayment && meta?.bookingAmountCents;
    });
  }, [selectedCourts, facilityCourts]);

  const primaryCourtGuestFeeCents = useMemo(() => {
    if (selectedCourts.length !== 1) return null;
    const meta = facilityCourts.find((fc) => fc.id === selectedCourts[0].courtId);
    return meta?.guestFeeCents ?? null;
  }, [selectedCourts, facilityCourts]);

  const primaryCourtBallMachineFeeCents = useMemo(() => {
    if (selectedCourts.length !== 1) return null;
    const meta = facilityCourts.find((fc) => fc.id === selectedCourts[0].courtId);
    return meta?.ballMachineFeeCents ?? null;
  }, [selectedCourts, facilityCourts]);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      if (selectedSlots && selectedSlots.length > 1) {
        const sorted = sortSlotsByTime(selectedSlots);
        setStartTime(sorted[0].time);
        setEndTime(addMinutesTo12h(sorted[sorted.length - 1].time, 15));
      } else {
        setStartTime(time);
        setEndTime(addMinutesTo12h(time, 60));
      }
      setBookingType('');
      setNotes('');
      setRuleViolations([]);
      setRuleWarnings([]);
      setIsPrimeTime(false);
      setAdvancedBooking(false);
      setRecurringDays([]);
      setRecurringEndDate('');
      setAdditionalCourtIds([]);
      setGuestCount(0);
      setGuestNames([]);
      setAddBallMachine(false);
    }
  }, [selectedSlots, isOpen, time]);

  // End time options: only times after the selected start time
  const endTimeOptions = useMemo(() => {
    const startIdx = timeSlotIndex(startTime);
    return ALL_TIME_SLOTS.slice(startIdx + 1);
  }, [startTime]);

  // Computed duration label
  const durationMins = useMemo(() => durationMinutesBetween(startTime, endTime), [startTime, endTime]);
  const durationLabel = useMemo(() => {
    if (durationMins <= 0) return '';
    const h = Math.floor(durationMins / 60);
    const m = durationMins % 60;
    if (h === 0) return `${m} min`;
    if (m === 0) return `${h} hr`;
    return `${h} hr ${m} min`;
  }, [durationMins]);

  // Per-hour rate for a single paid court; total scales with selected duration
  const primaryCourtHourlyRateCents = useMemo(() => {
    if (selectedCourts.length !== 1) return null;
    const meta = facilityCourts.find((fc) => fc.id === selectedCourts[0].courtId);
    return (meta?.requirePayment && meta?.bookingAmountCents) ? meta.bookingAmountCents : null;
  }, [selectedCourts, facilityCourts]);

  const courtTotalAmountCents = useMemo(() => {
    if (!primaryCourtHourlyRateCents || durationMins <= 0) return null;
    return Math.round(primaryCourtHourlyRateCents * (durationMins / 60));
  }, [primaryCourtHourlyRateCents, durationMins]);

  const ballMachineTotalCents = useMemo(() => {
    if (!addBallMachine || !primaryCourtBallMachineFeeCents || durationMins <= 0) return 0;
    return Math.round(primaryCourtBallMachineFeeCents * (durationMins / 60));
  }, [addBallMachine, primaryCourtBallMachineFeeCents, durationMins]);

  const guestFeeTotalCents = useMemo(() => {
    if (guestCount <= 0 || !primaryCourtGuestFeeCents) return 0;
    return primaryCourtGuestFeeCents * guestCount;
  }, [guestCount, primaryCourtGuestFeeCents]);

  const checkoutTotalCents = (courtTotalAmountCents ?? 0) + guestFeeTotalCents + ballMachineTotalCents;

  const primaryCourtId = selectedCourts[0]?.courtId || courtId;

  const bookingDateYmd = useMemo(() => {
    if (date.match(/^\d{4}-\d{2}-\d{2}$/)) return date;
    if (date.includes('T')) return date.split('T')[0];
    const parsed = parseLocalDate(date);
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
  }, [date]);

  // Peak-hours status from rules engine (same logic as booking validation)
  useEffect(() => {
    if (!isOpen || !user?.id || !primaryCourtId || !facilityId || durationMins <= 0) {
      setIsPrimeTime(false);
      return;
    }

    let cancelled = false;
    const run = async () => {
      const result = await checkBookingPeakHours({
        courtId: primaryCourtId,
        userId: user.id,
        facilityId,
        bookingDate: bookingDateYmd,
        startTime12h: startTime,
        endTime12h: endTime,
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
    primaryCourtId,
    facilityId,
    bookingDateYmd,
    startTime,
    endTime,
    durationMins,
  ]);

  const toggleRecurringDay = (day: string) => {
    setRecurringDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  const toggleAdditionalCourt = (id: string) => {
    setAdditionalCourtIds(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  // Courts available to add (exclude primary/drag-selected, only show available during selected time)
  const availableAdditionalCourts = useMemo(() => {
    const dragIds = new Set(dragSelectedCourts.map(c => c.courtId));
    const others = facilityCourts.filter(c => !dragIds.has(c.id));

    if (!startTime || !endTime) return others;

    // Build the set of 15-min slots for the selected time range
    const start24 = convertTo24Hour(startTime);
    const end24 = convertTo24Hour(endTime);
    const [sh, sm] = start24.split(':').map(Number);
    const [eh, em] = end24.split(':').map(Number);
    const slots: string[] = [];
    let t = sh * 60 + sm;
    const endMin = eh * 60 + em;
    while (t < endMin) {
      const hh = Math.floor(t / 60);
      const mm = t % 60;
      slots.push(`${hh.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`);
      t += 15;
    }

    return others.filter(c => {
      const booked = existingBookings[c.name];
      if (!booked) return true;
      return !slots.some(s => booked.has(s));
    });
  }, [facilityCourts, dragSelectedCourts, startTime, endTime, existingBookings]);

  const getDayOfWeek = (d: Date): string => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[d.getDay()];
  };

  const generateRecurringDates = (): string[] => {
    if (!advancedBooking || recurringDays.length === 0 || !recurringEndDate) {
      return [date];
    }
    const dates: string[] = [];
    const start = parseLocalDate(date);
    const end = parseLocalDate(recurringEndDate);
    const current = new Date(start);
    while (current <= end) {
      if (recurringDays.includes(getDayOfWeek(current))) {
        const y = current.getFullYear();
        const mo = String(current.getMonth() + 1).padStart(2, '0');
        const dd = String(current.getDate()).padStart(2, '0');
        dates.push(`${y}-${mo}-${dd}`);
      }
      current.setDate(current.getDate() + 1);
    }
    return dates;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user?.id) {
      showToast('error', 'Error', 'You must be logged in to book a court.');
      return;
    }

    if (durationMins <= 0) {
      showToast('error', 'Error', 'End time must be after start time.');
      return;
    }

    if (advancedBooking) {
      if (recurringDays.length === 0) {
        showToast('error', 'Error', 'Please select at least one day of the week for recurring bookings.');
        return;
      }
      if (!recurringEndDate) {
        showToast('error', 'Error', 'Please select an end date for recurring bookings.');
        return;
      }
    }

    setIsSubmitting(true);

    try {
      const checkoutReturnUrls =
        typeof window !== 'undefined' ? courtBookingCheckoutUrls(window.location.origin) : undefined;

      const parseDateStr = (dateStr: string): string => {
        if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) return dateStr;
        if (dateStr.includes('T')) return dateStr.split('T')[0];
        const parsed = new Date(dateStr + ' 12:00:00');
        return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
      };

      const startTime24 = convertTo24Hour(startTime);
      const endTime24 = convertTo24Hour(endTime);
      const datesToBook = generateRecurringDates().map(d => parseDateStr(d));

      const paidCourtInSelection = selectedCourts.some((c) => {
        const meta = facilityCourts.find((fc) => fc.id === c.courtId);
        return meta?.requirePayment && meta?.bookingAmountCents;
      });
      const requiresSingleBooking =
        paidCourtInSelection ||
        (guestCount > 0 && Boolean(primaryCourtGuestFeeCents)) ||
        (addBallMachine && Boolean(primaryCourtBallMachineFeeCents));
      if (requiresSingleBooking && (advancedBooking || selectedCourts.length > 1 || datesToBook.length > 1)) {
        showToast(
          'error',
          'Paid courts',
          'Paid courts, guest fees, and ball machine rentals must be booked one reservation at a time (no recurring or multi-court checkout).'
        );
        setIsSubmitting(false);
        return;
      }

      const bookingRequests = selectedCourts.flatMap(c =>
        datesToBook.map(bookingDate => ({
          courtId: c.courtId,
          courtName: c.court,
          userId: user.id,
          facilityId,
          bookingDate,
          startTime: startTime24,
          endTime: endTime24,
          durationMinutes: durationMins,
          bookingType: bookingType || undefined,
          notes: notes || undefined
        }))
      );

      const isRecurringSeries = advancedBooking;
      const results = isRecurringSeries
        ? [await bookingApi.createRecurringSeries({
            userId: user.id,
            facilityId,
            bookingType: bookingType || undefined,
            notes: notes || undefined,
            instances: bookingRequests.map(({ courtName, ...req }) => req)
          })]
        : await (async () => {
            const out: Awaited<ReturnType<typeof bookingApi.create>>[] = [];
            const prior: Array<{
              bookingDate: string;
              courtId: string;
              startTime: string;
              endTime: string;
              durationMinutes: number;
            }> = [];
            for (const { courtName: _c, ...req } of bookingRequests) {
              const res = await bookingApi.create({
                ...req,
                ...checkoutReturnUrls,
                guestCount: guestCount > 0 ? guestCount : undefined,
                guestNames: guestCount > 0 && guestNames.some(n => n.trim()) ? guestNames.slice(0, guestCount) : undefined,
                bringGuest: guestCount > 0 || undefined,
                addBallMachine: addBallMachine || undefined,
                provisionalSameRequestBookings: prior.length > 0 ? [...prior] : undefined
              });
              if (res.requiresPayment && res.checkoutUrl) {
                sessionStorage.setItem(
                  'courtBookingCheckoutPending',
                  JSON.stringify({
                    courtId: req.courtId,
                    bookingDate: req.bookingDate,
                    facilityId,
                  })
                );
                toast.info('Complete card payment to confirm your court reservation.');
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

      const paymentResult = results.find((r) => r.requiresPayment && r.checkoutUrl);
      if (paymentResult?.checkoutUrl) {
        return;
      }

      const successfulBookings = results.filter(
        (r) => r.success && !r.requiresPayment && (r as { booking?: unknown }).booking
      );
      const failedBookings = results.filter((r) => !r.success);
      const totalRequests = bookingRequests.length;

      if (successfulBookings.length > 0) {
        const courtLabel = selectedCourts.length > 1
          ? `${selectedCourts.length} courts`
          : court;
        const msg = totalRequests > 1
          ? `${successfulBookings.length} of ${totalRequests} bookings created for ${courtLabel} at ${facility}.`
          : `Your ${court} booking at ${facility} has been confirmed.`;

        const reservationMeta = { facility, court, date, time: `${startTime} - ${endTime}` };
        addNotification({
          type: 'reservation_confirmed',
          title: 'Court Reservation Confirmed',
          message: msg,
          priority: 'high',
          relatedReservation: reservationMeta,
        });

        const calendarDetails =
          successfulBookings.length === 1
            ? bookingWithDetailsToCalendarDetails({
                courtName: court,
                facilityName: facility,
                bookingDate: parseDateStr(date),
                startTime: startTime24,
                endTime: endTime24,
                bookingType: bookingType || undefined,
                notes: notes || undefined,
              })
            : null;

        const createdBookingId = (
          successfulBookings[0] as { booking?: { id?: string } }
        )?.booking?.id;

        offerAddBookingToCalendar(msg, calendarDetails, {
          alertTitle: 'Court Reservation Confirmed',
          bookingId: createdBookingId,
        });

        if (onBookingCreated) {
          await onBookingCreated();
        }

        if (failedBookings.length > 0) {
          const violations = failedBookings
            .filter(r => r.ruleViolations && r.ruleViolations.length > 0)
            .flatMap(r => r.ruleViolations!);
          if (violations.length > 0) {
            setRuleViolations(violations);
          } else {
            showToast('error', 'Some Bookings Failed', `${failedBookings.length} booking(s) could not be created.`);
          }
        } else {
          onClose();
        }
      } else {
        const firstResult = results[0];
        if (firstResult?.ruleViolations && firstResult.ruleViolations.length > 0) {
          setRuleViolations(firstResult.ruleViolations);
        } else {
          setRuleViolations([]);
        }
        if (firstResult?.warnings && firstResult.warnings.length > 0) {
          setRuleWarnings(firstResult.warnings);
        }
        if (firstResult?.isPrimeTime !== undefined) {
          setIsPrimeTime(firstResult.isPrimeTime);
        }
        if (!firstResult?.ruleViolations || firstResult.ruleViolations.length === 0) {
          showToast('error', 'Booking Failed', firstResult?.error || 'Failed to create booking. Please try again.');
        }
      }
    } catch (error) {
      console.error('Booking error:', error);
      showToast('error', 'Booking Failed', 'An error occurred while creating your booking.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDateForDisplay = (dateStr: string): string => {
    if (dateStr.includes('-') && dateStr.split('-').length === 3) {
      const [year, month, day] = dateStr.split('-');
      const dateObj = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      return dateObj.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    }
    return dateStr;
  };

  return (
    <Dialog open={isOpen} onOpenChange={() => !isSubmitting && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[90dvh] sm:max-h-[calc(100dvh-5rem)] overflow-y-auto sm:top-4 sm:translate-y-0">
        <DialogHeader>
          <DialogTitle>Book Court</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Court & Facility Info */}
          <div className="space-y-2">
            <div className="flex items-center gap-3 text-sm text-gray-600">
              <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{facility}</span>
              <span className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />{formatDateForDisplay(date)}</span>
            </div>
            <div className="rounded-md border border-green-200 bg-green-50 p-2.5 shadow-sm">
              <div className="flex items-center gap-2 text-green-800">
                <Clock className="h-4 w-4" />
                <span className="font-medium">
                  {selectedCourts.length > 1
                    ? `${selectedCourts.length} Courts: ${selectedCourts.map(c => c.court).join(', ')}`
                    : court}
                </span>
              </div>
              <div className="text-sm text-green-600 mt-0.5">
                {startTime} - {endTime} ({durationLabel})
              </div>
            </div>
          </div>

          {/* Rule Violations Dialog */}
          <RuleViolationDialog
            open={ruleViolations.length > 0}
            onClose={() => setRuleViolations([])}
            violations={ruleViolations}
          />

          {/* Rule Warnings */}
          {ruleWarnings.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-md p-3 space-y-2">
              <div className="flex items-center gap-2 text-amber-800 font-medium text-sm">
                <Info className="h-4 w-4" />
                Heads up
              </div>
              <ul className="space-y-1">
                {ruleWarnings.map((w, i) => (
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

          {/* Start Time + End Time */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Start Time</Label>
              <Select value={startTime} onValueChange={(val) => {
                setStartTime(val);
                if (timeSlotIndex(val) >= timeSlotIndex(endTime)) {
                  setEndTime(addMinutesTo12h(val, 60));
                }
              }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALL_TIME_SLOTS.map((slot) => (
                    <SelectItem key={slot} value={slot}>{slot}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>End Time</Label>
              <Select value={endTime} onValueChange={setEndTime}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {endTimeOptions.map((slot) => (
                    <SelectItem key={slot} value={slot}>{slot}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Booking Type Dropdown */}
          <div className="space-y-2">
            <Label>Type (Optional)</Label>
            <Select value={bookingType} onValueChange={setBookingType}>
              <SelectTrigger>
                <SelectValue placeholder="Select booking type..." />
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
            />
          </div>

          {/* Recurring Booking - admins always; players when enabled for the facility */}
          {canUseRecurring && (
          <div className="flex items-center gap-2 pt-2">
            <Checkbox
              id="recurring-booking"
              checked={advancedBooking}
              onCheckedChange={(checked) => setAdvancedBooking(checked === true)}
            />
            <Label htmlFor="recurring-booking" className="text-sm font-medium cursor-pointer flex items-center gap-1.5">
              <Repeat className="h-3.5 w-3.5" />
              Recurring Booking
            </Label>
          </div>
          )}

          {advancedBooking && canUseRecurring && (
            <div className="space-y-3 rounded-md border border-border bg-muted/40 p-3">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Select Days of the Week</Label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day) => (
                    <div key={day} className="flex items-center gap-2">
                      <Checkbox
                        id={`bw-day-${day}`}
                        checked={recurringDays.includes(day)}
                        onCheckedChange={() => toggleRecurringDay(day)}
                      />
                      <Label htmlFor={`bw-day-${day}`} className="text-xs cursor-pointer">
                        {day.slice(0, 3)}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="bw-recurring-end" className="text-sm font-medium">
                  Repeat Until
                </Label>
                <Input
                  id="bw-recurring-end"
                  type="date"
                  value={recurringEndDate}
                  onChange={(e) => setRecurringEndDate(e.target.value)}
                  min={date}
                  className="w-full"
                />
              </div>

              {recurringDays.length > 0 && recurringEndDate && (
                <div className="text-xs text-gray-600 bg-green-50 p-2 rounded border border-green-200">
                  <span className="font-medium">Will create bookings:</span>
                  <div className="mt-1">
                    Every {recurringDays.join(', ')} from {parseLocalDate(date).toLocaleDateString()} to {parseLocalDate(recurringEndDate).toLocaleDateString()}
                  </div>
                  <div className="mt-1 font-medium">
                    Total bookings: {generateRecurringDates().length * selectedCourts.length}
                    {selectedCourts.length > 1 && ` (${generateRecurringDates().length} dates × ${selectedCourts.length} courts)`}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Additional Courts */}
          {availableAdditionalCourts.length > 0 && (
            <div className="space-y-2 pt-2">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                Add Additional Court
              </Label>
              <Select
                value=""
                onValueChange={(value) => toggleAdditionalCourt(value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a court to add" />
                </SelectTrigger>
                <SelectContent>
                  {availableAdditionalCourts
                    .filter(c => !additionalCourtIds.includes(c.id))
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {additionalCourtIds.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {additionalCourtIds.map(id => {
                    const c = facilityCourts.find(fc => fc.id === id);
                    return c ? (
                      <span key={id} className="inline-flex items-center gap-1 rounded-md border border-green-200 bg-green-50 px-2 py-1 text-xs text-green-800">
                        {c.name}
                        <button
                          type="button"
                          onClick={() => toggleAdditionalCourt(id)}
                          className="rounded-sm transition-colors hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                        >
                          ×
                        </button>
                      </span>
                    ) : null;
                  })}
                </div>
              )}
            </div>
          )}

          {/* Court fee */}
          {courtTotalAmountCents != null && selectedCourts.length === 1 && (
            <div className="flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
              <span className="text-amber-800 font-medium">Court fee</span>
              <span className="text-amber-900 font-semibold">
                ${(courtTotalAmountCents / 100).toFixed(2)}
                <span className="text-amber-600 font-normal ml-1">
                  (${(primaryCourtHourlyRateCents! / 100).toFixed(2)}/hr × {durationLabel})
                </span>
              </span>
            </div>
          )}

          {/* Guest fee */}
          {primaryCourtGuestFeeCents && selectedCourts.length === 1 && !advancedBooking && (
            <div className="space-y-2 pt-2">
              <Label className="text-sm font-medium">
                Guests (${(primaryCourtGuestFeeCents / 100).toFixed(2)} per guest, max 3)
              </Label>
              <div className="flex items-center gap-2">
                {[0, 1, 2, 3].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => {
                      setGuestCount(n);
                      setGuestNames(prev => Array.from({ length: n }, (_, i) => prev[i] || ''));
                    }}
                    className={`w-10 h-10 rounded-md border text-sm font-medium transition-colors ${
                      guestCount === n
                        ? 'border-green-600 bg-green-600 text-white'
                        : 'border-gray-300 bg-white text-gray-700 hover:border-green-400'
                    }`}
                  >
                    {n === 0 ? 'None' : n}
                  </button>
                ))}
                {guestCount > 0 && (
                  <span className="text-sm text-gray-600 ml-1">
                    = ${((primaryCourtGuestFeeCents * guestCount) / 100).toFixed(2)} guest fee
                  </span>
                )}
              </div>
              {guestCount > 0 && (
                <div className="space-y-2 pt-1">
                  {Array.from({ length: guestCount }, (_, i) => (
                    <Input
                      key={i}
                      placeholder={`Guest ${i + 1} name`}
                      value={guestNames[i] || ''}
                      onChange={(e) => {
                        const updated = [...guestNames];
                        updated[i] = e.target.value;
                        setGuestNames(updated);
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Ball machine */}
          {primaryCourtBallMachineFeeCents && selectedCourts.length === 1 && !advancedBooking && (
            <div className="flex items-center justify-between gap-4 rounded-md border px-3 py-2">
              <div>
                <Label htmlFor="addBallMachine" className="text-sm font-medium cursor-pointer">
                  Add ball machine
                </Label>
                <p className="text-xs text-gray-500">
                  ${(primaryCourtBallMachineFeeCents / 100).toFixed(2)}/hr
                  {addBallMachine && durationLabel ? ` × ${durationLabel} = $${(ballMachineTotalCents / 100).toFixed(2)}` : ''}
                </p>
              </div>
              <Checkbox
                id="addBallMachine"
                checked={addBallMachine}
                onCheckedChange={(checked) => setAddBallMachine(checked === true)}
              />
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2 pt-4">
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
              disabled={isSubmitting}
              className="flex-1"
            >
              {isSubmitting ? 'Booking...' : selectedCourts.length > 1 ? `Book ${selectedCourts.length} Courts` : (hasPaidCourt || guestFeeTotalCents > 0 || ballMachineTotalCents > 0) ? `Pay $${(checkoutTotalCents / 100).toFixed(2)} and Book` : 'Book Court'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
